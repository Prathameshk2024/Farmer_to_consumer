/**
 * A donut for part-to-whole, drawn as plain SVG.
 *
 * No chart library. Every chart this console needs is a ring or a bar over at
 * most six values that the API has already aggregated, and a charting
 * dependency would be larger than the whole admin bundle to draw a circle.
 *
 * WHY A DONUT AND NOT A PIE
 * The hole carries the total. On a pie that number has to sit somewhere else,
 * and the first question anyone asks of "38% in the top band" is "of how
 * many?" - which on this programme is usually a number small enough that the
 * percentage alone would be misleading.
 *
 * WHAT MAKES IT READABLE
 *  - Every band is ordered, so colour is SEQUENTIAL: one hue, light to dark,
 *    never a rainbow. The ramp position IS the band position, so the ring can
 *    be read without consulting the legend.
 *  - A 2px gap of surface between segments, so two adjacent steps of the same
 *    hue never bleed into one another.
 *  - Identity is never colour alone: the legend prints the swatch, the label
 *    AND the value, which doubles as the table view a colour-blind or printing
 *    reader needs.
 *  - Each segment carries a native <title>, so hovering a slice names it
 *    without any tooltip machinery.
 */

export interface Slice {
  label: string
  value: number
}

/**
 * Sequential ramps, light to dark, monotone in lightness.
 *
 * Two hues because the console shows two different ordered measures side by
 * side, and one shared ramp would suggest the bands mean the same thing.
 * Both are the brand maroon and green extended into steps; nothing here is a
 * new colour, only a lighter and darker version of one already in the palette.
 */
export const RAMP_MAROON = ['#f2d4d8', '#dfa5ad', '#c0697a', '#98304a', '#6d1626']
export const RAMP_GREEN = ['#dfeee4', '#b0d2bd', '#7cb195', '#4c8a68', '#26663f']

const SIZE = 148
const R = 56
const STROKE = 24
const C = 2 * Math.PI * R
/** Surface showing between two segments, in path units. */
const GAP = 2.5

export function Donut({
  slices,
  ramp = RAMP_MAROON,
  centerLabel,
}: {
  slices: Slice[]
  ramp?: string[]
  /** Sits under the total in the hole. The total itself is computed. */
  centerLabel: string
}) {
  const total = slices.reduce((n, s) => n + s.value, 0)

  // Ramp positions are spread across the full range whatever the band count,
  // so three bands use light/mid/dark rather than the three lightest steps.
  const colorAt = (i: number) =>
    ramp[slices.length <= 1 ? ramp.length - 1 : Math.round((i * (ramp.length - 1)) / (slices.length - 1))]!

  let acc = 0

  return (
    <div className="donut">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="donut__svg"
        role="img"
        aria-label={`${centerLabel}: ${total}`}
      >
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {/* The track. Also the whole ring when there is nothing to show, so
              an empty programme draws a circle rather than nothing at all. */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none" stroke="var(--bg-2)" strokeWidth={STROKE}
          />

          {total > 0 && slices.map((s, i) => {
            const len = (s.value / total) * C
            const start = acc
            acc += len
            if (s.value === 0) return null
            return (
              <circle
                key={s.label}
                cx={SIZE / 2} cy={SIZE / 2} r={R}
                fill="none"
                stroke={colorAt(i)}
                strokeWidth={STROKE}
                // A single full-circle band must not have a gap cut into it.
                strokeDasharray={`${Math.max(0, len - (len < C ? GAP : 0))} ${C}`}
                strokeDashoffset={-start}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            )
          })}
        </g>

        <text x={SIZE / 2} y={SIZE / 2 - 2} className="donut__total">{total}</text>
        <text x={SIZE / 2} y={SIZE / 2 + 15} className="donut__cap">{centerLabel}</text>
      </svg>

      {/* Swatch, label AND value: the legend is also the table view. */}
      <ul className="legend">
        {slices.map((s, i) => (
          <li key={s.label}>
            <span className="legend__sw" style={{ background: colorAt(i) }} aria-hidden="true" />
            <span className="legend__l truncate">{s.label}</span>
            <span className="legend__v num">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
