# Headline the Position with a single Distance to Liquidation, as a uniform single-direction volatile move

A Position's safety is normally read off its Health Factor — a number that is
correct but abstract: it does not say _what would have to happen_ for liquidation
to begin. The app's reason to exist is to answer that question, so the detail view
leads with a **Distance to Liquidation**: the smallest single-direction price move
that brings the Health Factor to 1.

We define that move as **uniform across volatile assets in one direction** — either
all volatile Collateral falling together (stables held flat), or all volatile Debt
rising together — and report whichever needs the smaller move. The same axis drives
the default Scenario (Crash Severity), so the chart's Health-Factor-hits-1 crossing
equals the headline number: one story told as headline, curve, and cascade.

An asset is **volatile** when its Aave Oracle price sits outside a peg band around
$1; **stable** when inside it. This is derived from oracle data alone — no curated
token list — so it needs no per-asset or per-chain config and a depegged stablecoin
correctly reads as volatile. The math generalizes the existing per-asset
`assetLiquidationPrice` / `debtLiquidationPrice` (which move one asset, others flat)
to a uniform move across the volatile set.

This is a modeling assumption, not a prediction. Real crashes are not perfectly
uniform, and stables do depeg. We chose uniform-single-direction because it yields
one honest, interpretable number for the common case (a correlated crypto move)
while staying exact when there is only one volatile asset. The full per-asset
control remains available in the Scenario's Advanced disclosure for anyone who needs
to model a non-uniform move.

## Considered Options

### The metric

- **Uniform single-direction volatile move** (chosen) — one interpretable number;
  models a correlated move; collapses to the exact answer with one volatile asset.
- **Binding asset, falls alone** — what the per-asset functions already compute;
  precise but understates correlated risk and is ambiguous with several collateral
  assets. Kept as the Advanced/per-asset readout, not the headline.
- **Both sides at once** (collateral down _and_ debt up together) — more pessimistic
  and arguably realistic, but the chart crossing no longer matches a single-direction
  headline and "% of what" gets murky. Rejected for the default; reachable via
  Advanced sliders.

### Classifying volatile vs stable

- **Oracle peg band** (chosen) — data-driven, no config, catches depegs, multi-chain
  by construction. One threshold constant.
- **Symbol allowlist** — explicit and predictable, but must be maintained per new
  stablecoin, misses non-USD pegs, and cannot represent a depeg.
- **Ask the user per asset** — maximally correct, but pushes a modeling decision onto
  the user on first view.
