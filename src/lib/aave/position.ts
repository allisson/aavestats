import { getAddress, formatUnits } from "viem";
import { poolAbi } from "./abi";
import { aaveClient } from "./client";

/**
 * Aggregate snapshot of a Position, read from Aave v3's Pool.getUserAccountData.
 * All USD values are denominated in the Aave Oracle's base currency (8 decimals),
 * so they reflect Aave's own prices — not market prices (see docs/adr/0002).
 */
export type Position = {
  chainId: number;
  address: string;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  /** Weighted liquidation threshold as a fraction, e.g. 0.825. */
  liquidationThreshold: number;
  /** Weighted max LTV as a fraction. */
  ltv: number;
  /** null when there is no debt (Aave returns max uint256 = "infinite"). */
  healthFactor: number | null;
};

const MAX_UINT256 = (1n << 256n) - 1n;

export async function readPosition(
  chainId: number,
  rawAddress: string,
): Promise<Position> {
  const address = getAddress(rawAddress); // checksums + validates, throws on bad input
  const { cfg, client } = aaveClient(chainId);

  const [coll, debt, , liqThr, ltv, hf] = await client.readContract({
    address: cfg.pool,
    abi: poolAbi,
    functionName: "getUserAccountData",
    args: [address],
  });

  return {
    chainId,
    address,
    totalCollateralUsd: Number(formatUnits(coll, 8)),
    totalDebtUsd: Number(formatUnits(debt, 8)),
    liquidationThreshold: Number(liqThr) / 10_000, // basis points → fraction
    ltv: Number(ltv) / 10_000,
    healthFactor: hf >= MAX_UINT256 ? null : Number(formatUnits(hf, 18)),
  };
}
