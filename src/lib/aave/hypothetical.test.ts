import { describe, expect, it } from "vitest";
import type { ReserveCatalog } from "./catalog";
import { buildHypotheticalBreakdown } from "./hypothetical";

const WBTC = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

// WBTC: id 0, $60k, LT 0.78, bonus 0.07. USDC: id 1, $1, LT 0.85, bonus 0.04.
// E-Mode category 1 boosts WBTC (bit 0 set) to LT 0.93 / bonus 0.01.
const catalog: ReserveCatalog = {
  chainId: 1,
  reserves: [
    {
      symbol: "WBTC",
      asset: WBTC,
      decimals: 8,
      priceUsd: 60_000,
      liquidationThreshold: 0.78,
      liquidationBonus: 0.07,
      usageAsCollateralEnabled: true,
      borrowingEnabled: true,
    },
    {
      symbol: "USDC",
      asset: USDC,
      decimals: 6,
      priceUsd: 1,
      liquidationThreshold: 0.85,
      liquidationBonus: 0.04,
      usageAsCollateralEnabled: true,
      borrowingEnabled: true,
    },
  ],
  eModeCategories: [
    {
      id: 1,
      liquidationThresholdBps: 9300,
      liquidationBonusBps: 10100,
      collateralBitmap: 1n, // bit 0 → WBTC
    },
  ],
  reserveIds: { [WBTC]: 0, [USDC]: 1 },
};

describe("buildHypotheticalBreakdown", () => {
  it("prices amounts via the catalog and synthesizes the aggregate", () => {
    const b = buildHypotheticalBreakdown(catalog, {
      eModeCategory: 0,
      items: [
        { asset: WBTC, collateralAmount: 1, debtAmount: 0 },
        { asset: USDC, collateralAmount: 0, debtAmount: 30_000 },
      ],
    });

    expect(b.source).toBe("hypothetical");
    expect(b.reconciles).toBe(true);
    expect(b.position.totalCollateralUsd).toBe(60_000);
    expect(b.position.totalDebtUsd).toBe(30_000);
    expect(b.position.liquidationThreshold).toBeCloseTo(0.78, 6);
    // HF = 60000 * 0.78 / 30000
    expect(b.position.healthFactor).toBeCloseTo(1.56, 6);
  });

  it("drops zero-amount items and unknown reserves", () => {
    const b = buildHypotheticalBreakdown(catalog, {
      eModeCategory: 0,
      items: [
        { asset: WBTC, collateralAmount: 0, debtAmount: 0 },
        { asset: "0xdead", collateralAmount: 5, debtAmount: 0 },
        { asset: USDC, collateralAmount: 100, debtAmount: 0 },
      ],
    });
    expect(b.assets.map((a) => a.symbol)).toEqual(["USDC"]);
  });

  it("applies the selected E-Mode category's overrides via the bitmap", () => {
    const b = buildHypotheticalBreakdown(catalog, {
      eModeCategory: 1,
      items: [
        { asset: WBTC, collateralAmount: 1, debtAmount: 0 },
        { asset: USDC, collateralAmount: 0, debtAmount: 30_000 },
      ],
    });
    const wbtc = b.assets.find((a) => a.symbol === "WBTC")!;
    expect(wbtc.liquidationThreshold).toBeCloseTo(0.93, 6);
    expect(wbtc.liquidationBonus).toBeCloseTo(0.01, 6);
    expect(b.eModeCategory).toBe(1);
    // HF = 60000 * 0.93 / 30000
    expect(b.position.healthFactor).toBeCloseTo(1.86, 6);
  });

  it("clamps negative amounts to zero", () => {
    const b = buildHypotheticalBreakdown(catalog, {
      eModeCategory: 0,
      items: [{ asset: WBTC, collateralAmount: -3, debtAmount: 0 }],
    });
    expect(b.assets).toHaveLength(0);
    expect(b.position.totalCollateralUsd).toBe(0);
  });
});
