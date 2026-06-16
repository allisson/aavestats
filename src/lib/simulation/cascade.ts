import type { AssetPosition, PositionBreakdown } from "@/lib/aave/breakdown";

/** Map of asset address -> price multiplier. 1 = unchanged, 0.7 = a 30% drop. */
export type PriceShocks = Record<string, number>;

export type LiquidationEvent = {
  step: number;
  healthFactorBefore: number;
  closeFactor: number; // 0.5 or 1.0
  debtSymbol: string;
  collateralSymbol: string;
  debtRepaidUsd: number;
  collateralSeizedUsd: number;
  bonus: number;
};

export type CascadeResult = {
  /** Health factor at the shocked prices, before any liquidation. */
  healthFactorBefore: number | null;
  events: LiquidationEvent[];
  finalCollateralUsd: number;
  finalDebtUsd: number;
  finalHealthFactor: number | null;
  /** True if collateral ran out while debt remained (bad debt). */
  insolvent: boolean;
};

type Leg = {
  symbol: string;
  lt: number;
  bonus: number;
  collateralUsd: number;
  debtUsd: number;
};

const HF_CLOSE_FACTOR_THRESHOLD = 0.95; // Aave v3: below this, 100% of debt may be repaid
const MAX_STEPS = 100; // backstop against a non-converging loop

function shockedUsd(a: AssetPosition, shocks: PriceShocks) {
  const price = a.priceUsd * (shocks[a.asset] ?? 1);
  return {
    symbol: a.symbol,
    lt: a.liquidationThreshold,
    bonus: a.liquidationBonus,
    collateralUsd: a.collateralAmount * price,
    debtUsd: a.debtAmount * price,
  };
}

function totals(legs: Leg[]) {
  const collateralUsd = legs.reduce((s, l) => s + l.collateralUsd, 0);
  const debtUsd = legs.reduce((s, l) => s + l.debtUsd, 0);
  const weightedLt = legs.reduce((s, l) => s + l.collateralUsd * l.lt, 0);
  const healthFactor = debtUsd > 0 ? weightedLt / debtUsd : null;
  return { collateralUsd, debtUsd, healthFactor };
}

/**
 * Simulate Aave's liquidation cascade at a fixed set of shocked prices, using the
 * deterministic liquidator strategy from docs/adr/0003: each step repays the
 * largest debt and seizes from the collateral with the highest liquidation bonus,
 * bounded by the close factor, then repeats while the health factor is below 1.
 */
export function simulateCascade(
  breakdown: PositionBreakdown,
  shocks: PriceShocks,
): CascadeResult {
  const legs: Leg[] = breakdown.assets.map((a) => shockedUsd(a, shocks));
  const before = totals(legs);
  const events: LiquidationEvent[] = [];
  let insolvent = false;

  for (let step = 1; step <= MAX_STEPS; step++) {
    const { debtUsd, healthFactor } = totals(legs);
    if (healthFactor == null || healthFactor >= 1 || debtUsd <= 1e-6) break;

    const debtLeg = legs
      .filter((l) => l.debtUsd > 1e-6)
      .sort((a, b) => b.debtUsd - a.debtUsd)[0];
    const collLeg = legs
      .filter((l) => l.collateralUsd > 1e-6)
      .sort((a, b) => b.bonus - a.bonus)[0];

    if (!debtLeg || !collLeg) {
      insolvent = debtUsd > 1e-6;
      break;
    }

    const closeFactor = healthFactor < HF_CLOSE_FACTOR_THRESHOLD ? 1 : 0.5;
    let debtRepaidUsd = debtLeg.debtUsd * closeFactor;
    let collateralSeizedUsd = debtRepaidUsd * (1 + collLeg.bonus);

    // Can't seize more collateral than this leg holds; cap the repay accordingly.
    if (collateralSeizedUsd > collLeg.collateralUsd) {
      collateralSeizedUsd = collLeg.collateralUsd;
      debtRepaidUsd = collateralSeizedUsd / (1 + collLeg.bonus);
    }

    debtLeg.debtUsd -= debtRepaidUsd;
    collLeg.collateralUsd -= collateralSeizedUsd;

    events.push({
      step,
      healthFactorBefore: healthFactor,
      closeFactor,
      debtSymbol: debtLeg.symbol,
      collateralSymbol: collLeg.symbol,
      debtRepaidUsd,
      collateralSeizedUsd,
      bonus: collLeg.bonus,
    });
  }

  const after = totals(legs);
  return {
    healthFactorBefore: before.healthFactor,
    events,
    finalCollateralUsd: after.collateralUsd,
    finalDebtUsd: after.debtUsd,
    finalHealthFactor: after.healthFactor,
    insolvent,
  };
}

export type ScenarioSweepPoint = {
  /** 0 = today's prices, 100 = the fully configured drops. */
  intensityPct: number;
  healthFactorBefore: number | null;
  liquidations: number;
};

/**
 * Ramp a whole set of per-asset price shocks from today's prices to their
 * configured targets, running the full cascade at each step. Drives the Scenario
 * chart for a correlated move — collateral falling and/or volatile debt rising
 * (e.g. ETH collateral -30% while ETH debt is unaffected, or a borrowed asset
 * appreciating).
 *
 * `targetShocks` maps asset address -> target price multiplier at full intensity
 * (0.7 = a 30% drop, 1.5 = a 50% rise). Each multiplier is interpolated from 1.
 */
export function sweepScenario(
  breakdown: PositionBreakdown,
  targetShocks: PriceShocks,
  steps = 45,
): ScenarioSweepPoint[] {
  const entries = Object.entries(targetShocks);
  const points: ScenarioSweepPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const shocks: PriceShocks = {};
    for (const [asset, target] of entries) shocks[asset] = 1 + t * (target - 1);
    const result = simulateCascade(breakdown, shocks);
    points.push({
      intensityPct: Math.round(t * 100),
      healthFactorBefore: result.healthFactorBefore,
      liquidations: result.events.length,
    });
  }
  return points;
}

export type AssetLiquidationPrice =
  | { price: number; dropFraction: number }
  | "safe-alone" // this asset can fall to zero without triggering liquidation
  | null; // not collateral, or the position has no debt

/**
 * The price this one collateral asset would have to reach — holding every other
 * price flat — for the position's health factor to hit 1 and liquidation to
 * begin. This is the "what does Bitcoin have to drop to?" readout.
 */
export function assetLiquidationPrice(
  breakdown: PositionBreakdown,
  asset: string,
): AssetLiquidationPrice {
  const a = breakdown.assets.find((x) => x.asset === asset);
  if (!a || a.collateralUsd <= 0) return null;

  const totalDebt = breakdown.assets.reduce((s, x) => s + x.debtUsd, 0);
  if (totalDebt <= 0) return null;

  const weightedLtOthers = breakdown.assets
    .filter((x) => x.asset !== asset)
    .reduce((s, x) => s + x.collateralUsd * x.liquidationThreshold, 0);

  const denom = a.collateralUsd * a.liquidationThreshold;
  if (denom <= 0) return null;

  // HF = (weightedLtOthers + collateralUsd_a * m * LT_a) / totalDebt = 1
  const m = (totalDebt - weightedLtOthers) / denom;
  if (m <= 0) return "safe-alone";
  return { price: a.priceUsd * m, dropFraction: 1 - m };
}

export type DebtLiquidationPrice =
  | { price: number; riseFraction: number }
  | "already" // the position is already liquidatable before this debt rises
  | null; // not a debt asset, or there is no collateral

/**
 * The price this one debt asset would have to rise to — holding every other
 * price flat — for the health factor to hit 1. Relevant for volatile (non-stable)
 * debt, where the borrowed asset appreciating is itself a liquidation risk.
 */
export function debtLiquidationPrice(
  breakdown: PositionBreakdown,
  asset: string,
): DebtLiquidationPrice {
  const d = breakdown.assets.find((x) => x.asset === asset);
  if (!d || d.debtUsd <= 0) return null;

  const weightedLtColl = breakdown.assets.reduce(
    (s, x) => s + x.collateralUsd * x.liquidationThreshold,
    0,
  );
  if (weightedLtColl <= 0) return null;

  const debtOthers = breakdown.assets
    .filter((x) => x.asset !== asset)
    .reduce((s, x) => s + x.debtUsd, 0);

  // HF = weightedLtColl / (debtOthers + debtUsd_d * m) = 1
  const m = (weightedLtColl - debtOthers) / d.debtUsd;
  if (m <= 1) return "already";
  return { price: d.priceUsd * m, riseFraction: m - 1 };
}
