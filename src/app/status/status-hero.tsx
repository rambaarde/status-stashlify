/**
 * Decorative hero band for the public status page.
 *
 * Purely ornamental: a fulfilment line — racking, a conveyor of crates, a pick
 * arm, instrumentation, and the crew keeping it running — drawn as inline SVG
 * so the static GitHub Pages export carries no image requests and the art
 * re-colours with the theme.
 *
 * Composition notes:
 * - Everything stands on one baseline (BELT_TOP), so nothing floats.
 * - The viewBox is deliberately wider than the band and anchored `xMidYMax`,
 *   so widescreen viewports crop the sparse sides rather than the belt.
 * - Layers are `<g>`s carrying their own `text-*` class; `currentColor` themes
 *   each layer without duplicating geometry.
 * - The crew are drawn as outlines, not fills. Filled figures out-weigh the
 *   machinery and pull the eye off the status banner that overlaps this band.
 *
 * aria-hidden: it states nothing the banner and status rows below do not.
 */

/** Deck height of the conveyor. Every object in the scene sits on this line. */
const BELT_TOP = 236

/** Evenly spaced conveyor rollers. */
function Rollers() {
	return (
		<>
			{Array.from({ length: 30 }, (_, i) => (
				<circle key={i} cx={110 + i * 46} cy={BELT_TOP + 18} r="7" />
			))}
		</>
	)
}

/** Slatted crate, seated on the belt. */
function Crate({ x, w, h }: { x: number; w: number; h: number }) {
	return (
		<>
			<rect x={x} y={BELT_TOP - h} width={w} height={h} rx="2" />
			<rect
				x={x + w / 2 - 2}
				y={BELT_TOP - h}
				width="4"
				height={h}
				className="text-black/10 dark:text-white/10"
				fill="currentColor"
			/>
		</>
	)
}

/**
 * A crew member in coveralls, drawn as an outline so the figures sit *in* the
 * scene rather than on top of it.
 *
 * @param x     horizontal centre
 * @param arms  path data for both arms, from the shoulders
 * @param flip  mirror the figure so the line does not read as a repeat
 * @param scale relative size; the line reads better with slight variation
 */
function Worker({
	x,
	arms,
	flip = false,
	scale = 1,
}: {
	x: number
	arms: string
	flip?: boolean
	scale?: number
}) {
	// 104 tall at scale 1, standing on the belt.
	const y = BELT_TOP - 104 * scale
	return (
		<g
			transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}
			fill="none"
			stroke="currentColor"
			strokeWidth="7"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M-11 78v26 M11 78v26" />
			<rect x="-19" y="34" width="38" height="46" rx="16" />
			<path d={arms} />
			<circle cx="0" cy="20" r="15" />
			{/* Hard hat — the one filled element, so the eye finds the crew */}
			<g fill="#F2B705" stroke="none">
				<path d="M-16 10a16 16 0 0 1 32 0z" />
				<rect x="-21" y="8" width="42" height="7" rx="3" />
			</g>
		</g>
	)
}

export function StatusHero() {
	return (
		<div
			aria-hidden
			className="pointer-events-none select-none relative left-1/2 -translate-x-1/2 w-screen h-[170px] sm:h-[220px] md:h-[268px]"
		>
			<svg
				viewBox="0 0 1600 300"
				preserveAspectRatio="xMidYMax slice"
				className="w-full h-full"
			>
				{/* ── Far layer: racking, standing on the belt line ── */}
				<g
					className="text-[#E8E5DC] dark:text-[#151515]"
					fill="currentColor"
				>
					<rect x="20" y="96" width="8" height="140" />
					<rect x="176" y="96" width="8" height="140" />
					<rect x="20" y="96" width="164" height="8" />
					<rect x="20" y="158" width="164" height="8" />
					<rect x="40" y="112" width="52" height="46" />
					<rect x="108" y="122" width="42" height="36" />
					<rect x="34" y="176" width="62" height="60" />
					<rect x="112" y="192" width="48" height="44" />

					<rect x="1416" y="80" width="8" height="156" />
					<rect x="1572" y="80" width="8" height="156" />
					<rect x="1416" y="80" width="164" height="8" />
					<rect x="1416" y="150" width="164" height="8" />
					<rect x="1436" y="98" width="56" height="52" />
					<rect x="1444" y="176" width="60" height="60" />

					{/* Overhead gantry */}
					<rect x="300" y="44" width="900" height="8" />
					<rect x="404" y="52" width="8" height="34" />
					<rect x="1092" y="52" width="8" height="34" />
				</g>

				{/* ── Mid layer: the working machinery ── */}
				<g
					className="text-[#D6D2C7] dark:text-[#202020]"
					fill="currentColor"
				>
					{/* Pipe run, elbow down into the line */}
					<rect x="240" y="74" width="620" height="15" rx="3" />
					<circle cx="248" cy="82" r="13" />
					<circle cx="852" cy="82" r="13" />
					<rect x="845" y="82" width="15" height="76" rx="3" />
					<rect x="845" y="144" width="180" height="15" rx="3" />
					<rect x="470" y="58" width="28" height="44" rx="3" />
					<rect x="690" y="58" width="28" height="44" rx="3" />

					{/* Pick arm reaching over the belt */}
					<rect x="1150" y="150" width="24" height="86" rx="4" />
					<rect x="1114" y="140" width="96" height="18" rx="7" />
					<rect
						x="1040"
						y="112"
						width="110"
						height="15"
						rx="7"
						transform="rotate(-26 1040 112)"
					/>
					<circle cx="1162" cy="150" r="16" />

					{/* Gauges */}
					<circle cx="1290" cy="104" r="30" />
					<circle cx="1340" cy="130" r="19" />
					<rect x="1268" y="134" width="44" height="102" rx="4" />

					{/* Conveyor: deck, belt edge, rollers, end housings */}
					<rect x="96" y={BELT_TOP} width="1400" height="14" rx="2" />
					<rect x="96" y={BELT_TOP + 30} width="1400" height="10" rx="2" />
					<Rollers />
					<rect x="60" y={BELT_TOP - 22} width="44" height="62" rx="5" />
					<rect x="1488" y={BELT_TOP - 22} width="52" height="62" rx="5" />
				</g>

				{/* ── Near layer: cargo riding the belt ── */}
				<g
					className="text-[#C8C3B6] dark:text-[#2C2C2C]"
					fill="currentColor"
				>
					<Crate x={352} w={84} h={62} />
					<Crate x={604} w={68} h={46} />
					<Crate x={928} w={96} h={72} />
					<Crate x={1236} w={62} h={44} />
				</g>

				{/* ── Crew ── */}
				<g className="text-[#3B3A36] dark:text-[#8A867B]">
					<Worker x={286} arms="M-17 48 L-42 64 M17 48 L38 60" scale={0.95} />
					<Worker x={528} arms="M-17 46 L-44 14 M17 46 L42 18" />
					<Worker x={800} flip arms="M-17 48 L-46 32 M17 48 L40 54" scale={0.9} />
					<Worker x={1108} arms="M-17 46 L-44 26 M17 46 L36 62" scale={0.85} />
				</g>

				{/* ── Accent: hazard stripes and the gauge needle ── */}
				<g fill="#F2B705">
					<rect x="60" y={BELT_TOP + 40} width="44" height="8" />
					<rect x="1488" y={BELT_TOP + 40} width="52" height="8" />
					<path d="M1286 82h8v22h-8z" />
					<circle cx="1290" cy="104" r="7" />
				</g>
			</svg>
		</div>
	)
}
