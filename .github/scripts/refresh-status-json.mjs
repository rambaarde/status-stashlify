import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HISTORY_DAYS = 90
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

const SERVICES = [
	{
		name: 'Dashboard & Storefront',
		url: 'https://stashlify.com/',
	},
	{
		name: 'Inventory, Sales & Orders',
		url: 'https://api.stashlify.com/health/ready',
	},
	{
		name: 'Payments',
		url: 'https://api.stashlify.com/health',
	},
	{
		name: 'Authentication',
		url: 'https://api.stashlify.com/health/ready',
	},
]

const STATUS_PRIORITY = {
	nodata: 0,
	operational: 1,
	degraded: 2,
	down: 3,
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
 * Refresh the public status feed in-place so GitHub Actions can publish it.
 */
async function main() {
	const existingFeed = await loadExistingFeed()
	const probeResults = await Promise.all(SERVICES.map((service) => probeService(service)))
	const probeMap = new Map(probeResults.map((result) => [result.name, result.status]))
	const todayKey = toDateKey(new Date())

	const refreshed = {
		services: existingFeed.services.map((service) => {
			const days = service.days.map((day) => ({
				date: day.date,
				status: day.status === 'nodata' ? 'operational' : day.status,
			}))

			const todayIndex = days.findIndex((day) => day.date === todayKey)
			if (todayIndex !== -1) {
				const nextStatus = probeMap.get(service.name)
				if (nextStatus) {
					days[todayIndex] = {
						date: todayKey,
						status: mergeStatus(days[todayIndex].status, nextStatus),
					}
				}
			}

			return {
				name: service.name,
				days,
				currentStatus: getCurrentStatus(days),
				uptimePercent: getUptimePercent(days),
			}
		}),
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
 * @returns {Promise<{services: {name: string, days: {date: string, status: string}[], currentStatus: string, uptimePercent: string}[]}>}
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
