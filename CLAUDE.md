# aavestats

A dashboard to view Aave v3 borrow Positions and simulate how they behave as
collateral prices fall — when and how Aave would liquidate them.

## What it does

- Enter one or more **Watched Addresses** (read-only; no wallet connection).
- See each **Position**: collateral, debt, Health Factor, per-asset liquidation
  thresholds, active E-Mode.
- Run a **Scenario**: sweep a collateral asset's price downward and watch Aave's
  reaction — a full liquidation **cascade** (Close Factor + Liquidation Bonus,
  repeated as Health Factor re-crosses 1), shown as a chart with a draggable
  price slider and a per-price-level breakdown.

## Domain language

Read `CONTEXT.md` first — it is the glossary. Use its terms exactly. Notably:
**liquidation** (never "settlement"), **Health Factor**, **Position**,
**Scenario** (parameterized by price, not time), **Watched Address**.

## Key decisions (see docs/adr/)

- **0001** — Read on-chain via RPC (viem); no subgraph, no database.
- **0002** — The **Aave Oracle** price drives all math, not market price.
- **0003** — Multi-asset liquidation cascades use a **deterministic liquidator
  strategy** (repay largest debt, seize highest-bonus collateral).
- **0005** — **Public RPC only, reads run in the browser, static export** — no
  server, no keyed RPC (supersedes the server-side half of 0001).

## Correctness requirements

- Use the Aave Oracle price for every Health Factor and liquidation calculation.
- Respect each Position's active **E-Mode** category — it raises liquidation
  thresholds and changes the math. Read it on-chain; don't assume the base values.
- Apply Aave v3 Close Factor rules: up to 50% of debt repaid per liquidation when
  Health Factor is 0.95–1.0, up to 100% below 0.95.
- Keep per-chain config (RPC URL, contract addresses) in one table; adding a chain
  must be a config change, not a code change. Aave v3 multi-chain from day one.

## Stack

Next.js (App Router) + TypeScript · viem for on-chain reads · Tailwind ·
Recharts for the Scenario chart. The app is a **static export** (`output: "export"`,
`next build` → `./out`): every read runs in the browser against public RPCs, so
there is no server and no RPC key to protect (see ADR 0005).

## Dev commands

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # type-check + static export → ./out
npm run lint         # eslint (flat config, eslint-config-next)
npm run format       # prettier --write .   (format:check verifies in CI)
npm test             # vitest unit tests (cascade engine + position math)
```

CI (`.github/workflows/ci.yml`) runs lint + format:check + test + build on every
push to `main` and on pull requests (the build step guards the static export).
ESLint uses flat config (`eslint.config.mjs`); the React 19 purity /
set-state-in-effect rules are enabled, so prefer `useSyncExternalStore` over
localStorage-in-effect and keep `Date.now()` out of render.

All RPC endpoints are public and pinned per chain in `src/lib/chains.ts` (`rpc`
field) — there are no RPC env vars (see ADR 0005).

## Layout

- `src/lib/chains.ts` — per-chain Aave v3 config table (Pool + Oracle + Protocol
  Data Provider addresses, verified against bgd-labs/aave-address-book).
- `src/lib/aave/position.ts` — aggregate read (`getUserAccountData` → `Position`).
- `src/lib/aave/breakdown.ts` — per-asset read via the AaveProtocolDataProvider
  (`PositionBreakdown`), with a `reconciles` cross-check against the aggregate.
- `src/lib/aave/positionMath.ts` — pure, IO-free math (`reconcile`,
  `applyEModeOverrides`) split out of breakdown.ts so it is unit-testable.
- `src/lib/simulation/cascade.ts` — the deterministic liquidation cascade engine.
- `*.test.ts` (Vitest) — cover the cascade, liquidation price, reconcile, and the
  E-Mode override. These pin the math; keep them green when touching the engine.
- `src/lib/watchlist.ts` — localStorage persistence of watched addresses.
- `src/app/` — Next.js App Router UI; `actions.ts` has the client-side read
  helpers (`fetchBreakdown` for detail, `fetchSummary` for the lightweight list
  badges) — plain viem calls that run in the browser, not server actions.
- `src/components/Watchlist.tsx` — add form + persisted rows with health-factor
  badges; `CascadePanel.tsx` — per-asset table + Scenario chart/sliders.

## Status

Implements the full per-asset liquidation **cascade** (ADR 0003): reads each
asset's liquidation threshold, bonus, and the user's collateral/debt balances;
prices everything with the Aave Oracle; and replays repeated liquidations
(close factor + bonus) as the health factor re-crosses 1, including collateral
exhaustion / bad debt.

**E-Mode is applied** (Aave v3.2 model, `applyEMode` in `breakdown.ts`): when a
position has an active E-Mode category, the category's collateral bitmap selects
which assets get the category's boosted liquidation threshold and bonus, matching
`GenericLogic`. Verified on-chain: the per-asset reconstruction reconciles exactly
with `getUserAccountData` for both plain and E-Mode positions. All five chains are
on v3.2; if a future deployment predates the v3.2 getters they revert,
`reconciles` goes false, and the UI flags it.

The Scenario UI shocks prices in both directions: a **fall** slider per collateral
asset and a **rise** slider per (volatile) debt asset — so you can stress
collateral dropping and/or borrowed assets appreciating. The chart ramps the whole
shock vector from today's prices to the configured targets (`sweepScenario`),
running the full cascade at each step. Each slider shows that asset's
**liquidation price** — the price it must reach, others flat, for HF to hit 1
(`assetLiquidationPrice` for collateral falling, `debtLiquidationPrice` for debt
rising).

Addresses are a persisted **watchlist** (localStorage): watch several at once,
each row shows a live health-factor badge, click to open the full simulation.
Every read is a fresh on-chain snapshot — the detail shows an "updated N ago"
indicator and a Refresh button (there is no server and nothing is cached; every
view is a fresh browser-side read, per ADR 0001/0005).

### Known gaps / next

- **Isolation mode** and **siloed borrowing** are not modeled as distinct modes,
  but they fail safe rather than mis-pricing silently: the per-asset cascade is
  driven by each reserve's on-chain `usageAsCollateralEnabled` flag, and if the
  reconstruction diverges from `getUserAccountData` (`reconcile`), `reconciles`
  goes false and the UI shows the amber warning (`CascadePanel.tsx`). The
  aggregate summary (read from Aave directly) is always accurate regardless.
- The cascade applies Aave v3.1's **small-position close-factor rule** (`cascade.ts`,
  `MIN_BASE_MAX_CLOSE_FACTOR_THRESHOLD` = $2000): the 50% close factor only applies
  when the repaid debt and seized collateral reserves are each ≥ $2000 and HF > 0.95;
  otherwise the full reserve debt is liquidatable. The related `MIN_LEFTOVER_BASE`
  _revert_ (forbidding dust leftovers) is not modeled — the cascade approximates the
  liquidator per ADR 0003, so this only affects edge cases near the threshold.
