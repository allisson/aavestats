"use client";

/**
 * The signature instrument: a vertical depth gauge that reads a Position's
 * Health Factor as distance above the liquidation "waterline" (HF = 1.00).
 *
 * Depth mapping is the reciprocal of HF — `1/HF` — so the waterline sits at the
 * bottom (HF = 1), HF = 2 floats at half depth, and HF → ∞ rises to the surface.
 * It is bounded, monotonic, and compresses the safe (high-HF) range, giving the
 * actionable 1.0–2.0 band most of the dial. A plumb line drops from the surface
 * to the position weight; the clear / shoal / reef bands match the rest of the UI.
 */

const W = 178; // wide enough for the HF readout chip to the right of the channel
const SURFACE_Y = 18;
const WATERLINE_Y = 252;
const SEABED_Y = 300;
const TRACK_X1 = 92;
const TRACK_X2 = 120;
const PLUMB_X = (TRACK_X1 + TRACK_X2) / 2;

// Band thresholds — kept identical to healthColor() elsewhere.
const SHOAL_HF = 1.1;
const CLEAR_HF = 1.5;

/** Fraction from the surface (0) to the waterline (1) for a Health Factor. */
export function soundingDepth(hf: number): number {
  return 1 / hf;
}

function fracToY(frac: number): number {
  return SURFACE_Y + frac * (WATERLINE_Y - SURFACE_Y);
}

// HF < 1 lands the weight in the reef below the line; cap it at the seabed.
const MAX_FRAC = (SEABED_Y - SURFACE_Y) / (WATERLINE_Y - SURFACE_Y);

function band(hf: number | null): "reef" | "shoal" | "clear" | "calm" {
  if (hf == null) return "calm";
  if (hf < SHOAL_HF) return "reef";
  if (hf < CLEAR_HF) return "shoal";
  return "clear";
}

const BAND_COLOR = {
  reef: "var(--color-reef)",
  shoal: "var(--color-shoal)",
  clear: "var(--color-clear)",
  calm: "var(--color-bone)",
} as const;

function hfLabel(hf: number | null): string {
  if (hf == null) return "∞";
  if (hf >= 100) return "99+";
  if (hf >= 10) return hf.toFixed(0);
  return hf.toFixed(2);
}

export function SoundingGauge({
  healthFactor,
  height = 320,
  showScale = true,
  animate = true,
  ariaLabel,
}: {
  healthFactor: number | null;
  height?: number;
  /** Depth scale ticks + the waterline label (hero); off for compact reuse. */
  showScale?: boolean;
  /** Smooth transition as the value changes (live scenario gauge). */
  animate?: boolean;
  ariaLabel?: string;
}) {
  const tone = band(healthFactor);
  const color = BAND_COLOR[tone];

  // Surface (HF → ∞) when there's no debt; otherwise the reciprocal depth.
  const frac =
    healthFactor == null ? 0 : Math.min(soundingDepth(healthFactor), MAX_FRAC);
  const markerY = fracToY(frac);

  const scale = [3, 2, CLEAR_HF].map((hf) => ({ hf, y: fracToY(1 / hf) }));

  const label =
    ariaLabel ??
    (healthFactor == null
      ? "No debt — no liquidation risk"
      : `Health factor ${hfLabel(healthFactor)}, waterline at 1.00`);

  return (
    <svg
      viewBox={`0 0 ${W} ${SEABED_Y + 16}`}
      width={(W / (SEABED_Y + 16)) * height}
      height={height}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      {/* Band fills behind the channel. */}
      <g opacity={0.5}>
        <rect
          x={TRACK_X1}
          y={SURFACE_Y}
          width={TRACK_X2 - TRACK_X1}
          height={fracToY(1 / CLEAR_HF) - SURFACE_Y}
          fill="var(--color-clear)"
          fillOpacity={0.1}
        />
        <rect
          x={TRACK_X1}
          y={fracToY(1 / CLEAR_HF)}
          width={TRACK_X2 - TRACK_X1}
          height={fracToY(1 / SHOAL_HF) - fracToY(1 / CLEAR_HF)}
          fill="var(--color-shoal)"
          fillOpacity={0.12}
        />
        <rect
          x={TRACK_X1}
          y={fracToY(1 / SHOAL_HF)}
          width={TRACK_X2 - TRACK_X1}
          height={WATERLINE_Y - fracToY(1 / SHOAL_HF)}
          fill="var(--color-reef)"
          fillOpacity={0.14}
        />
        {/* The reef below the line — already liquidatable water. */}
        <rect
          x={TRACK_X1}
          y={WATERLINE_Y}
          width={TRACK_X2 - TRACK_X1}
          height={SEABED_Y - WATERLINE_Y}
          fill="var(--color-reef)"
          fillOpacity={0.28}
        />
      </g>

      {/* Channel outline. */}
      <rect
        x={TRACK_X1}
        y={SURFACE_Y}
        width={TRACK_X2 - TRACK_X1}
        height={SEABED_Y - SURFACE_Y}
        fill="none"
        stroke="var(--color-steel)"
        strokeWidth={1}
        rx={3}
      />

      {/* Depth scale: ticks + HF labels on the left. */}
      {showScale &&
        scale.map(({ hf, y }) => (
          <g key={hf}>
            <line
              x1={TRACK_X1 - 6}
              x2={TRACK_X1}
              y1={y}
              y2={y}
              stroke="var(--color-steel)"
            />
            <text
              x={TRACK_X1 - 10}
              y={y + 3.5}
              textAnchor="end"
              fill="var(--color-mist)"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {hf}
            </text>
          </g>
        ))}

      {/* The waterline — the one bright reference. */}
      <line
        x1={TRACK_X1 - (showScale ? 6 : 0)}
        x2={W - 4}
        y1={WATERLINE_Y}
        y2={WATERLINE_Y}
        stroke="var(--color-reef)"
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
      {showScale && (
        <text
          x={TRACK_X1 - 10}
          y={WATERLINE_Y + 3.5}
          textAnchor="end"
          fill="var(--color-reef)"
          fontSize={10}
          fontWeight={600}
          fontFamily="var(--font-mono)"
        >
          1.00
        </text>
      )}

      {/* Plumb line: the sounding cable from the surface down the channel. */}
      <line
        x1={PLUMB_X}
        x2={PLUMB_X}
        y1={SURFACE_Y}
        y2={SEABED_Y}
        stroke="var(--color-steel)"
        strokeWidth={1}
      />

      {/* The position weight, hung at its depth. */}
      <g
        className={animate ? "gauge-marker" : undefined}
        style={{ transform: `translateY(${markerY}px)` }}
      >
        <line
          x1={TRACK_X1}
          x2={TRACK_X2}
          y1={0}
          y2={0}
          stroke={color}
          strokeWidth={2}
        />
        <circle cx={PLUMB_X} cy={0} r={5} fill={color} />
        {showScale && (
          <>
            <rect
              x={TRACK_X2 + 6}
              y={-9}
              width={hfLabel(healthFactor).length * 8 + 12}
              height={18}
              rx={3}
              fill="var(--color-deep)"
              stroke={color}
              strokeOpacity={0.5}
            />
            <text
              x={TRACK_X2 + 12}
              y={3.5}
              fill={color}
              fontSize={11}
              fontWeight={600}
              fontFamily="var(--font-mono)"
            >
              {hfLabel(healthFactor)}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}
