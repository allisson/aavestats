# aavestats

A dashboard for viewing Aave borrow positions and simulating how those positions
behave as collateral prices fall — when and how Aave would liquidate them.

## Language

**Liquidation**:
The event where, once a position's Health Factor drops below 1, a third party
repays part of the borrower's debt and seizes a corresponding amount of
collateral plus a penalty. The central event this app simulates.
_Avoid_: settlement, settle (those mean trade finalization in DeFi)

**Health Factor**:
A single number summarizing how safe a position is. At or below 1 the position
becomes eligible for liquidation. Derived from collateral value, each asset's
liquidation threshold, and total debt.
_Avoid_: HF (spell it out in prose), safety score

**Position**:
A borrower's combined set of supplied collateral and outstanding debt on Aave
for a given account on a given network. May be **real** (read from a Watched
Address on-chain) or **Hypothetical** (user-supplied amounts). Both are priced
and risk-evaluated by identical Aave Oracle + liquidation-threshold math.
_Avoid_: loan, account, wallet

**Hypothetical Position**:
A Position whose collateral and debt amounts are supplied by the user rather than
read from a Watched Address — it has no on-chain existence. It lets the user
explore a Scenario for holdings they do not actually have on Aave. It is still
priced by the Aave Oracle and evaluated by the same liquidation math (thresholds,
bonuses, Close Factor, E-Mode) as a real Position.
_Avoid_: wallet, simulated wallet (a Position is never called a wallet)

**Collateral**:
Assets a borrower has supplied to Aave that back their debt (e.g. WBTC).

**Debt**:
Assets a borrower has borrowed against their collateral (e.g. USDC).
_Avoid_: loan

**Scenario**:
A simulation parameterized by collateral **price level** (not by time) — the
price is swept downward to observe how a Position's Health Factor changes and at
what points liquidations occur.
_Avoid_: timeline, animation (the input is price, not elapsed time)

**Liquidation Threshold**:
The per-asset ratio at which collateral stops fully backing debt; the weighted
sum of these across a Position's collateral is what the Health Factor measures
debt against. Can be raised by E-Mode.
_Avoid_: LTV (that is the separate borrow limit, a lower number)

**Close Factor**:
The maximum fraction of a Position's debt a single liquidation may repay. In
Aave v3, up to 50% when Health Factor is between 0.95 and 1, and up to 100%
below 0.95.

**Liquidation Bonus**:
The discount a liquidator receives on seized collateral — extra collateral taken
beyond the debt repaid. From the borrower's side it is the liquidation penalty.

**E-Mode**:
An Aave v3 efficiency mode that raises liquidation thresholds for a category of
correlated assets. A Position's active E-Mode category changes its liquidation
math and must be read on-chain.

**Watched Address**:
A wallet address the user has entered to view its Position. Read-only — the app
never connects a wallet or signs transactions.
_Avoid_: account, user, wallet (in the connected-wallet sense)

**Volatile / Stable asset**:
A classification of each Position asset by whether its Aave Oracle price tracks a
peg. **Stable** assets are treated as holding their price in a Scenario; **volatile**
assets are the ones assumed to move. The distinction drives the default Scenario:
volatile Collateral falls together (stables held flat), or volatile Debt rises
together. A depegged stablecoin reads as volatile.
_Avoid_: stablecoin (an asset can be a stablecoin yet read as volatile if depegged)

**Distance to Liquidation**:
The smallest single-direction price move that would bring a Position's Health
Factor to 1 — either volatile Collateral falling together by some percentage, or
volatile Debt rising together by some percentage, whichever is the smaller move.
The headline answer the app exists to give. Undefined when the Position has no
Debt (cannot be liquidated) or is already at or below Health Factor 1 (eligible
now).
_Avoid_: liquidation distance, margin, buffer

**Crash Severity**:
The single axis of the default Scenario — the percentage of the binding move
(volatile Collateral falling, or volatile Debt rising) applied uniformly. At the
Crash Severity equal to the Distance to Liquidation, Health Factor reaches 1 and
the Liquidation cascade begins.
_Avoid_: intensity, time (the axis is a price move, never elapsed time)
