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
 * Response shape consumed by the status UI.
 */
export interface StatusResponse {
	services: ServiceData[]
}

const UPTIME_API_URL =
	process.env.NEXT_PUBLIC_UPTIME_API_URL ||
	'https://api.stashlify.com/uptime?days=90'

const FALLBACK_FEED_URL =
	process.env.NEXT_PUBLIC_STATUS_FEED_URL || '/status.json'

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
		date.setDate(date.getDate() - i)
		result.push({
			date: date.toISOString().split('T')[0],
			status: 'nodata',
		})
	}
	return result
}

export function createFallbackStatusResponse(): StatusResponse {
	return {
		services: SERVICE_NAMES.map((name) => ({
			name,
			currentStatus: 'nodata',
			uptimePercent: '0.0',
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
			uptimePercent:
				typeof (item as { uptimePercent?: unknown }).uptimePercent === 'string'
					? (item as { uptimePercent: string }).uptimePercent
					: '0.0',
		})
	}

	if (services.length === 0) return null
	return { services }
}

/**
 * Load the JSON feed used by the public status page.
 */
export async function loadStatusFeed(): Promise<StatusResponse> {
	try {
		const response = await fetch(UPTIME_API_URL, {
			cache: 'no-store',
		})

		if (!response.ok) {
			throw new Error('Uptime endpoint unavailable')
		}

		const normalized = normalizeStatusResponse(
			await response.json(),
		)
		if (normalized) return normalized
	} catch {
		// Fall through to the static feed fallback below.
	}

	try {
		const response = await fetch(FALLBACK_FEED_URL, {
			cache: 'no-store',
		})

		if (!response.ok) {
			return createFallbackStatusResponse()
		}

		const normalized = normalizeStatusResponse(
			await response.json(),
		)
		return normalized ?? createFallbackStatusResponse()
	} catch {
		return createFallbackStatusResponse()
	}
}
