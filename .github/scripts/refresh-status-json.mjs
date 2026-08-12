import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HISTORY_DAYS = 90
const OPENROUTER_API_URL =
	'https://openrouter.ai/api/v1/chat/completions'
const STATUS_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'public',
	'status',
)
const CURRENT_STATUS_FILE = path.join(STATUS_ROOT, 'current.json')
const LEGACY_STATUS_FILE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'public',
	'status.json',
)
const ARCHIVE_ROOT = path.join(STATUS_ROOT, 'archive')
const FEED_TIME_ZONE = process.env.STATUS_FEED_TIME_ZONE || 'Asia/Manila'
const OPENROUTER_MODEL =
	process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
const OPENROUTER_REFERER =
	process.env.OPENROUTER_REFERER || 'https://status.stashlify.com'
const OPENROUTER_TITLE =
	process.env.OPENROUTER_TITLE || 'Stashlify Status'

const SERVICES = [
	{
		key: 'dashboard_storefront',
		name: 'Dashboard & Storefront',
		url: 'https://stashlify.com/',
	},
	{
		key: 'inventory_sales_orders',
		name: 'Inventory, Sales & Orders',
		url: 'https://api.stashlify.com/health/ready',
	},
	{
		key: 'payments',
		name: 'Payments',
		url: 'https://api.stashlify.com/health',
	},
	{
		key: 'authentication',
		name: 'Authentication',
		url: 'https://api.stashlify.com/health/ready',
	},
]

const SIMULATED_SERVICE = {
	dashboard_storefront: 'Dashboard & Storefront',
	inventory_sales_orders: 'Inventory, Sales & Orders',
	payments: 'Payments',
	authentication: 'Authentication',
}

/**
 * Create a stable id for an incident report entry.
 * @param {string} date
 * @param {string} serviceName
 * @returns {string}
 */
function createIncidentReportId(date, serviceName) {
	return `${date}:${serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/**
 * Resolve the manual simulation target from workflow input.
 * @returns {string | null}
 */
function getSimulatedServiceName() {
	const key = process.env.SIMULATE_SERVICE || 'none'
	return key && key !== 'none' ? SIMULATED_SERVICE[key] ?? null : null
}

/**
 * Format a day in the feed timezone as `YYYY-MM-DD`.
 * @param {Date} date
 * @returns {string}
 */
function toDateKey(date) {
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
		throw new Error('Failed to format feed date')
	}

	return `${year}-${month}-${day}`
}

/**
 * Build a rolling window of days for the feed.
 * @param {number} days
 * @param {'operational' | 'nodata'} fillStatus
 * @returns {{date: string, status: string}[]}
 */
function createDays(days, fillStatus = 'nodata') {
	const result = []
	for (let i = days - 1; i >= 0; i--) {
		const date = new Date()
		date.setUTCDate(date.getUTCDate() - i)
		result.push({
			date: toDateKey(date),
			status: fillStatus,
		})
	}
	return result
}

/**
 * Create a populated status feed and empty incident list by default.
 * @returns {{
 *   services: {
 *     name: string
 *     days: {date: string, status: string}[]
 *     currentStatus: string
 *     uptimePercent: string
 *   }[]
 *   incidentReports: {
 *     id: string
 *     date: string
 *     serviceName: string
 *     severity: 'degraded' | 'down'
 *     title: string
 *     summary: string
 *     impact: string
 *     resolution: string
 *     generatedAt: string
 *     status: 'draft' | 'published'
 *     source: string
 *   }[]
 * }}
 */
function createBaseFeed() {
	return {
		services: SERVICES.map((service) => ({
			name: service.name,
			days: createDays(HISTORY_DAYS, 'nodata'),
			currentStatus: 'nodata',
			uptimePercent: '100.0',
		})),
		incidentReports: [],
	}
}

/**
 * Build a compact daily archive record for the long-term history tree.
 * @param {{name: string, currentStatus: string}[]} services
 * @param {string} date
 * @returns {{date: string, services: {name: string, status: string}[]}}
 */
function createArchiveRecord(services, date) {
	return {
		date,
		services: services.map((service) => ({
			name: service.name,
			status: normalizeStatus(service.currentStatus),
		})),
	}
}

/**
 * Normalize a single incident report entry.
 * @param {unknown} item
 * @returns {null | {
 *   id: string
 *   date: string
 *   serviceName: string
 *   severity: 'degraded' | 'down'
 *   title: string
 *   summary: string
 *   impact: string
 *   resolution: string
 *   generatedAt: string
 *   status: 'draft' | 'published'
 *   source: string
 * }}
 */
function normalizeIncidentReport(item) {
	if (
		typeof item !== 'object' ||
		item === null ||
		typeof item.id !== 'string' ||
		typeof item.date !== 'string' ||
		typeof item.serviceName !== 'string' ||
		typeof item.severity !== 'string' ||
		typeof item.title !== 'string' ||
		typeof item.summary !== 'string' ||
		typeof item.impact !== 'string' ||
		typeof item.resolution !== 'string'
	) {
		return null
	}

	const severity =
		item.severity === 'degraded' || item.severity === 'down'
			? item.severity
			: null
	if (!severity) return null

	return {
		id: item.id,
		date: item.date,
		serviceName: item.serviceName,
		severity,
		title: item.title,
		summary: item.summary,
		impact: item.impact,
		resolution: item.resolution,
		generatedAt:
			typeof item.generatedAt === 'string'
				? item.generatedAt
				: new Date().toISOString(),
		status: 'published',
		source:
			typeof item.source === 'string'
				? item.source
				: 'openrouter',
	}
}

/**
 * Normalize stored incident reports for the feed.
 * @param {unknown} reports
 * @returns {ReturnType<typeof createBaseFeed>['incidentReports']}
 */
function normalizeIncidentReports(reports) {
	if (!Array.isArray(reports)) return []
	return reports.map(normalizeIncidentReport).filter(Boolean)
}

/**
 * Normalize any existing feed so missing days become operational.
 * @param {unknown} payload
 * @returns {{
 *   services: {
 *     name: string
 *     days: {date: string, status: string}[]
 *     currentStatus: string
 *     uptimePercent: string
 *   }[]
 *   incidentReports: ReturnType<typeof normalizeIncidentReports>
 * }}
 */
function normalizeExistingFeed(payload) {
	const base = createBaseFeed()
	if (
		typeof payload !== 'object' ||
		payload === null ||
		!Array.isArray(payload.services)
	) {
		return base
	}

	const byName = new Map()
	for (const item of payload.services) {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof item.name !== 'string' ||
			!Array.isArray(item.days)
		) {
			continue
		}

		byName.set(item.name, item)
	}

	return {
		services: base.services.map((service) => {
			const existing = byName.get(service.name)
			if (!existing) return service

			const dayMap = new Map()
			for (const day of existing.days) {
				if (
					typeof day !== 'object' ||
					day === null ||
					typeof day.date !== 'string' ||
					typeof day.status !== 'string'
				) {
					continue
				}

				dayMap.set(day.date, normalizeStatus(day.status))
			}

			const days = service.days.map((day) => ({
				date: day.date,
				// No recorded probe for this day => 'nodata'. Previously defaulted
				// to 'operational', which silently published unmeasured days as
				// healthy — the single biggest source of false green on the feed.
				status: dayMap.get(day.date) ?? 'nodata',
			}))

			return {
				name: service.name,
				days,
				currentStatus: getCurrentStatus(days),
				uptimePercent: getUptimePercent(days),
			}
		}),
		incidentReports: normalizeIncidentReports(
			payload.incidentReports,
		),
	}
}

/**
 * Clamp unknown feed statuses to supported values.
 * @param {string} status
 * @returns {'nodata' | 'operational' | 'degraded' | 'down'}
 */
function normalizeStatus(status) {
	if (status === 'operational' || status === 'degraded' || status === 'down') {
		return status
	}
	// Anything unrecognized means we do not know the state — never assume health.
	// A status page that guesses green is worse than one that admits a gap.
	return 'nodata'
}

/**
 * Derive the public "current status" from the latest day.
 * @param {{date: string, status: string}[]} days
 * @returns {string}
 */
function getCurrentStatus(days) {
	const latest = days[days.length - 1]
	return latest?.status ?? 'nodata'
}

/**
 * Calculate the visible uptime percentage for the public feed.
 * @param {{date: string, status: string}[]} days
 * @returns {string}
 */
function getUptimePercent(days) {
	// Uptime is a share of MEASURED time, not of calendar days. Unmeasured days
	// are excluded from both sides of the ratio: counting them as healthy
	// inflated the figure, and counting them as downtime would understate it.
	// Neither is true — we simply have no observation for those days.
	const measured = days.filter((day) => day.status !== 'nodata')
	if (measured.length === 0) return '100.0'
	const operationalDays = measured.filter(
		(day) => day.status === 'operational',
	).length
	return ((operationalDays / measured.length) * 100).toFixed(1)
}

/**
 * Probe a single service endpoint and convert the result into a status row.
 * @param {{name: string, url: string}} service
 * @returns {Promise<{
 *   name: string
 *   status: 'operational' | 'degraded' | 'down'
 *   responseMs: number
 *   statusCode: number | null
 * }>}
 */
async function probeService(service) {
	const start = Date.now()
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 10000)

	try {
		const response = await fetch(service.url, {
			method: 'GET',
			redirect: 'follow',
			signal: controller.signal,
		})

		clearTimeout(timeout)
		const responseMs = Date.now() - start

		if (!response.ok) {
			return {
				name: service.name,
				status: 'down',
				responseMs,
				statusCode: response.status,
			}
		}

		if (responseMs > 5000) {
			return {
				name: service.name,
				status: 'degraded',
				responseMs,
				statusCode: response.status,
			}
		}

		return {
			name: service.name,
			status: 'operational',
			responseMs,
			statusCode: response.status,
		}
	} catch {
		clearTimeout(timeout)
		return {
			name: service.name,
			status: 'down',
			responseMs: Date.now() - start,
			statusCode: null,
		}
	}
}

/**
 * Build the structured prompt for OpenRouter.
 * @param {{
 *   serviceName: string
 *   date: string
 *   status: 'degraded' | 'down'
 *   responseMs: number
 *   statusCode: number | null
 * }} incident
 * @returns {string}
 */
function buildIncidentPrompt(incident) {
	return [
		'Write a concise public incident report for Stashlify.',
		'Use only the facts provided below.',
		'Do not guess at root cause.',
		'If the root cause is unknown, say it is under investigation.',
		'Keep the tone customer-facing, factual, and calm.',
		'',
		`Date: ${incident.date}`,
		`Service: ${incident.serviceName}`,
		`Severity: ${incident.status}`,
		`Observed HTTP status: ${incident.statusCode ?? 'network error'}`,
		`Observed response time: ${incident.responseMs}ms`,
	].join('\n')
}

/**
 * Generate a public incident report with OpenRouter.
 * @param {{
 *   serviceName: string
 *   date: string
 *   status: 'degraded' | 'down'
 *   responseMs: number
 *   statusCode: number | null
 * }} incident
 * @returns {Promise<null | {
 *   id: string
 *   date: string
 *   serviceName: string
 *   severity: 'degraded' | 'down'
 *   title: string
 *   summary: string
 *   impact: string
 *   resolution: string
 *   generatedAt: string
 *   status: 'draft'
 *   source: 'openrouter'
 * }>}
 */
async function generateIncidentReport(incident) {
	const apiKey = process.env.OPENROUTER_API_KEY
	if (!apiKey) return null

	const response = await fetch(OPENROUTER_API_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': OPENROUTER_REFERER,
			'X-Title': OPENROUTER_TITLE,
		},
		body: JSON.stringify({
			model: OPENROUTER_MODEL,
			temperature: 0.2,
			stream: false,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'stashlify_incident_report',
					strict: true,
					schema: {
						type: 'object',
						additionalProperties: false,
						properties: {
							title: {
								type: 'string',
							},
							summary: {
								type: 'string',
							},
							impact: {
								type: 'string',
							},
							resolution: {
								type: 'string',
							},
							severity: {
								type: 'string',
								enum: ['degraded', 'down'],
							},
						},
						required: [
							'title',
							'summary',
							'impact',
							'resolution',
							'severity',
						],
					},
				},
			},
			messages: [
				{
					role: 'system',
					content:
						'You write short, accurate incident summaries for a public status page.',
				},
				{
					role: 'user',
					content: buildIncidentPrompt(incident),
				},
			],
		}),
	})

	if (!response.ok) {
		throw new Error(`OpenRouter returned ${response.status}`)
	}

	const payload = await response.json()
	const content = payload?.choices?.[0]?.message?.content
	if (typeof content !== 'string') return null

	const parsed = JSON.parse(content)
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		typeof parsed.title !== 'string' ||
		typeof parsed.summary !== 'string' ||
		typeof parsed.impact !== 'string' ||
		typeof parsed.resolution !== 'string' ||
		(parsed.severity !== 'degraded' && parsed.severity !== 'down')
	) {
		return null
	}

	return {
		id: createIncidentReportId(incident.date, incident.serviceName),
		date: incident.date,
		serviceName: incident.serviceName,
		severity: parsed.severity,
		title: parsed.title,
		summary: parsed.summary,
		impact: parsed.impact,
		resolution: parsed.resolution,
		generatedAt: new Date().toISOString(),
		status: 'published',
		source: 'openrouter',
	}
}

/**
 * Refresh the public status feed in-place so GitHub Actions can publish it.
 */
async function main() {
	const existingFeed = await loadExistingFeed()
	const simulatedServiceName = getSimulatedServiceName()
	const probeResults = await Promise.all(
		SERVICES.map((service) => probeService(service)),
	)
	const normalizedResults = probeResults.map((result) => {
		if (result.name !== simulatedServiceName) return result
		return {
			name: result.name,
			status: 'down',
			responseMs: result.responseMs,
			statusCode: null,
		}
	})
	const probeMap = new Map(
		normalizedResults.map((result) => [result.name, result]),
	)
	const todayKey = toDateKey(new Date())
	const incidentReports = [...existingFeed.incidentReports]
	const serviceRows = []
	const incidentCandidates = []

	for (const service of existingFeed.services) {
		// Carry 'nodata' through untouched. This previously rewrote every
		// unmeasured day to 'operational' immediately before publishing, so a day
		// the recorder never ran looked identical to a day everything was healthy.
		// The frontend already renders 'nodata' as grey — it was simply never
		// receiving it.
		const days = service.days.map((day) => ({
			date: day.date,
			status: day.status,
		}))

		const todayIndex = days.findIndex((day) => day.date === todayKey)
		if (todayIndex !== -1) {
			const nextStatus = probeMap.get(service.name)?.status
			if (nextStatus) {
				// Keep the public status page live-honest for the current day.
				// Earlier days remain historical snapshots, but today's bar should
				// reflect the latest probe result instead of locking the worst state.
				days[todayIndex] = {
					date: todayKey,
					status: nextStatus,
				}
			}
		}

		serviceRows.push({
			name: service.name,
			days,
			currentStatus: getCurrentStatus(days),
			uptimePercent: getUptimePercent(days),
		})

		const latestStatus = days[todayIndex]?.status
		const reportId = createIncidentReportId(todayKey, service.name)
		const hasReport = incidentReports.some((report) => report.id === reportId)
		if (latestStatus === 'down' && !hasReport) {
			const incident = probeMap.get(service.name)
			if (incident) {
				incidentCandidates.push({
					serviceName: service.name,
					date: todayKey,
					status: incident.status === 'down' ? 'down' : 'degraded',
					responseMs: incident.responseMs,
					statusCode: incident.statusCode,
				})
			}
		}
	}

	const generatedReports = await Promise.all(
		incidentCandidates.map((incident) =>
			generateIncidentReport(incident).catch((error) => {
				const message =
					error instanceof Error ? error.message : 'Unknown error'
				console.warn(
					`Incident report generation failed for ${incident.serviceName}: ${message}`,
				)
				return null
			}),
		),
	)

	for (const report of generatedReports) {
		if (report) incidentReports.unshift(report)
	}

	const refreshed = {
		services: serviceRows,
		incidentReports,
	}
	const archiveRecord = createArchiveRecord(refreshed.services, todayKey)
	const [year, month, day] = todayKey.split('-')
	const archiveFile = path.join(ARCHIVE_ROOT, year, month, `${day}.json`)

	await Promise.all([
		writeJsonFile(CURRENT_STATUS_FILE, refreshed),
		writeJsonFile(LEGACY_STATUS_FILE, refreshed),
		writeJsonFile(archiveFile, archiveRecord),
	])

	console.log(`Updated ${CURRENT_STATUS_FILE} and ${archiveFile}`)
}

/**
 * Load the previous status feed from disk if it exists.
 * @returns {Promise<{
 *   services: {
 *     name: string
 *     days: {date: string, status: string}[]
 *     currentStatus: string
 *     uptimePercent: string
 *   }[]
 *   incidentReports: ReturnType<typeof normalizeIncidentReports>
 * }>}
 */
async function loadExistingFeed() {
	for (const filePath of [CURRENT_STATUS_FILE, LEGACY_STATUS_FILE]) {
		try {
			const raw = await readFile(filePath, 'utf8')
			return normalizeExistingFeed(JSON.parse(raw))
		} catch {
			// Try the next snapshot path before falling back to a fresh base feed.
		}
	}

	return createBaseFeed()
}

/**
 * Persist a JSON payload with stable formatting.
 * @param {string} filePath
 * @param {unknown} data
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, data) {
	await mkdir(path.dirname(filePath), { recursive: true })
	await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

main().catch((error) => {
	console.error('Failed to refresh status feed:', error)
	process.exitCode = 1
})
