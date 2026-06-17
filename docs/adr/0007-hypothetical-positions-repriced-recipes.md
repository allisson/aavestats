# Hypothetical Positions are re-priced recipes, edited by amount only

The app reads a real Position from a Watched Address. But a user often wants to
ask "what if?" about holdings they do not have on Aave — a different size, a
different asset mix, a position they are considering opening. A **Hypothetical
Position** answers that: a Position whose collateral and debt amounts are
supplied by the user rather than read on-chain, evaluated by the identical
liquidation math (Aave Oracle prices, per-reserve thresholds and bonuses, Close
Factor, E-Mode).

The whole simulation layer is already a pure function of `PositionBreakdown.assets`
— `simulateCascade`, `distanceToLiquidation`, `assetLiquidationPrice`, the Scenario
sweeps. So a Hypothetical Position is not a new engine; it is a **synthetic
`PositionBreakdown`** fed to the existing one. Fork (pre-fill from a Watched
Address's on-chain assets) and build-from-scratch (empty seed) are the same editor
with different initial state.

We constrain editing to **amounts only**. The user picks assets from the chain's
real reserve list; each asset's `priceUsd`, `liquidationThreshold`,
`liquidationBonus`, `decimals`, and `symbol` are read on-chain for that reserve and
never typed. There is no manual price field, because **moving the price is already
the Scenario's job** — the sliders deviate from the live Oracle baseline. E-Mode is
a category selector applied through the same `applyEModeOverrides` path; the
category bitmap, not an eligibility check, decides which assets get boosted
thresholds.

We persist the **recipe**, not the priced result: the chain, the E-Mode category,
a label, and per-asset `{asset, collateralAmount, debtAmount}`. On open we re-read
reserve config and Oracle prices and rebuild the breakdown live — the same
"fresh-read every view, nothing cached" model as a Watched Address (ADR 0001/0005).
The synthesized aggregate `Position` is computed from the edited assets, so it
`reconciles` by construction (there is nothing on-chain to diverge from); the
breakdown carries a `source: "watched" | "hypothetical"` discriminator so the UI
can badge it, suppress the reconcile warning, and relabel "refresh" as "re-price".

This is a deliberate constraint, not a limitation we failed to lift. Grounding
every parameter except the amounts in real on-chain data keeps a Hypothetical
Position honest — it is always priced the way Aave would price it (ADR 0002), and a
user cannot accidentally build a position that the math silently misvalues.
Validation stays minimal and fail-safe (non-negative amounts, no caps, no
"valid Aave position" enforcement), consistent with how isolation/siloed borrowing
already fail safe rather than mis-price.

## Considered Options

### What the user can edit

- **Amounts only, parameters read on-chain** (chosen) — every threshold, bonus, and
  starting price comes from the real reserve, so the math matches Aave exactly;
  price movement is expressed through the existing Scenario sliders. Small surface:
  an asset dropdown plus two number inputs per row.
- **Free-form sandbox** (type arbitrary price / threshold / bonus) — maximally
  flexible, but lets the user build positions Aave would never permit and price them
  with numbers Aave never used, breaking the grounding in ADR 0002. Rejected.

### Persistence

- **Persist the recipe, re-price live** (chosen) — stores only inputs, re-reads
  prices on open. Consistent with the no-cache, fresh-read-every-view model
  (ADR 0001/0005).
- **Persist the priced snapshot** — would cache Oracle-derived USD values, directly
  contradicting ADR 0001/0005. Rejected.
- **Ephemeral (no persistence)** — simplest, but loses saved what-ifs. Rejected for
  v1; the editor operates on a breakdown either way, so this remains reversible.

### Representation

- **Synthetic `PositionBreakdown` with a `source` discriminator** (chosen) — reuses
  the entire simulation engine untouched; the aggregate is derived from the edited
  assets and reconciles trivially. `ltv` is set to a sentinel because it is a borrow
  limit, not a liquidation input, and is not surfaced in the UI.
- **A parallel hypothetical-only data path** — duplicates the math for no benefit.
  Rejected.
