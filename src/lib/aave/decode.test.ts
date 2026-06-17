import { describe, expect, it } from "vitest";
import { decodeReserveConfig, decodeUserReserve } from "./decode";

describe("decodeReserveConfig", () => {
  // [decimals, ltv, liquidationThreshold, liquidationBonus, reserveFactor,
  //  usageAsCollateralEnabled, borrowingEnabled, stableBorrowRateEnabled,
  //  isActive, isFrozen]
  it("decodes thresholds and bonus from basis points", () => {
    const raw = [
      18n,
      8000n,
      8250n,
      10500n,
      1000n,
      true,
      true,
      false,
      true,
      false,
    ];
    const c = decodeReserveConfig(raw);
    expect(c.decimals).toBe(18);
    expect(c.liquidationThreshold).toBe(0.825);
    expect(c.liquidationBonus).toBeCloseTo(0.05, 10); // 10500 bps -> 0.05
    expect(c.usageAsCollateralEnabled).toBe(true);
    expect(c.borrowingEnabled).toBe(true);
  });

  it("reports a non-collateral, non-borrowable reserve", () => {
    const raw = [6n, 0n, 0n, 0n, 1000n, false, false, false, true, false];
    const c = decodeReserveConfig(raw);
    expect(c.decimals).toBe(6);
    expect(c.liquidationThreshold).toBe(0);
    expect(c.liquidationBonus).toBe(-1); // 0 bps -> 0/10000 - 1
    expect(c.usageAsCollateralEnabled).toBe(false);
    expect(c.borrowingEnabled).toBe(false);
  });
});

describe("decodeUserReserve", () => {
  // [currentATokenBalance, currentStableDebt, currentVariableDebt,
  //  principalStableDebt, scaledVariableDebt, stableBorrowRate, liquidityRate,
  //  stableRateLastUpdated, usageAsCollateralEnabled]
  it("sums stable + variable debt and surfaces the collateral flag", () => {
    const raw = [1000n, 30n, 500n, 0n, 480n, 0n, 0n, 0, true];
    expect(decodeUserReserve(raw)).toEqual({
      aTokenBalance: 1000n,
      debt: 530n, // 30 stable + 500 variable
      usageAsCollateral: true,
    });
  });
});
