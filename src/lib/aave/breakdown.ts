import { createPublicClient, http, getAddress, formatUnits } from "viem";
import { getChain } from "@/lib/chains";
import { dataProviderAbi, oracleAbi, poolAbi } from "./abi";
import { readPosition, type Position } from "./position";
import { applyEModeOverrides, reconcile } from "./positionMath";

/** One asset's contribution to a Position, priced with the Aave Oracle. */
export type AssetPosition = {
  symbol: string;
  asset: `0x${string}`;
  decimals: number;
  priceUsd: number;
  /** aToken balance counted as collateral (0 when not enabled as collateral). */
  collateralAmount: number;
  collateralUsd: number;
  /** variable + stable debt. */
  debtAmount: number;
  debtUsd: number;
  /** reserve-level liquidation threshold as a fraction, e.g. 0.78. */
  liquidationThreshold: number;
  /** reserve-level liquidation bonus as a fraction, e.g. 0.07 (105% bonus => 0.05). */
  liquidationBonus: number;
};

export type PositionBreakdown = {
  position: Position; // aggregate, from getUserAccountData (E-Mode-correct)
  assets: AssetPosition[];
  eModeCategory: number;
  /**
   * Whether the per-asset reconstruction matches the aggregate within tolerance.
   * E-Mode's raised thresholds are applied below, so this should hold for E-Mode
   * positions too; a false value flags an unmodeled case and the UI warns.
   */
  reconciles: boolean;
  /**
   * "watched" — read from a Watched Address on-chain (the default when omitted).
   * "hypothetical" — synthesized from user-supplied amounts (see ADR 0007); the
   * aggregate reconciles by construction and the reconcile warning is suppressed.
   */
  source?: "watched" | "hypothetical";
};

export async function readBreakdown(
  chainId: number,
  rawAddress: string,
): Promise<PositionBreakdown> {
  const cfg = getChain(chainId);
  if (!cfg) throw new Error(`Unsupported chain: ${chainId}`);
  const user = getAddress(rawAddress);
  const client = createPublicClient({
    chain: cfg.chain,
    // Pinned public endpoint (viem's chain default is unreliable for some
    // chains). Bounded timeout so a dead RPC fails fast.
    transport: http(cfg.rpc, {
      timeout: 12_000,
    }),
  });

  const [position, tokens, eMode] = await Promise.all([
    readPosition(chainId, rawAddress),
    client.readContract({
      address: cfg.dataProvider,
      abi: dataProviderAbi,
      functionName: "getAllReservesTokens",
    }),
    client.readContract({
      address: cfg.pool,
      abi: poolAbi,
      functionName: "getUserEMode",
      args: [user],
    }),
  ]);

  // Nothing on Aave for this address/chain (also covers non-existent wallets):
  // getUserAccountData reports zero collateral and zero debt. Skip the per-asset
  // multicall and oracle reads — they scan every reserve and, on a slow or
  // rate-limited public RPC, are what make an empty wallet appear to hang.
  if (position.totalCollateralUsd === 0 && position.totalDebtUsd === 0) {
    return {
      position,
      assets: [],
      eModeCategory: Number(eMode),
      reconciles: true,
      source: "watched",
    };
  }

  const tokenAddrs = tokens.map((t) => t.tokenAddress);

  // Per-asset config + user balances, batched via multicall.
  const perAsset = await client.multicall({
    allowFailure: false,
    contracts: tokens.flatMap((t) => [
      {
        address: cfg.dataProvider,
        abi: dataProviderAbi,
        functionName: "getReserveConfigurationData",
        args: [t.tokenAddress],
      },
      {
        address: cfg.dataProvider,
        abi: dataProviderAbi,
        functionName: "getUserReserveData",
        args: [t.tokenAddress, user],
      },
    ]),
  });

  const [prices, baseUnit] = await Promise.all([
    client.readContract({
      address: cfg.oracle,
      abi: oracleAbi,
      functionName: "getAssetsPrices",
      args: [tokenAddrs],
    }),
    client.readContract({
      address: cfg.oracle,
      abi: oracleAbi,
      functionName: "BASE_CURRENCY_UNIT",
    }),
  ]);

  const base = Number(baseUnit);
  const assets: AssetPosition[] = [];

  tokens.forEach((t, i) => {
    const reserveCfg = perAsset[2 * i] as unknown as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      boolean,
      boolean,
      boolean,
      boolean,
      boolean,
    ];
    const userData = perAsset[2 * i + 1] as unknown as readonly [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
      boolean,
    ];

    const decimals = Number(reserveCfg[0]);
    const liquidationThreshold = Number(reserveCfg[2]) / 10_000;
    const liquidationBonus = Number(reserveCfg[3]) / 10_000 - 1; // 10700 -> 0.07
    const priceUsd = Number(prices[i]) / base;

    const usageAsCollateral = userData[8];
    const aTokenBalance = userData[0];
    const debtRaw = userData[1] + userData[2]; // stable + variable

    const collateralAmount =
      usageAsCollateral && aTokenBalance > 0n
        ? Number(formatUnits(aTokenBalance, decimals))
        : 0;
    const debtAmount =
      debtRaw > 0n ? Number(formatUnits(debtRaw, decimals)) : 0;

    if (collateralAmount === 0 && debtAmount === 0) return; // untouched reserve

    assets.push({
      symbol: t.symbol,
      asset: t.tokenAddress,
      decimals,
      priceUsd,
      collateralAmount,
      collateralUsd: collateralAmount * priceUsd,
      debtAmount,
      debtUsd: debtAmount * priceUsd,
      liquidationThreshold,
      liquidationBonus,
    });
  });

  const eModeCategory = Number(eMode);
  if (eModeCategory > 0) {
    await applyEMode(client, cfg.pool, eModeCategory, assets);
  }

  return {
    position,
    assets,
    eModeCategory,
    reconciles: reconcile(position, assets),
  };
}

/**
 * Override the liquidation threshold and bonus for collateral that is enabled in
 * the user's active E-Mode category (Aave v3.2). Mirrors GenericLogic: an asset
 * uses the category's threshold when its reserve-id bit is set in the category's
 * collateral bitmap, otherwise it keeps its base reserve value.
 */
async function applyEMode(
  client: ReturnType<typeof createPublicClient>,
  pool: `0x${string}`,
  category: number,
  assets: AssetPosition[],
): Promise<void> {
  const [collateralConfig, bitmap, reservesList] = await Promise.all([
    client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getEModeCategoryCollateralConfig",
      args: [category],
    }),
    client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getEModeCategoryCollateralBitmap",
      args: [category],
    }),
    client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getReservesList",
    }),
  ]);

  const idByAsset = new Map(
    reservesList.map((addr, id) => [addr.toLowerCase(), id]),
  );
  applyEModeOverrides(
    assets,
    collateralConfig.liquidationThreshold,
    collateralConfig.liquidationBonus,
    bitmap,
    idByAsset,
  );
}
