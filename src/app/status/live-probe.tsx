'use client'

/**
 * LiveProbe — the "is it broken RIGHT NOW" strip above the historical bars.
 *
 * WHY THIS EXISTS
 * The 90-day bars below come from a static feed committed by a GitHub Action
 * whose cron says every 5 minutes but which GitHub actually throttles to a
 * measured median of ~3.5 hours (min 101m, max 293m over 30 sampled runs). So
 * if the API dies at 10:00, the page could keep claiming "All Systems
 * Operational" until roughly 13:30. That is the gap this closes.
 *
 * HOW
 * The visitor's own browser calls the health endpoint on mount and every 60s.
 * That makes it realtime (the answer is a request that just completed, not a
 * file written hours ago) and it measures reachability from the public
 * internet the way a customer experiences it — not from inside the box being
 * measured, which can look healthy while nobody can reach it.
 *
 * DELIBERATE LIMITS
 * - Not recorded: this proves one visitor's reachability at one moment. The
 *   historical bars below remain the source of truth for history.
 *   That is why a failure here says "can't reach", not "the service is down" —
 *   the visitor's own network is an equally likely cause.
 * - HTTP only, and only endpoints that permit this origin via CORS.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** Health endpoint. Must send Access-Control-Allow-Origin for this site. */
const HEALTH_URL =
	process.env.NEXT_PUBLIC_HEALTH_URL || 'https://api.stashlify.com/health'

/** How often to re-check while the tab is open. */
const POLL_MS = 60_000

/** Give up on a probe after this long and call it unreachable. */
const TIMEOUT_MS = 10_000

/** Slower than this and the API is up but not healthy — mirrors the backend's
 *  own 5s degraded threshold in uptime.service.ts, so the two agree. */
const SLOW_MS = 5_000

type ProbeState = 'checking' | 'ok' | 'slow' | 'unreachable'

const PRESENTATION: Record<
	Exclude<ProbeState, 'checking'>,
	{ dot: string; label: string }
> = {
	ok: { dot: '#76ad2a', label: 'Responding normally' },
	slow: { dot: '#e6a82a', label: 'Responding slowly' },
	// Phrased as reachability, not a verdict on the service: from a browser we
	// genuinely cannot tell an outage from the visitor's own broken network.
	unreachable: { dot: '#e04343', label: 'Not reachable from your browser' },
}

function agoLabel(at: number | null): string {
	if (!at) return ''
	const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
	if (secs < 5) return 'just now'
	if (secs < 60) return `${secs}s ago`
	return `${Math.floor(secs / 60)}m ago`
}

export function LiveProbe() {
	const [state, setState] = useState<ProbeState>('checking')
	const [ms, setMs] = useState<number | null>(null)
	const [checkedAt, setCheckedAt] = useState<number | null>(null)
	// Re-render once a second purely so the "Xs ago" label stays truthful.
	const [, setTick] = useState(0)
	const inFlight = useRef(false)

	const probe = useCallback(async () => {
		// A slow network must not stack overlapping probes.
		if (inFlight.current) return
		inFlight.current = true
		const started = Date.now()
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
		try {
			const res = await fetch(HEALTH_URL, {
				cache: 'no-store',
				signal: controller.signal,
			})
			const elapsed = Date.now() - started
			setMs(elapsed)
			// Any non-2xx is a failure: a 502 from a proxy still means the
			// visitor cannot use the product.
			setState(!res.ok ? 'unreachable' : elapsed > SLOW_MS ? 'slow' : 'ok')
		} catch {
			setMs(Date.now() - started)
			setState('unreachable')
		} finally {
			clearTimeout(timer)
			setCheckedAt(Date.now())
			inFlight.current = false
		}
	}, [])

	useEffect(() => {
		void probe()
		const poll = setInterval(() => void probe(), POLL_MS)
		const ticker = setInterval(() => setTick((t) => t + 1), 1_000)
		// A backgrounded tab is throttled by the browser, so its last result can
		// be minutes stale — re-probe the moment the visitor looks again.
		const onVisible = () => {
			if (document.visibilityState === 'visible') void probe()
		}
		document.addEventListener('visibilitychange', onVisible)
		return () => {
			clearInterval(poll)
			clearInterval(ticker)
			document.removeEventListener('visibilitychange', onVisible)
		}
	}, [probe])

	const view = state === 'checking' ? null : PRESENTATION[state]

	return (
		<div
			className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-[#e6e3da] bg-white px-4 py-2.5"
			aria-live="polite"
			data-testid="live-probe"
		>
			<span
				className="inline-block h-2 w-2 shrink-0 rounded-full"
				style={{
					backgroundColor: view ? view.dot : '#b0ada3',
					animation: state === 'checking' ? 'pulse 1.5s ease-in-out infinite' : undefined,
				}}
			/>
			<span className="text-[13px] font-semibold text-[#1f1f1d]">
				Live check
			</span>
			<span className="text-[13px] text-[#57554e]" data-testid="live-probe-label">
				{view ? view.label : 'Checking…'}
			</span>
			{view && ms !== null && (
				<span className="text-[12px] text-[#b0ada3]">
					{ms} ms · {agoLabel(checkedAt)}
				</span>
			)}
			<button
				type="button"
				onClick={() => void probe()}
				className="ml-auto text-[12px] text-[#57554e] underline underline-offset-2 hover:text-[#1f1f1d]"
			>
				Check now
			</button>
		</div>
	)
}
