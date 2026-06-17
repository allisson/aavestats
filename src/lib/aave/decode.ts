/**
 * Pure decoders for the AaveProtocolDataProvider's positional read tuples, split
 * out so the on-chain tuple shape and the basis-point conventions live in one
 * tested place instead of being re-stated (via `as unknown as`) in every reader.
 */

/** Decoded `getReserveConfigurationData` — the reserve's base liquidation params. */
export type ReserveConfig = {
  decimals: number;
  /** liquidation threshold as a fraction, e.g. 0.825. */
  liquidationThreshold: number;
  /** liquidation bonus as a fraction, e.g. 0.05 (10500 bps -> 0.05). */
  liquidationBonus: number;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
};

/** Decoded `getUserReserveData` — the user's raw balances for one reserve. */
export type UserReserve = {
  /** aToken balance (collateral), in the reserve's smallest unit. */
  aTokenBalance: bigint;
  /** stable + variable debt, in the reserve's smallest unit. */
  debt: bigint;
  usageAsCollateral: boolean;
};

// getReserveConfigurationData:
//   [decimals, ltv, liquidationThreshold, liquidationBonus, reserveFactor,
//    usageAsCollateralEnabled, borrowingEnabled, stableBorrowRateEnabled,
//    isActive, isFrozen]
type RawReserveConfig = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
];

// getUserReserveData:
//   [currentATokenBalance, currentStableDebt, currentVariableDebt,
//    principalStableDebt, scaledVariableDebt, stableBorrowRate, liquidityRate,
//    stableRateLastUpdated, usageAsCollateralEnabled]
type RawUserReserve = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  boolean,
];

export function decodeReserveConfig(raw: unknown): ReserveConfig {
  const c = raw as RawReserveConfig;
  return {
    decimals: Number(c[0]),
    liquidationThreshold: Number(c[2]) / 10_000,
    liquidationBonus: Number(c[3]) / 10_000 - 1, // 10500 -> 0.05
    usageAsCollateralEnabled: c[5],
    borrowingEnabled: c[6],
  };
}

export function decodeUserReserve(raw: unknown): UserReserve {
  const u = raw as RawUserReserve;
  return {
    aTokenBalance: u[0],
    debt: u[1] + u[2], // stable + variable
    usageAsCollateral: u[8],
  };
}
