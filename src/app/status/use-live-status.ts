'use client'

/**
 * Makes each service's OWN status label live, instead of adding a second
 * "status" widget beside the one the page already has.
 *
 * WHY
 * The 90-day bars come from a static feed committed by a scheduled workflow.
 * Its cron asks for every 5 minutes, but GitHub throttles it: measured across 30 consecutive
 * runs the gap was min 101m, MEDIAN 211m, max 293m. So a service could read
 * "Operational" for ~3.5 hours after it stopped answering.
 *
 * The first attempt at this added a separate "Live check" strip. That was a
 * second thing claiming to be the status, which is confusing — the bars ARE
 * the status. So the live result now feeds the label each row already shows,
 * and the bars stay what they honestly are: history.
 *
 * The probe runs in the VISITOR'S browser, so it also measures reachability
 * from the public internet rather than from inside the monitored host, which
 * can look healthy while nobody can reach it.
 *
 * LIMIT, deliberately not papered over: a service whose URL sends no CORS
 * header for this origin cannot be probed from a browser at all. Any such
 * service keeps its feed status rather than being guessed at — see PROBE_URLS.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Service name -> a URL the browser may fetch. Names must match the feed's.
 * The storefront is probed at /api/health rather than `/`: that route exists
 * solely to answer this check and sends Access-Control-Allow-Origin for this
 * site, which the HTML responses do not.
 */
const PROBE_URLS: Record<string, string> = {
	'Dashboard & Storefront': 'https://stashlify.com/api/health',
	'Inventory, Sales & Orders': 'https://api.stashlify.com/health/ready',
	Payments: 'https://api.stashlify.com/health',
	Authentication: 'https://api.stashlify.com/health/ready',
}

const POLL_MS = 60_000
const TIMEOUT_MS = 10_000
/** Matches uptime.service.ts's own degraded rule so the two agree. */
const SLOW_MS = 5_000

export type LiveStatus = 'operational' | 'degraded' | 'down'

export interface LiveStatusState {
	/** Live status per service name; absent when that service is unprobeable. */
	statuses: Partial<Record<string, LiveStatus>>
	/** When the last sweep completed, for an "as of" line. */
	checkedAt: number | null
	recheck: () => void
}

async function probe(url: string): Promise<LiveStatus> {
	const started = Date.now()
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
		const elapsed = Date.now() - started
		// Any non-2xx counts as down: a 502 from a proxy still means unusable.
		if (!res.ok) return 'down'
		return elapsed > SLOW_MS ? 'degraded' : 'operational'
	} catch {
		return 'down'
	} finally {
		clearTimeout(timer)
	}
}

export function useLiveStatus(): LiveStatusState {
	const [statuses, setStatuses] = useState<Partial<Record<string, LiveStatus>>>({})
	const [checkedAt, setCheckedAt] = useState<number | null>(null)
	const inFlight = useRef(false)

	const sweep = useCallback(async () => {
		// A slow network must not stack overlapping sweeps.
		if (inFlight.current) return
		inFlight.current = true
		try {
			const entries = Object.entries(PROBE_URLS)
			const results = await Promise.all(
				entries.map(async ([name, url]) => [name, await probe(url)] as const),
			)
			setStatuses(Object.fromEntries(results))
			setCheckedAt(Date.now())
		} finally {
			inFlight.current = false
		}
	}, [])

	useEffect(() => {
		void sweep()
		const poll = setInterval(() => void sweep(), POLL_MS)
		// A backgrounded tab is throttled, so its last answer can be minutes
		// stale — re-check the moment the visitor looks again.
		const onVisible = () => {
			if (document.visibilityState === 'visible') void sweep()
		}
		document.addEventListener('visibilitychange', onVisible)
		return () => {
			clearInterval(poll)
			document.removeEventListener('visibilitychange', onVisible)
		}
	}, [sweep])

	return { statuses, checkedAt, recheck: sweep }
}
