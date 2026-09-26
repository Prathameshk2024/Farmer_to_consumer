/**
 * Hero artwork — a woman entrepreneur with her jars, drawn as flat vector.
 *
 * Deliberately an illustration and not a stock photo:
 *  - it ships inside the bundle, so it costs no extra request on rural 4G,
 *    where a large hero photo is the slowest thing on the page;
 *  - stock photography of "Indian woman entrepreneur" is exactly the generic
 *    corporate look this brand should avoid.
 *
 * It is a SILHOUETTE on purpose. A drawn face would either look amateur or
 * look like one specific woman, and this page speaks for all of them.
 *
 * >>> REPLACE ME <<<  The best version of this is a real photograph of one of
 * your own sellers, taken during the village survey, with her permission.
 * Drop it in as <img src="..." alt="..."> inside the same <figure> and the
 * layout is unchanged.
 */
export default function HeroArt() {
  return (
    <svg
      viewBox="0 0 400 320"
      role="img"
      aria-labelledby="heroArtTitle"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <title id="heroArtTitle">
        गावातली महिला उद्योजिका आणि तिची घरगुती उत्पादने
      </title>

      {/* warm ground */}
      <rect width="400" height="320" fill="var(--gold-band)" />

      {/* soft arch behind her — a doorway, and a halo */}
      <path d="M112 300V158a88 88 0 0 1 176 0v142Z" fill="var(--gold-soft)" />

      {/* her silhouette: torso, then the head with the pallu draped over it */}
      <path d="M142 300c0-82 26-106 58-106s58 24 58 106Z" fill="var(--maroon)" />
      <ellipse cx="200" cy="158" rx="33" ry="37" fill="var(--maroon)" />
      {/* gold trim along the edge of the pallu */}
      <path
        d="M167 166a33 37 0 0 1 66 0"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M152 300c2-58 14-82 30-92"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.65"
      />

      {/* counter */}
      <rect x="0" y="286" width="400" height="34" fill="#d9bf8c" />
      <rect x="0" y="286" width="400" height="3" fill="#c7a973" />

      {/* her jars, sitting in front of her */}
      <Jar x={44} y={228} w={50} h={58} fill="var(--gold)" />
      <Jar x={102} y={242} w={42} h={44} fill="#a33a1f" />
      <Jar x={292} y={236} w={48} h={50} fill="var(--green)" />

      {/* a stack of papad on a plate */}
      <ellipse cx="248" cy="284" rx="30" ry="7" fill="#e8d4a8" />
      <ellipse cx="248" cy="278" rx="26" ry="6" fill="#f0dcb4" />
      <ellipse cx="248" cy="272" rx="26" ry="6" fill="#e6cf9f" />
      <ellipse cx="248" cy="266" rx="24" ry="6" fill="#f0dcb4" />
    </svg>
  )
}

function Jar({
  x, y, w, h, fill,
}: { x: number; y: number; w: number; h: number; fill: string }) {
  return (
    <g>
      {/* glass */}
      <rect x={x} y={y} width={w} height={h} rx="8" fill="#fffdf8" stroke="#e0d0ae" strokeWidth="2" />
      {/* contents, filling the lower two thirds */}
      <rect x={x + 5} y={y + h * 0.34} width={w - 10} height={h * 0.66 - 5} rx="5" fill={fill} />
      {/* lid */}
      <rect x={x - 3} y={y - 10} width={w + 6} height="12" rx="4" fill="var(--maroon)" />
    </g>
  )
}
