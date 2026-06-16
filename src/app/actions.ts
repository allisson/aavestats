"use server";

import { readBreakdown, type PositionBreakdown } from "@/lib/aave/breakdown";
import { readPosition, type Position } from "@/lib/aave/position";

export type FetchResult =
  | { ok: true; breakdown: PositionBreakdown }
  | { ok: false; error: string };

export async function fetchBreakdown(
  chainId: number,
  address: string,
): Promise<FetchResult> {
  try {
    const breakdown = await readBreakdown(chainId, address);
    return { ok: true, breakdown };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to read position",
    };
  }
}

export type SummaryResult =
  | { ok: true; position: Position }
  | { ok: false; error: string };

/** Lightweight aggregate read (one call) for the watchlist rows. */
export async function fetchSummary(
  chainId: number,
  address: string,
): Promise<SummaryResult> {
  try {
    const position = await readPosition(chainId, address);
    return { ok: true, position };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to read position",
    };
  }
}
