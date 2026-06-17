import { readBreakdown, type PositionBreakdown } from "@/lib/aave/breakdown";
import { readPosition, type Position } from "@/lib/aave/position";
import { readReserveCatalog, type ReserveCatalog } from "@/lib/aave/catalog";

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

export type CatalogResult =
  | { ok: true; catalog: ReserveCatalog }
  | { ok: false; error: string };

/** Prefetch a chain's reserve catalog for the Hypothetical Position editor. */
export async function fetchCatalog(chainId: number): Promise<CatalogResult> {
  try {
    const catalog = await readReserveCatalog(chainId);
    return { ok: true, catalog };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to load reserves",
    };
  }
}

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
