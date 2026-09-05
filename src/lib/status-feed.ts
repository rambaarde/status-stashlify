/**
 * Normalized status feed types for the standalone status site.
 */
export interface DayData {
	date: string
	status: string
}

/**
 * Normalized service row used by the UI.
 */
export interface ServiceData {
	name: string
	days: DayData[]
	currentStatus: string
	uptimePercent: string
}

/**
 * AI-drafted incident report shown on the public history page.
 */
export interface IncidentReport {
	id: string
	date: string
	serviceName: string
	severity: 'degraded' | 'down'
	title: string
	summary: string
	impact: string
	resolution: string
	generatedAt: string
	status: 'draft' | 'published'
	source: string
}

/**
 * Response shape consumed by the status UI.
 */
export interface StatusResponse {
	services: ServiceData[]
	incidentReports?: IncidentReport[]
}

const UPTIME_API_URL =
	process.env.NEXT_PUBLIC_UPTIME_API_URL ||
	'https://api.stashlify.com/uptime?days=90'

const STATIC_FEED_URLS = [
	process.env.NEXT_PUBLIC_STATUS_FEED_URL || '/status/current.json',
	'/status.json',
]

const FEED_TIME_ZONE =
	process.env.NEXT_PUBLIC_STATUS_FEED_TIME_ZONE || 'Asia/Manila'

/**
 * How many whole feed-calendar days a static JSON feed may lag before we stop
 * trusting it and attempt the live uptime API instead.
 *
 * Rationale:
 * - The public site is deployed via GitHub Pages, which can lag behind feed
 *   commits even when the recorder is healthy.
 * - The uptime API is a fallback only; it may temporarily report `nodata`
 *   while the static recorder already has correct daily snapshots.
 * - A small grace window keeps the public page stable during deploy delays
 *   without masking a genuinely abandoned static feed long-term.
 */
const STATIC_FEED_MAX_LAG_DAYS = 2

const SERVICE_NAMES = [
	'Dashboard & Storefront',
	'Inventory, Sales & Orders',
	'Payments',
	'Authentication',
]

function createFallbackDays(days = 90): DayData[] {
	const result: DayData[] = []
	for (let i = days - 1; i >= 0; i--) {
		const date = new Date()
		date.setUTCDate(date.getUTCDate() - i)
		result.push({
			date: toFeedDateKey(date),
			status: 'nodata',
		})
	}
	return result
}

/**
 * Format a date in the same timezone used by the recorder.
 */
function toFeedDateKey(date: Date): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: FEED_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date)
	const year = parts.find((part) => part.type === 'year')?.value
	const month = parts.find((part) => part.type === 'month')?.value
	const day = parts.find((part) => part.type === 'day')?.value

	if (!year || !month || !day) {
		return date.toISOString().split('T')[0]
	}

	return `${year}-${month}-${day}`
}

/**
 * Format incident generation time in the public status-site timezone.
 */
export function formatIncidentGeneratedAt(
	generatedAt: string,
): string {
	const date = new Date(generatedAt)

	if (Number.isNaN(date.getTime())) {
		return generatedAt
	}

	return new Intl.DateTimeFormat('en-US', {
		timeZone: FEED_TIME_ZONE,
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
	}).format(date)
}

function dayKeyToUtc(dayKey: string): number | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
	if (!match) return null

	const [, year, month, day] = match
	return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

/**
 * Static feed is acceptable as long as it is not materially stale. Pages deploy
 * lag of a few hours or one calendar day should not force a fallback to the
 * live uptime API.
 */
function isStaticFeedFreshEnough(feed: StatusResponse): boolean {
	const todayKey = toFeedDateKey(new Date())
	const latestDay = feed.services[0]?.days.at(-1)?.date

	if (!latestDay) {
		return false
	}

	const todayUtc = dayKeyToUtc(todayKey)
	const latestUtc = dayKeyToUtc(latestDay)

	if (todayUtc === null || latestUtc === null) {
		return latestDay === todayKey
	}

	const diffDays = Math.floor(
		(todayUtc - latestUtc) / (24 * 60 * 60 * 1000),
	)

	return diffDays <= STATIC_FEED_MAX_LAG_DAYS
}

export function createFallbackStatusResponse(): StatusResponse {
	return {
		services: SERVICE_NAMES.map((name) => ({
			name,
			currentStatus: 'nodata',
			// Total failure to load any feed measures nothing, so claim nothing.
			uptimePercent: '',
			days: createFallbackDays(),
		})),
	}
}

function normalizeStatusResponse(
	payload: unknown,
): StatusResponse | null {
	if (
		typeof payload !== 'object' ||
		payload === null ||
		!('services' in payload)
	) {
		return null
	}

	const maybeServices = (payload as { services?: unknown }).services
	if (!Array.isArray(maybeServices)) return null

	const services: ServiceData[] = []
	for (const item of maybeServices) {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof (item as { name?: unknown }).name !== 'string'
		) {
			continue
		}

		const rawDays = Array.isArray((item as { days?: unknown }).days)
			? ((item as { days?: unknown[] }).days || [])
			: []

		const days: DayData[] = rawDays
			.filter(
				(day) =>
					typeof day === 'object' &&
					day !== null &&
					typeof (day as { date?: unknown }).date === 'string' &&
					typeof (day as { status?: unknown }).status === 'string',
			)
			.map((day) => ({
				date: (day as { date: string }).date,
				status: (day as { status: string }).status,
			}))

		services.push({
			name: (item as { name: string }).name,
			days,
			currentStatus:
				typeof (item as { currentStatus?: unknown }).currentStatus === 'string'
					? (item as { currentStatus: string }).currentStatus
					: 'nodata',
			// '' means "not measured" and renders as "No uptime data". A missing
			// field is the same thing, so do not substitute a number here either.
			uptimePercent:
				typeof (item as { uptimePercent?: unknown }).uptimePercent === 'string'
					? (item as { uptimePercent: string }).uptimePercent
					: '',
		})
	}

	if (services.length === 0) return null
	const rawIncidentReports = Array.isArray(
		(payload as { incidentReports?: unknown }).incidentReports,
	)
		? ((payload as { incidentReports?: unknown[] }).incidentReports || [])
		: []
	const incidentReports = rawIncidentReports
		.filter(
			(report) =>
				typeof report === 'object' &&
				report !== null &&
				typeof (report as { id?: unknown }).id === 'string' &&
				typeof (report as { date?: unknown }).date === 'string' &&
				typeof (report as { serviceName?: unknown }).serviceName === 'string' &&
				((report as { severity?: unknown }).severity === 'degraded' ||
					(report as { severity?: unknown }).severity === 'down') &&
				typeof (report as { title?: unknown }).title === 'string' &&
				typeof (report as { summary?: unknown }).summary === 'string' &&
				typeof (report as { impact?: unknown }).impact === 'string' &&
				typeof (report as { resolution?: unknown }).resolution === 'string' &&
				typeof (report as { generatedAt?: unknown }).generatedAt === 'string' &&
				((report as { status?: unknown }).status === 'draft' ||
					(report as { status?: unknown }).status === 'published'),
		)
		.map((report) => ({
			id: (report as IncidentReport).id,
			date: (report as IncidentReport).date,
			serviceName: (report as IncidentReport).serviceName,
			severity: (report as IncidentReport).severity,
			title: (report as IncidentReport).title,
			summary: (report as IncidentReport).summary,
			impact: (report as IncidentReport).impact,
			resolution: (report as IncidentReport).resolution,
			generatedAt: (report as IncidentReport).generatedAt,
			status: (report as IncidentReport).status,
			source:
				typeof (report as { source?: unknown }).source === 'string'
					? (report as { source: string }).source
					: 'openrouter',
		}))

	return { services, incidentReports }
}

/**
 * Load the first valid static status feed from disk.
 */
async function loadStaticStatusFeed(): Promise<StatusResponse | null> {
	for (const feedUrl of STATIC_FEED_URLS) {
		try {
			const response = await fetch(feedUrl, {
				cache: 'no-store',
			})

			if (!response.ok) {
				continue
			}

			const normalized = normalizeStatusResponse(
				await response.json(),
			)
			if (normalized) return normalized
		} catch {
			// Try the next static feed before falling back to uptime.
		}
	}

	return null
}

/**
 * Load the JSON feed used by the public status page.
 */
export async function loadStatusFeed(): Promise<StatusResponse> {
	let staticFeed: StatusResponse | null = null

	try {
		staticFeed = await loadStaticStatusFeed()
		if (staticFeed && isStaticFeedFreshEnough(staticFeed)) {
			return staticFeed
		}
	} catch {
		// Fall through to the live uptime endpoint below.
	}

	try {
		const response = await fetch(UPTIME_API_URL, {
			cache: 'no-store',
		})

		if (!response.ok) {
			throw new Error('Uptime endpoint unavailable')
		}

		const normalized = normalizeStatusResponse(await response.json())
		if (normalized) {
			if (staticFeed?.incidentReports?.length) {
				return {
					services: normalized.services,
					incidentReports: staticFeed.incidentReports,
				}
			}
			return normalized
		}
	} catch {
		if (staticFeed) return staticFeed
		return createFallbackStatusResponse()
	}

	if (staticFeed) return staticFeed
	return createFallbackStatusResponse()
}
