import type { AssetPosition, PositionBreakdown } from "./breakdown";
import type { Position } from "./position";
import type { ReserveCatalog } from "./catalog";
import { applyEModeOverrides } from "./positionMath";

/** One asset's user-supplied amounts in a Hypothetical Position (see ADR 0007). */
export type HypotheticalItem = {
  asset: string;
  collateralAmount: number;
  debtAmount: number;
};

export type HypotheticalRecipe = {
  eModeCategory: number; // 0 = none
  items: HypotheticalItem[];
};

/**
 * Synthesize a PositionBreakdown from user-supplied amounts, pricing each asset
 * with the catalog's on-chain Oracle price and base reserve thresholds, then
 * applying the selected E-Mode category's overrides exactly as a real position
 * would (same applyEModeOverrides path). Pure — the editor re-runs it on every
 * keystroke. See ADR 0007.
 */
export function buildHypotheticalBreakdown(
  catalog: ReserveCatalog,
  recipe: HypotheticalRecipe,
): PositionBreakdown {
  const byAddr = new Map(
    catalog.reserves.map((r) => [r.asset.toLowerCase(), r]),
  );
  const assets: AssetPosition[] = [];

  for (const item of recipe.items) {
    const r = byAddr.get(item.asset.toLowerCase());
    if (!r) continue; // reserve no longer exists on-chain
    const collateralAmount = Math.max(0, item.collateralAmount || 0);
    const debtAmount = Math.max(0, item.debtAmount || 0);
    if (collateralAmount === 0 && debtAmount === 0) continue;
    assets.push({
      symbol: r.symbol,
      asset: r.asset,
      decimals: r.decimals,
      priceUsd: r.priceUsd,
      collateralAmount,
      collateralUsd: collateralAmount * r.priceUsd,
      debtAmount,
      debtUsd: debtAmount * r.priceUsd,
      liquidationThreshold: r.liquidationThreshold,
      liquidationBonus: r.liquidationBonus,
    });
  }

  const category = catalog.eModeCategories.find(
    (c) => c.id === recipe.eModeCategory,
  );
  if (category) {
    const idByAsset = new Map(Object.entries(catalog.reserveIds));
    applyEModeOverrides(
      assets,
      category.liquidationThresholdBps,
      category.liquidationBonusBps,
      category.collateralBitmap,
      idByAsset,
    );
  }

  return {
    position: synthesizePosition(catalog.chainId, assets),
    assets,
    eModeCategory: category ? recipe.eModeCategory : 0,
    reconciles: true, // nothing on-chain to diverge from
    source: "hypothetical",
  };
}

/**
 * The aggregate a real position reads from getUserAccountData, recomputed from the
 * synthesized assets. `ltv` is a borrow limit, not a liquidation input, and is not
 * surfaced for hypotheticals, so it is left at 0 (see ADR 0007).
 */
function synthesizePosition(
  chainId: number,
  assets: AssetPosition[],
): Position {
  const totalCollateralUsd = assets.reduce((s, a) => s + a.collateralUsd, 0);
  const totalDebtUsd = assets.reduce((s, a) => s + a.debtUsd, 0);
  const weightedLt = assets.reduce(
    (s, a) => s + a.collateralUsd * a.liquidationThreshold,
    0,
  );
  return {
    chainId,
    address: "",
    totalCollateralUsd,
    totalDebtUsd,
    liquidationThreshold:
      totalCollateralUsd > 0 ? weightedLt / totalCollateralUsd : 0,
    ltv: 0,
    healthFactor: totalDebtUsd > 0 ? weightedLt / totalDebtUsd : null,
  };
}
