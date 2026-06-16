import { describe, expect, it } from "vitest";
import type { AssetPosition } from "./breakdown";
import type { Position } from "./position";
import { applyEModeOverrides, reconcile } from "./positionMath";

function asset(
  p: Partial<AssetPosition> & Pick<AssetPosition, "asset">,
): AssetPosition {
  return {
    symbol: p.symbol ?? p.asset,
    asset: p.asset,
    decimals: 18,
    priceUsd: p.priceUsd ?? 1,
    collateralAmount: p.collateralAmount ?? 0,
    collateralUsd: p.collateralUsd ?? 0,
    debtAmount: p.debtAmount ?? 0,
    debtUsd: p.debtUsd ?? 0,
    liquidationThreshold: p.liquidationThreshold ?? 0,
    liquidationBonus: p.liquidationBonus ?? 0,
  };
}

function position(p: Partial<Position>): Position {
  return {
    chainId: 1,
    address: "0xuser",
    totalCollateralUsd: p.totalCollateralUsd ?? 0,
    totalDebtUsd: p.totalDebtUsd ?? 0,
    liquidationThreshold: p.liquidationThreshold ?? 0,
    ltv: p.ltv ?? 0,
    healthFactor: p.healthFactor ?? null,
  };
}

describe("reconcile", () => {
  const assets = [
    asset({ asset: "0xweth", collateralUsd: 226, liquidationThreshold: 0.84 }),
    asset({ asset: "0xusdc", debtUsd: 126 }),
  ];

  it("true when reconstruction matches the aggregate (HF = 226*0.84/126)", () => {
    const pos = position({
      totalCollateralUsd: 226,
      totalDebtUsd: 126,
      healthFactor: (226 * 0.84) / 126,
    });
    expect(reconcile(pos, assets)).toBe(true);
  });

  it("false when collateral totals diverge beyond tolerance", () => {
    const pos = position({
      totalCollateralUsd: 300,
      totalDebtUsd: 126,
      healthFactor: (226 * 0.84) / 126,
    });
    expect(reconcile(pos, assets)).toBe(false);
  });

  it("false when the reconstructed health factor diverges (e.g. unapplied E-Mode)", () => {
    const pos = position({
      totalCollateralUsd: 226,
      totalDebtUsd: 126,
      healthFactor: 2.03,
    });
    expect(reconcile(pos, assets)).toBe(false);
  });

  it("true for a no-debt position", () => {
    const pos = position({
      totalCollateralUsd: 226,
      totalDebtUsd: 0,
      healthFactor: null,
    });
    const collateralOnly = [
      asset({
        asset: "0xweth",
        collateralUsd: 226,
        liquidationThreshold: 0.84,
      }),
    ];
    expect(reconcile(pos, collateralOnly)).toBe(true);
  });
});

describe("applyEModeOverrides", () => {
  const idByAsset = new Map([
    ["0xweth", 1],
    ["0xwbtc", 3],
    ["0xusdc", 5],
  ]);

  it("overrides threshold and bonus (bps) for assets in the collateral bitmap", () => {
    const assets = [
      asset({
        asset: "0xWETH",
        liquidationThreshold: 0.84,
        liquidationBonus: 0.05,
      }),
      asset({
        asset: "0xWBTC",
        liquidationThreshold: 0.78,
        liquidationBonus: 0.07,
      }),
    ];
    // bitmap with bits 1 and 3 set (WETH + WBTC eligible)
    const bitmap = (1n << 1n) | (1n << 3n);
    applyEModeOverrides(assets, 9500, 10100, bitmap, idByAsset);
    expect(assets[0].liquidationThreshold).toBeCloseTo(0.95, 10);
    expect(assets[0].liquidationBonus).toBeCloseTo(0.01, 10); // 10100/10000 - 1
    expect(assets[1].liquidationThreshold).toBeCloseTo(0.95, 10);
  });

  it("leaves assets not in the bitmap untouched", () => {
    const assets = [
      asset({
        asset: "0xweth",
        liquidationThreshold: 0.84,
        liquidationBonus: 0.05,
      }),
    ];
    const bitmap = 1n << 3n; // only WBTC's bit; WETH (id 1) not set
    applyEModeOverrides(assets, 9500, 10100, bitmap, idByAsset);
    expect(assets[0].liquidationThreshold).toBe(0.84);
    expect(assets[0].liquidationBonus).toBe(0.05);
  });

  it("ignores assets absent from the reserve-id map", () => {
    const assets = [asset({ asset: "0xunknown", liquidationThreshold: 0.5 })];
    applyEModeOverrides(assets, 9500, 10100, ~0n, idByAsset);
    expect(assets[0].liquidationThreshold).toBe(0.5);
  });
});
