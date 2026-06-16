"use client";

import { useMemo } from "react";
import type { PositionBreakdown } from "@/lib/aave/breakdown";
import { distanceToLiquidation } from "@/lib/simulation/cascade";

const pct = (f: number) => `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;

// Color the headline by how close the position is to the edge.
function moveColor(fraction: number): string {
  if (fraction < 0.1) return "text-red-400";
  if (fraction < 0.25) return "text-amber-400";
  return "text-green-400";
}

/**
 * The headline answer: how far this Position is from liquidation, expressed as the
 * smallest single-direction price move that brings the health factor to 1. See
 * docs/adr/0004 and CONTEXT.md ("Distance to Liquidation").
 */
export function Hero({ breakdown }: { breakdown: PositionBreakdown }) {
  const distance = useMemo(() => distanceToLiquidation(breakdown), [breakdown]);

  let big: string;
  let bigClass: string;
  let caption: string;

  switch (distance.kind) {
    case "collateral-fall":
      big = `−${pct(distance.dropFraction)}`;
      bigClass = moveColor(distance.dropFraction);
      caption =
        "Volatile collateral can fall this much, together, before liquidation begins.";
      break;
    case "debt-rise":
      big = `+${pct(distance.riseFraction)}`;
      bigClass = moveColor(distance.riseFraction);
      caption =
        "Volatile debt can rise this much, together, before liquidation begins.";
      break;
    case "eligible-now":
      big = "Eligible now";
      bigClass = "text-red-400";
      caption =
        "The health factor is already at or below 1 — this position can be liquidated at current prices.";
      break;
    case "no-debt":
      big = "No debt";
      bigClass = "text-neutral-300";
      caption = "This position has no debt, so it cannot be liquidated.";
      break;
    case "no-risk":
      big = "No price risk";
      bigClass = "text-green-400";
      caption =
        "No volatile price move alone brings this position to liquidation.";
      break;
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        Distance to liquidation
      </div>
      <div className={`mt-1 font-mono text-4xl font-semibold ${bigClass}`}>
        {big}
      </div>
      <p className="mt-2 text-sm text-neutral-400">{caption}</p>
    </div>
  );
}
