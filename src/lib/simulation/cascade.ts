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

const HF_CLOSE_FACTOR_THRESHOLD = 0.95; // Aave v3: at or below this, 100% of debt may be repaid
// Aave v3.1: the 50% close factor only applies when the reserve's collateral AND
// debt are each worth at least this much; smaller positions are 100%-liquidatable.
// The value is in the oracle's base currency; every chain we configure uses a
// USD oracle with 8 decimals, so 2000e8 is $2000 (a non-USD pool would differ).
const MIN_BASE_MAX_CLOSE_FACTOR_THRESHOLD = 2000;
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

    // Aave v3.1 close factor: 50% (capped at half of *total* debt) only when this
    // step's collateral and debt reserves are each large enough and HF is above
    // 0.95; otherwise the whole reserve debt is liquidatable (small-position rule).
    const fiftyPctApplies =
      collLeg.collateralUsd >= MIN_BASE_MAX_CLOSE_FACTOR_THRESHOLD &&
      debtLeg.debtUsd >= MIN_BASE_MAX_CLOSE_FACTOR_THRESHOLD &&
      healthFactor > HF_CLOSE_FACTOR_THRESHOLD;
    const closeFactor = fiftyPctApplies ? 0.5 : 1;
    let debtRepaidUsd = fiftyPctApplies
      ? Math.min(debtLeg.debtUsd, debtUsd * 0.5)
      : debtLeg.debtUsd;
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
  const debtOthers = totalDebt - a.debtUsd;

  // As this asset's price scales by m, both its collateral backing and any debt
  // denominated in it scale together:
  //   HF = (weightedLtOthers + collateralUsd_a*LT_a*m) / (debtOthers + debtUsd_a*m) = 1
  // The asset's net contribution to liquidation risk is collateralUsd_a*LT_a - debtUsd_a.
  // If that is <= 0 its debt shrinks at least as fast as its backing, so the price
  // falling never degrades the health factor.
  const net = a.collateralUsd * a.liquidationThreshold - a.debtUsd;
  if (net <= 0) return "safe-alone";

  const m = (debtOthers - weightedLtOthers) / net;
  if (m <= 0) return "safe-alone";
  return { price: a.priceUsd * m, dropFraction: 1 - m };
}

export type DebtLiquidationPrice =
  | { price: number; riseFraction: number }
  | "already" // the position is already liquidatable before this debt rises
  | "safe-alone" // this debt can rise without ever triggering liquidation
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

  const weightedLtOthers =
    weightedLtColl - d.collateralUsd * d.liquidationThreshold;
  const debtOthers = breakdown.assets
    .filter((x) => x.asset !== asset)
    .reduce((s, x) => s + x.debtUsd, 0);

  // As this asset's price scales by m, both its debt and any collateral
  // denominated in it scale together:
  //   HF = (weightedLtOthers + collateralUsd_d*LT_d*m) / (debtOthers + debtUsd_d*m) = 1
  // The asset's net contribution to a rising-price risk is debtUsd_d - collateralUsd_d*LT_d.
  // If that is <= 0 its collateral backing grows at least as fast as its debt, so
  // the price rising never degrades the health factor.
  const net = d.debtUsd - d.collateralUsd * d.liquidationThreshold;
  if (net <= 0) return "safe-alone";

  const m = (weightedLtOthers - debtOthers) / net;
  if (m <= 1) return "already";
  return { price: d.priceUsd * m, riseFraction: m - 1 };
}
