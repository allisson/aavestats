import { describe, expect, it } from "vitest";
import type { AssetPosition, PositionBreakdown } from "@/lib/aave/breakdown";
import {
  assetLiquidationPrice,
  debtLiquidationPrice,
  simulateCascade,
  sweepScenario,
} from "./cascade";

function asset(
  p: Partial<AssetPosition> &
    Pick<AssetPosition, "symbol" | "asset" | "priceUsd">,
): AssetPosition {
  const collateralAmount = p.collateralAmount ?? 0;
  const debtAmount = p.debtAmount ?? 0;
  return {
    symbol: p.symbol,
    asset: p.asset,
    decimals: p.decimals ?? 18,
    priceUsd: p.priceUsd,
    collateralAmount,
    collateralUsd: p.collateralUsd ?? collateralAmount * p.priceUsd,
    debtAmount,
    debtUsd: p.debtUsd ?? debtAmount * p.priceUsd,
    liquidationThreshold: p.liquidationThreshold ?? 0,
    liquidationBonus: p.liquidationBonus ?? 0,
  };
}

function breakdown(assets: AssetPosition[]): PositionBreakdown {
  return {
    position: {
      chainId: 1,
      address: "0xuser",
      totalCollateralUsd: assets.reduce((s, a) => s + a.collateralUsd, 0),
      totalDebtUsd: assets.reduce((s, a) => s + a.debtUsd, 0),
      liquidationThreshold: 0,
      ltv: 0,
      healthFactor: null,
    },
    assets,
    eModeCategory: 0,
    reconciles: true,
  };
}

// 1 WBTC @ $66k collateral (LT 0.78, bonus 0.07), 30k USDC debt.
const wbtcUsdc = () =>
  breakdown([
    asset({
      symbol: "WBTC",
      asset: "0xwbtc",
      priceUsd: 66000,
      collateralAmount: 1,
      liquidationThreshold: 0.78,
      liquidationBonus: 0.07,
    }),
    asset({
      symbol: "USDC",
      asset: "0xusdc",
      priceUsd: 1,
      debtAmount: 30000,
      liquidationThreshold: 0,
    }),
  ]);

describe("simulateCascade", () => {
  it("no drop: healthy, no liquidation", () => {
    const r = simulateCascade(wbtcUsdc(), {});
    expect(r.healthFactorBefore).toBeCloseTo(1.716, 3);
    expect(r.events).toHaveLength(0);
    expect(r.finalDebtUsd).toBeCloseTo(30000, 0);
  });

  it("HF in [0.95,1): one partial liquidation at 50% close factor, then recovers", () => {
    const r = simulateCascade(wbtcUsdc(), { "0xwbtc": 1 - 0.42 });
    expect(r.healthFactorBefore).toBeCloseTo(0.9953, 3);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].closeFactor).toBe(0.5);
    expect(r.events[0].debtRepaidUsd).toBeCloseTo(15000, 0);
    expect(r.events[0].collateralSeizedUsd).toBeCloseTo(16050, 0); // 15000 * 1.07
    expect(r.finalHealthFactor).toBeCloseTo(1.156, 2);
    expect(r.insolvent).toBe(false);
  });

  it("HF < 0.95: full (100% close factor) liquidation clears the debt", () => {
    const r = simulateCascade(wbtcUsdc(), { "0xwbtc": 1 - 0.45 });
    expect(r.healthFactorBefore).toBeCloseTo(0.9438, 3);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].closeFactor).toBe(1);
    expect(r.finalDebtUsd).toBeCloseTo(0, 6);
    expect(r.finalHealthFactor).toBeNull(); // no debt left
  });

  it("small position (< $2000 reserve): 100% close factor even with HF in [0.95,1)", () => {
    // WBTC collateral $1650, USDC debt $1200 — both below the $2000 threshold.
    // Aave v3.1 raises the close factor to 100% for such small positions, so a
    // single liquidation clears the whole debt rather than just half.
    const bd = breakdown([
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 66000,
        collateralAmount: 0.025, // $1650
        liquidationThreshold: 0.78,
        liquidationBonus: 0.07,
      }),
      asset({ symbol: "USDC", asset: "0xusdc", priceUsd: 1, debtAmount: 1200 }),
    ]);
    const r = simulateCascade(bd, { "0xwbtc": 0.92 });
    expect(r.healthFactorBefore).toBeGreaterThan(0.95);
    expect(r.healthFactorBefore).toBeLessThan(1); // would be 50% if it weren't small
    expect(r.events).toHaveLength(1);
    expect(r.events[0].closeFactor).toBe(1);
    expect(r.events[0].debtRepaidUsd).toBeCloseTo(1200, 0); // whole debt, not half
    expect(r.finalDebtUsd).toBeCloseTo(0, 6);
  });

  it("multi-debt 50% close factor caps at half of TOTAL debt, not half the reserve", () => {
    // Regression guard for the Aave v3.1 close-factor rule (LiquidationLogic):
    //   maxLiquidatableDebt = min(borrowerReserveDebt, 50% of the position's TOTAL debt)
    // when the reserve's collateral and debt are each >= $2000 and HF > 0.95.
    // It is 50% of *total* debt (capped by the reserve), NOT 50% of the reserve —
    // the older v3.0 "half the reserve" reading is wrong and must not be reintroduced.
    //
    // WBTC $20k collateral (LT 0.78); USDC $6k + DAI $4k debt = $10k total. WBTC -37%.
    const bd = breakdown([
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 50000,
        collateralAmount: 0.4, // $20,000
        liquidationThreshold: 0.78,
        liquidationBonus: 0.07,
      }),
      asset({ symbol: "USDC", asset: "0xusdc", priceUsd: 1, debtAmount: 6000 }),
      asset({ symbol: "DAI", asset: "0xdai", priceUsd: 1, debtAmount: 4000 }),
    ]);
    const r = simulateCascade(bd, { "0xwbtc": 0.63 }); // collateral $12,600
    expect(r.healthFactorBefore).toBeCloseTo(0.9828, 3); // in [0.95, 1)
    expect(r.events).toHaveLength(1);
    expect(r.events[0].debtSymbol).toBe("USDC"); // largest debt reserve
    expect(r.events[0].closeFactor).toBe(0.5);
    // 50% of TOTAL ($5000), not 50% of the $6k USDC reserve ($3000).
    expect(r.events[0].debtRepaidUsd).toBeCloseTo(5000, 0);
    expect(r.finalDebtUsd).toBeCloseTo(5000, 0);
  });

  it("detects bad debt when collateral is exhausted with debt remaining", () => {
    // WETH $226 collateral (LT 0.84), USDC $126 debt; WETH -50%.
    const bd = breakdown([
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 2000,
        collateralAmount: 0.113,
        liquidationThreshold: 0.84,
        liquidationBonus: 0.05,
      }),
      asset({ symbol: "USDC", asset: "0xusdc", priceUsd: 1, debtAmount: 126 }),
    ]);
    const r = simulateCascade(bd, { "0xweth": 0.5 });
    expect(r.healthFactorBefore).toBeCloseTo(0.7533, 3);
    expect(r.insolvent).toBe(true);
    expect(r.finalDebtUsd).toBeGreaterThan(0);
    expect(r.finalCollateralUsd).toBeCloseTo(0, 4);
  });

  it("multi-asset: seizes the highest-bonus collateral first, capped at its balance", () => {
    // WETH (bonus 5%) + WBTC (bonus 7%), $10k each; USDC $12k debt. Both -30%.
    const bd = breakdown([
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 2000,
        collateralAmount: 5,
        liquidationThreshold: 0.8,
        liquidationBonus: 0.05,
      }),
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 50000,
        collateralAmount: 0.2,
        liquidationThreshold: 0.78,
        liquidationBonus: 0.07,
      }),
      asset({
        symbol: "USDC",
        asset: "0xusdc",
        priceUsd: 1,
        debtAmount: 12000,
      }),
    ]);
    const r = simulateCascade(bd, { "0xweth": 0.7, "0xwbtc": 0.7 });
    expect(r.healthFactorBefore).toBeCloseTo(0.9217, 3);
    expect(r.events[0].collateralSymbol).toBe("WBTC"); // higher bonus
    expect(r.events[0].collateralSeizedUsd).toBeCloseTo(7000, 0); // capped at WBTC's shocked value
    expect(r.finalHealthFactor).toBeCloseTo(1.026, 2);
  });

  it("liquidates when a volatile debt asset's price rises", () => {
    // 1 WETH collateral @ $2000 (LT 0.8), debt 0.5 WETH-equivalent... use a
    // volatile debt: borrow 0.6 ARB priced $... simpler: collateral WBTC, debt WETH.
    const bd = breakdown([
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 60000,
        collateralAmount: 1,
        liquidationThreshold: 0.7,
        liquidationBonus: 0.07,
      }),
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 3000,
        debtAmount: 10,
        liquidationThreshold: 0,
      }),
    ]);
    // base HF = 60000*0.7 / (10*3000) = 42000/30000 = 1.4
    expect(simulateCascade(bd, {}).healthFactorBefore).toBeCloseTo(1.4, 3);
    // WETH debt rises 50% -> debt = 45000, HF = 42000/45000 = 0.9333 -> liquidates
    const r = simulateCascade(bd, { "0xweth": 1.5 });
    expect(r.healthFactorBefore).toBeCloseTo(0.9333, 3);
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.events[0].debtSymbol).toBe("WETH");
  });
});

describe("sweepScenario", () => {
  it("ramps from today's HF to the fully-shocked HF with liquidation onset", () => {
    const points = sweepScenario(wbtcUsdc(), { "0xwbtc": 0.5 }, 10);
    expect(points).toHaveLength(11);
    expect(points[0].intensityPct).toBe(0);
    expect(points[0].healthFactorBefore).toBeCloseTo(1.716, 3);
    expect(points.at(-1)!.intensityPct).toBe(100);
    expect(points.at(-1)!.healthFactorBefore).toBeCloseTo(0.858, 3);
    // monotonically non-increasing pre-liquidation HF
    for (let i = 1; i < points.length; i++) {
      expect(points[i].healthFactorBefore!).toBeLessThanOrEqual(
        points[i - 1].healthFactorBefore! + 1e-9,
      );
    }
    expect(points.some((p) => p.liquidations > 0)).toBe(true);
  });
});

describe("debtLiquidationPrice", () => {
  // WBTC collateral $60k (LT 0.7), WETH debt 10 @ $3000 = $30k. weightedLt 42000.
  const bd = (debtAmount: number) =>
    breakdown([
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 60000,
        collateralAmount: 1,
        liquidationThreshold: 0.7,
      }),
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 3000,
        debtAmount,
        liquidationThreshold: 0,
      }),
    ]);

  it("solves the price the debt must rise to (HF = 1)", () => {
    const r = debtLiquidationPrice(bd(10), "0xweth");
    if (r && typeof r === "object") {
      expect(r.price).toBeCloseTo(4200, 0); // 3000 * (42000/30000)
      expect(r.riseFraction).toBeCloseTo(0.4, 4);
    } else {
      throw new Error("expected an object");
    }
  });

  it("returns 'already' when the position is liquidatable before any rise", () => {
    expect(debtLiquidationPrice(bd(20), "0xweth")).toBe("already"); // debt 60k > 42000
  });

  it("returns null with no collateral or for a non-debt asset", () => {
    expect(debtLiquidationPrice(bd(10), "0xwbtc")).toBeNull(); // collateral-only
  });

  it("returns 'safe-alone' when a debt asset's own collateral outweighs its debt", () => {
    // WETH is both heavy collateral and light debt: as WETH rises its backing
    // grows faster than its debt, so it can never liquidate on its own.
    const both = breakdown([
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 3000,
        collateralAmount: 10,
        debtAmount: 1,
        liquidationThreshold: 0.8,
      }),
      asset({ symbol: "USDC", asset: "0xusdc", priceUsd: 1, debtAmount: 5000 }),
    ]);
    expect(debtLiquidationPrice(both, "0xweth")).toBe("safe-alone");
  });
});

describe("assetLiquidationPrice", () => {
  it("single collateral: solves the price where HF hits 1", () => {
    const r = assetLiquidationPrice(wbtcUsdc(), "0xwbtc");
    expect(r).not.toBeNull();
    if (r && typeof r === "object") {
      expect(r.price).toBeCloseTo(38461.54, 1);
      expect(r.dropFraction).toBeCloseTo(0.4172, 4);
    }
  });

  it("multi collateral: accounts for the other collateral's threshold", () => {
    const bd = breakdown([
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 2000,
        collateralUsd: 10000,
        liquidationThreshold: 0.8,
      }),
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 50000,
        collateralUsd: 10000,
        liquidationThreshold: 0.78,
      }),
      asset({ symbol: "USDC", asset: "0xusdc", priceUsd: 1, debtUsd: 12000 }),
    ]);
    const r = assetLiquidationPrice(bd, "0xweth");
    if (r && typeof r === "object") {
      expect(r.price).toBeCloseTo(1050, 0);
      expect(r.dropFraction).toBeCloseTo(0.475, 3);
    }
  });

  it("returns 'safe-alone' when other collateral alone covers the debt", () => {
    const bd = breakdown([
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 2000,
        collateralUsd: 10000,
        liquidationThreshold: 0.8,
      }),
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 50000,
        collateralUsd: 10000,
        liquidationThreshold: 0.78,
      }),
      asset({ symbol: "USDC", asset: "0xusdc", priceUsd: 1, debtUsd: 5000 }),
    ]);
    expect(assetLiquidationPrice(bd, "0xweth")).toBe("safe-alone");
  });

  it("accounts for the asset's own debt when it is both collateral and debt", () => {
    // 1.40 WBTC + 10k USDC collateral; 0.14 WBTC + 51k USDC debt. As WBTC falls,
    // the 0.14 WBTC debt falls with it — the readout must scale that debt, not
    // hold total debt fixed.
    const bd = () =>
      breakdown([
        asset({
          symbol: "WBTC",
          asset: "0xwbtc",
          priceUsd: 60000,
          collateralAmount: 1.4,
          debtAmount: 0.14,
          liquidationThreshold: 0.78,
          liquidationBonus: 0.07,
        }),
        asset({
          symbol: "USDC",
          asset: "0xusdc",
          priceUsd: 1,
          collateralAmount: 10000,
          debtAmount: 51000,
          liquidationThreshold: 0.85,
        }),
      ]);

    const r = assetLiquidationPrice(bd(), "0xwbtc");
    expect(r).not.toBeNull();
    if (!r || typeof r !== "object") throw new Error("expected an object");

    // Old (buggy) behaviour held total debt fixed:
    //   net_old = collUsd*LT = 1.4*60000*0.78 = 65520; debtOthers_old = total debt.
    //   m_old = (totalDebt - weightedLtOthers) / net_old.
    const totalDebt = 0.14 * 60000 + 51000; // 59400
    const weightedLtOthers = 10000 * 0.85; // 8500
    const mBuggy = (totalDebt - weightedLtOthers) / (1.4 * 60000 * 0.78);
    expect(r.price).not.toBeCloseTo(60000 * mBuggy, 0); // the fix bites

    // Cross-check against the engine: shocking ONLY WBTC to the reported price
    // (others flat) must put the pre-liquidation health factor at exactly 1.
    const m = r.price / 60000;
    const hf = simulateCascade(bd(), { "0xwbtc": m }).healthFactorBefore;
    expect(hf).toBeCloseTo(1, 6);
  });

  it("returns 'safe-alone' when the asset's own debt outweighs its backing", () => {
    // Tiny WBTC collateral, large WBTC debt: WBTC falling shrinks the debt faster
    // than the backing, so it can never trigger liquidation on its own.
    const bd = breakdown([
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 60000,
        collateralAmount: 0.1,
        debtAmount: 0.5,
        liquidationThreshold: 0.78,
      }),
      asset({
        symbol: "WETH",
        asset: "0xweth",
        priceUsd: 3000,
        collateralAmount: 20,
        liquidationThreshold: 0.8,
      }),
    ]);
    expect(assetLiquidationPrice(bd, "0xwbtc")).toBe("safe-alone");
  });

  it("returns null with no debt or for a non-collateral asset", () => {
    const noDebt = breakdown([
      asset({
        symbol: "WBTC",
        asset: "0xwbtc",
        priceUsd: 66000,
        collateralAmount: 1,
        liquidationThreshold: 0.78,
      }),
    ]);
    expect(assetLiquidationPrice(noDebt, "0xwbtc")).toBeNull();
    expect(assetLiquidationPrice(wbtcUsdc(), "0xusdc")).toBeNull(); // debt-only
  });
});
