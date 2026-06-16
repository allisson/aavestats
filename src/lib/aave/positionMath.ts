import type { Position } from "./position";
import type { AssetPosition } from "./breakdown";

/**
 * Pure position math, split out from the IO in breakdown.ts so it can be unit
 * tested without an RPC client or the `server-only` guard.
 */

/**
 * Does the per-asset reconstruction match Aave's aggregate within tolerance?
 * A false result flags an unmodeled case (the UI warns and the cascade may
 * diverge from Aave).
 */
export function reconcile(
  position: Position,
  assets: AssetPosition[],
): boolean {
  const collateral = assets.reduce((s, a) => s + a.collateralUsd, 0);
  const debt = assets.reduce((s, a) => s + a.debtUsd, 0);
  const close = (a: number, b: number, tol: number) =>
    b === 0 ? a < 1 : Math.abs(a - b) / b < tol;

  if (!close(collateral, position.totalCollateralUsd, 0.02)) return false;
  if (!close(debt, position.totalDebtUsd, 0.02)) return false;

  if (position.healthFactor != null && debt > 0) {
    const weightedLt = assets.reduce(
      (s, a) => s + a.collateralUsd * a.liquidationThreshold,
      0,
    );
    const reconstructedHf = weightedLt / debt;
    if (!close(reconstructedHf, position.healthFactor, 0.03)) return false;
  }
  return true;
}

/**
 * Override liquidation threshold + bonus for collateral enabled in the user's
 * E-Mode category (Aave v3.2). An asset is overridden when its reserve-id bit is
 * set in the category's collateral bitmap; thresholds/bonuses arrive in basis
 * points. Mutates `assets` in place.
 */
export function applyEModeOverrides(
  assets: AssetPosition[],
  eModeLtBps: number,
  eModeBonusBps: number,
  collateralBitmap: bigint,
  idByAsset: Map<string, number>,
): void {
  const threshold = eModeLtBps / 10_000;
  const bonus = eModeBonusBps / 10_000 - 1;

  for (const asset of assets) {
    const id = idByAsset.get(asset.asset.toLowerCase());
    if (id === undefined) continue;
    if (((collateralBitmap >> BigInt(id)) & 1n) === 1n) {
      asset.liquidationThreshold = threshold;
      asset.liquidationBonus = bonus;
    }
  }
}
