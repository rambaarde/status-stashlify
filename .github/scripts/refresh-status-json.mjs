import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HISTORY_DAYS = 90
const OPENROUTER_API_URL =
	'https://openrouter.ai/api/v1/chat/completions'
const STATUS_FILE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'public',
	'status.json',
)
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

const STATUS_PRIORITY = {
	nodata: 0,
	operational: 1,
	degraded: 2,
	down: 3,
}

/**
 * Report data persisted in the public status feed.
 */
function createIncidentReportId(date, serviceName) {
	return `${date}:${serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/**
 * Resolve the manual simulation target from the workflow input.
 * @returns {string | null}
 */
function getSimulatedServiceName() {
	const key = process.env.SIMULATE_SERVICE || 'none'
	return key && key !== 'none' ? SIMULATED_SERVICE[key] ?? null : null
}

/**
 * Format a UTC day as `YYYY-MM-DD` for the public status feed.
 * @param {Date} date
 * @returns {string}
 */
function toDateKey(date) {
	return date.toISOString().split('T')[0]
}

/**
 * Build a rolling window of days for the feed.
 * @param {number} days
 * @param {'operational' | 'nodata'} fillStatus
 * @returns {{date: string, status: string}[]}
 */
function createDays(days, fillStatus = 'operational') {
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
 * Create a fully populated status feed with green days by default.
 * @returns {{services: {name: string, days: {date: string, status: string}[], currentStatus: string, uptimePercent: string}[]}}
 */
function createBaseFeed() {
	return {
		services: SERVICES.map((service) => ({
			name: service.name,
			days: createDays(HISTORY_DAYS, 'operational'),
			currentStatus: 'operational',
			uptimePercent: '100.0',
		})),
		incidentReports: [],
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
 * @returns {{services: {name: string, days: {date: string, status: string}[], currentStatus: string, uptimePercent: string}[]}}
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
				status: dayMap.get(day.date) ?? 'operational',
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
	return 'operational'
}

/**
 * Pick the worse of two statuses so the day keeps the most severe result.
 * @param {'nodata' | 'operational' | 'degraded' | 'down'} current
 * @param {'operational' | 'degraded' | 'down'} next
 * @returns {'operational' | 'degraded' | 'down'}
 */
function mergeStatus(current, next) {
	const currentPriority = STATUS_PRIORITY[current] ?? STATUS_PRIORITY.operational
	const nextPriority = STATUS_PRIORITY[next] ?? STATUS_PRIORITY.operational
	return nextPriority > currentPriority ? next : current
}

/**
 * Derive the public "current status" from the latest day.
 * @param {{date: string, status: string}[]} days
 * @returns {string}
 */
function getCurrentStatus(days) {
	const latest = days[days.length - 1]
	return latest?.status ?? 'operational'
}

/**
 * Calculate the visible uptime percentage for the public feed.
 * @param {{date: string, status: string}[]} days
 * @returns {string}
 */
function getUptimePercent(days) {
	if (days.length === 0) return '100.0'
	const operationalDays = days.filter(
		(day) => day.status === 'operational',
	).length
	return ((operationalDays / days.length) * 100).toFixed(1)
}

/**
 * Probe a single service endpoint and convert the result into a status row.
 * @param {{name: string, url: string}} service
 * @returns {Promise<{name: string, status: 'operational' | 'degraded' | 'down'}>}
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
			}
		}

		if (responseMs > 5000) {
			return {
				name: service.name,
				status: 'degraded',
			}
		}

		return {
			name: service.name,
			status: 'operational',
		}
	} catch {
		clearTimeout(timeout)
		return {
			name: service.name,
			status: 'down',
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
		const days = service.days.map((day) => ({
			date: day.date,
			status: day.status === 'nodata' ? 'operational' : day.status,
		}))

		const todayIndex = days.findIndex((day) => day.date === todayKey)
		if (todayIndex !== -1) {
			const nextStatus = probeMap.get(service.name)?.status
			if (nextStatus) {
				days[todayIndex] = {
					date: todayKey,
					status: mergeStatus(days[todayIndex].status, nextStatus),
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

	await mkdir(path.dirname(STATUS_FILE), { recursive: true })
	await writeFile(`${STATUS_FILE}`, `${JSON.stringify(refreshed, null, 2)}\n`)

	console.log(`Updated ${STATUS_FILE}`)
}

/**
 * Load the previous status feed from disk if it exists.
 * @returns {Promise<{
 *   services: {name: string, days: {date: string, status: string}[], currentStatus: string, uptimePercent: string}[]
 *   incidentReports: ReturnType<typeof normalizeIncidentReports>
 * }>}
 */
async function loadExistingFeed() {
	try {
		const raw = await readFile(STATUS_FILE, 'utf8')
		return normalizeExistingFeed(JSON.parse(raw))
	} catch {
		return createBaseFeed()
	}
}

main().catch((error) => {
	console.error('Failed to refresh status feed:', error)
	process.exitCode = 1
})
