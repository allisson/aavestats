# Model the liquidator with a deterministic strategy in multi-asset Scenarios

In reality a liquidator chooses which debt to repay and which collateral to
seize, and several liquidators may act in sequence. To make a multi-asset cascade
reproducible, the Scenario models a single deterministic strategy instead of the
open-ended real-world choice: at each liquidation step it repays the largest debt
position and seizes from the collateral with the highest liquidation bonus,
applying the Close Factor (up to 50% above a 0.95 Health Factor, up to 100% below
it) and the per-asset liquidation bonus. It then recomputes and repeats while the
Health Factor is below 1.

This is an assumption, not a guarantee — actual liquidators optimize for their own
profit and may pick differently. We chose determinism so a Scenario is repeatable
and explainable. The strategy is isolated behind one function so it can be swapped
or made configurable later. The UI should state that the cascade reflects a
modeled strategy, not a prediction of which liquidators will act.

## Considered Options

- **Deterministic single strategy** (chosen) — repeatable, explainable, simple.
- **Worst-case / best-case bracket** — show a range across strategies. More honest
  about uncertainty, but more to build and harder to read; deferred.
- **Only single-collateral/single-debt** — no ambiguity, but can't simulate real
  complex Positions. Rejected as too limiting.
