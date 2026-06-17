import { createPublicClient, http } from "viem";
import { getChain } from "@/lib/chains";
import { dataProviderAbi, oracleAbi, poolAbi } from "./abi";

/**
 * One reserve's base (non-E-Mode) parameters and current Aave Oracle price. The
 * catalog is the menu a Hypothetical Position is built from (see ADR 0007): the
 * user supplies amounts, every other field here is read on-chain.
 */
export type CatalogReserve = {
  symbol: string;
  asset: `0x${string}`;
  decimals: number;
  priceUsd: number;
  /** base reserve liquidation threshold as a fraction, e.g. 0.78. */
  liquidationThreshold: number;
  /** base reserve liquidation bonus as a fraction, e.g. 0.07. */
  liquidationBonus: number;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
};

/** An E-Mode category's collateral parameters (thresholds in basis points). */
export type EModeCategory = {
  id: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  collateralBitmap: bigint;
};

export type ReserveCatalog = {
  chainId: number;
  reserves: CatalogReserve[];
  eModeCategories: EModeCategory[];
  /** address (lowercased) -> reserve id; the bit position in E-Mode bitmaps. */
  reserveIds: Record<string, number>;
};

// Aave exposes no count of E-Mode categories, so we probe a small fixed range of
// ids and keep the ones that resolve to a real category (a non-zero threshold).
const EMODE_PROBE_IDS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Read a chain's full reserve catalog (every reserve's config + Oracle price) and
 * its E-Mode categories in one batch. This is the prefetch a Hypothetical Position
 * editor runs once on open, so adding assets afterward is instant and offline.
 */
export async function readReserveCatalog(
  chainId: number,
): Promise<ReserveCatalog> {
  const cfg = getChain(chainId);
  if (!cfg) throw new Error(`Unsupported chain: ${chainId}`);
  const client = createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpc, { timeout: 12_000 }),
  });

  const [tokens, reservesList, baseUnit] = await Promise.all([
    client.readContract({
      address: cfg.dataProvider,
      abi: dataProviderAbi,
      functionName: "getAllReservesTokens",
    }),
    client.readContract({
      address: cfg.pool,
      abi: poolAbi,
      functionName: "getReservesList",
    }),
    client.readContract({
      address: cfg.oracle,
      abi: oracleAbi,
      functionName: "BASE_CURRENCY_UNIT",
    }),
  ]);

  const tokenAddrs = tokens.map((t) => t.tokenAddress);

  const [configs, prices] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: tokens.map((t) => ({
        address: cfg.dataProvider,
        abi: dataProviderAbi,
        functionName: "getReserveConfigurationData",
        args: [t.tokenAddress],
      })),
    }),
    client.readContract({
      address: cfg.oracle,
      abi: oracleAbi,
      functionName: "getAssetsPrices",
      args: [tokenAddrs],
    }),
  ]);

  const base = Number(baseUnit);
  const reserves: CatalogReserve[] = tokens.map((t, i) => {
    const c = configs[i] as unknown as readonly [
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
    return {
      symbol: t.symbol,
      asset: t.tokenAddress,
      decimals: Number(c[0]),
      priceUsd: Number(prices[i]) / base,
      liquidationThreshold: Number(c[2]) / 10_000,
      liquidationBonus: Number(c[3]) / 10_000 - 1, // 10700 -> 0.07
      usageAsCollateralEnabled: c[5],
      borrowingEnabled: c[6],
    };
  });

  const reserveIds: Record<string, number> = {};
  reservesList.forEach((addr, id) => {
    reserveIds[addr.toLowerCase()] = id;
  });

  const emode = await client.multicall({
    allowFailure: true,
    contracts: EMODE_PROBE_IDS.flatMap((id) => [
      {
        address: cfg.pool,
        abi: poolAbi,
        functionName: "getEModeCategoryCollateralConfig",
        args: [id],
      },
      {
        address: cfg.pool,
        abi: poolAbi,
        functionName: "getEModeCategoryCollateralBitmap",
        args: [id],
      },
    ]),
  });

  const eModeCategories: EModeCategory[] = [];
  EMODE_PROBE_IDS.forEach((id, k) => {
    const confRes = emode[2 * k];
    const bmRes = emode[2 * k + 1];
    if (confRes.status !== "success" || bmRes.status !== "success") return;
    const conf = confRes.result as unknown as {
      ltv: number;
      liquidationThreshold: number;
      liquidationBonus: number;
    };
    if (!conf || conf.liquidationThreshold === 0) return; // unused id
    eModeCategories.push({
      id,
      liquidationThresholdBps: conf.liquidationThreshold,
      liquidationBonusBps: conf.liquidationBonus,
      collateralBitmap: bmRes.result as unknown as bigint,
    });
  });

  return { chainId, reserves, eModeCategories, reserveIds };
}
