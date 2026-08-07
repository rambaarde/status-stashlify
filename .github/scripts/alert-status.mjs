import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATUS_ALERT_STATE_FILE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'status-alert-state.json',
)

const RESEND_API_URL = 'https://api.resend.com/emails'
const STATUS_PAGE_URL = 'https://status.stashlify.com'
const PROBE_TIMEOUT_MS = 10000
const PROBE_RETRY_DELAY_MS = 20000
const PROBE_ATTEMPTS = 3

/**
 * Normalize raw env values to avoid quoted or whitespace-padded secrets.
 * GitHub/GCP secret payloads sometimes arrive with wrapping quotes.
 * @param {string | undefined} value
 * @returns {string}
 */
function readEnvValue(value) {
	return (value || '').trim().replace(/^["']|["']$/g, '')
}

const RESEND_FROM_EMAIL =
	readEnvValue(process.env.RESEND_FROM_EMAIL) || 'noreply@stashlify.com'
const RESEND_RECIPIENTS =
	(
		readEnvValue(process.env.STATUS_ALERT_RECIPIENTS) ||
		'stashlify.team@gmail.com'
	)
		.split(/[,;\n]/)
		.map((recipient) => recipient.trim())
		.filter(Boolean)

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

const STATUS_PRIORITY = {
	healthy: 0,
	degraded: 1,
	down: 2,
}

/**
 * Resolve the manual simulation target from workflow input.
 * @returns {string | null}
 */
function getSimulatedServiceName() {
	const key = readEnvValue(process.env.SIMULATE_SERVICE) || 'none'
	const simulated = SERVICES.find((service) => service.key === key)
	return simulated?.name ?? null
}

/**
 * Probe one service endpoint and classify the result.
 * @param {{name: string, url: string}} service
 * @returns {Promise<{name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}>}
 */
async function probeService(service) {
	const start = Date.now()
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

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
			status: 'healthy',
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
 * Wait for a short delay between downtime confirmation probes.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Confirm whether a service is truly down by requiring repeated failures
 * across a roughly one-minute window. A transient blip should recover here
 * and avoid an emergency email.
 * @param {{name: string, url: string}} service
 * @returns {Promise<{name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}>}
 */
async function probeServiceWithConfirmation(service) {
	let lastResult = await probeService(service)
	if (lastResult.status !== 'down') return lastResult

	for (let attempt = 1; attempt < PROBE_ATTEMPTS; attempt += 1) {
		await sleep(PROBE_RETRY_DELAY_MS)
		lastResult = await probeService(service)
		if (lastResult.status !== 'down') return lastResult
	}

	return lastResult
}

/**
 * Load the previous alert state from disk.
 * @returns {Promise<{overallState: 'healthy' | 'degraded' | 'down', affectedServices: {name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[], lastChangedAt: string | null, lastNotifiedAt: string | null}>}
 */
async function loadAlertState() {
	try {
		const raw = await readFile(STATUS_ALERT_STATE_FILE, 'utf8')
		const parsed = JSON.parse(raw)
		return normalizeAlertState(parsed)
	} catch {
		return {
			overallState: 'healthy',
			affectedServices: [],
			lastChangedAt: null,
			lastNotifiedAt: null,
		}
	}
}

/**
 * Normalize a persisted alert-state payload.
 * @param {unknown} payload
 * @returns {{overallState: 'healthy' | 'degraded' | 'down', affectedServices: {name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[], lastChangedAt: string | null, lastNotifiedAt: string | null}}
 */
function normalizeAlertState(payload) {
	if (typeof payload !== 'object' || payload === null) {
		return {
			overallState: 'healthy',
			affectedServices: [],
			lastChangedAt: null,
			lastNotifiedAt: null,
		}
	}

	const rawOverallState =
		(payload).overallState === 'degraded' || (payload).overallState === 'down'
			? payload.overallState
			: 'healthy'

	const affectedServices = Array.isArray(payload.affectedServices)
		? payload.affectedServices
				.filter(
					(service) =>
						typeof service === 'object' &&
						service !== null &&
						typeof service.name === 'string' &&
						(service.status === 'healthy' ||
							service.status === 'degraded' ||
							service.status === 'down'),
				)
				.map((service) => ({
					name: service.name,
					status: service.status,
					responseMs:
						typeof service.responseMs === 'number' ? service.responseMs : 0,
					statusCode:
						typeof service.statusCode === 'number' ? service.statusCode : null,
				}))
		: []

	return {
		overallState: rawOverallState,
		affectedServices,
		lastChangedAt:
			typeof payload.lastChangedAt === 'string' ? payload.lastChangedAt : null,
		lastNotifiedAt:
			typeof payload.lastNotifiedAt === 'string' ? payload.lastNotifiedAt : null,
	}
}

/**
 * Summarize probe results into one alert state.
 * @param {{name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[]} services
 * @returns {{overallState: 'healthy' | 'degraded' | 'down', affectedServices: {name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[]}}
 */
function summarizeServices(services) {
	const affectedServices = services.filter((service) => service.status !== 'healthy')
	if (affectedServices.some((service) => service.status === 'down')) {
		return {
			overallState: 'down',
			affectedServices,
		}
	}

	if (affectedServices.some((service) => service.status === 'degraded')) {
		return {
			overallState: 'degraded',
			affectedServices,
		}
	}

	return {
		overallState: 'healthy',
		affectedServices: [],
	}
}

/**
 * Decide if the current state needs an email.
 * Only send for a real outage transition to avoid recovery/degraded noise.
 * @param {'healthy' | 'degraded' | 'down'} previousState
 * @param {'healthy' | 'degraded' | 'down'} nextState
 * @returns {'alert' | 'recovery' | null}
 */
function getNotificationKind(previousState, nextState) {
	if (previousState === nextState) return null
	if (nextState !== 'down') return null
	return 'alert'
}

/**
 * Build the email subject line.
 * @param {'alert' | 'recovery'} kind
 * @param {'healthy' | 'degraded' | 'down'} state
 * @param {{name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[]} affectedServices
 * @returns {string}
 */
function buildSubject(kind, state, affectedServices) {
	if (kind === 'recovery') {
		return 'Stashlify recovered: services healthy again'
	}

	const serviceNames = affectedServices.map((service) => service.name).join(', ')
	return `Stashlify alert: ${state} - ${serviceNames}`
}

/**
 * Build a simple HTML body for the email.
 * @param {'alert' | 'recovery'} kind
 * @param {'healthy' | 'degraded' | 'down'} state
 * @param {{name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[]} affectedServices
 * @returns {string}
 */
function buildHtmlBody(kind, state, affectedServices) {
	const title =
		kind === 'recovery'
			? 'Stashlify is healthy again'
			: `Stashlify status is ${state}`

	const rows = affectedServices
		.map(
			(service) => `
				<tr>
					<td style="padding:8px 12px;border:1px solid #ddd;">${service.name}</td>
					<td style="padding:8px 12px;border:1px solid #ddd;">${service.status}</td>
					<td style="padding:8px 12px;border:1px solid #ddd;">${service.responseMs}ms</td>
					<td style="padding:8px 12px;border:1px solid #ddd;">${service.statusCode ?? 'network'}</td>
				</tr>`,
		)
		.join('')

	return `
		<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
			<h2>${title}</h2>
			<p>Checked at ${new Date().toISOString()}.</p>
			<p>Status page: <a href="${STATUS_PAGE_URL}">${STATUS_PAGE_URL}</a></p>
			${
				kind === 'recovery'
					? '<p>All monitored services are healthy again.</p>'
					: '<p>One or more monitored services need attention.</p>'
			}
			${
				affectedServices.length
					? `<table style="border-collapse:collapse;margin-top:16px;">
							<thead>
								<tr>
									<th style="text-align:left;padding:8px 12px;border:1px solid #ddd;">Service</th>
									<th style="text-align:left;padding:8px 12px;border:1px solid #ddd;">State</th>
									<th style="text-align:left;padding:8px 12px;border:1px solid #ddd;">Response</th>
									<th style="text-align:left;padding:8px 12px;border:1px solid #ddd;">Code</th>
								</tr>
							</thead>
							<tbody>${rows}</tbody>
						</table>`
					: ''
			}
		</div>
	`
}

/**
 * Build the plain-text email body.
 * @param {'alert' | 'recovery'} kind
 * @param {'healthy' | 'degraded' | 'down'} state
 * @param {{name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[]} affectedServices
 * @returns {string}
 */
function buildTextBody(kind, state, affectedServices) {
	const lines = [
		kind === 'recovery'
			? 'Stashlify recovered: services healthy again'
			: `Stashlify alert: ${state}`,
		`Checked at: ${new Date().toISOString()}`,
		`Status page: ${STATUS_PAGE_URL}`,
		'',
	]

	if (kind === 'recovery') {
		lines.push('All monitored services are healthy again.')
		return lines.join('\n')
	}

	lines.push('Affected services:')
	for (const service of affectedServices) {
		lines.push(
			`- ${service.name}: ${service.status} (${service.responseMs}ms, ${service.statusCode ?? 'network'})`,
		)
	}

	return lines.join('\n')
}

/**
 * Send the alert mail through Resend.
 * @param {{kind: 'alert' | 'recovery', state: 'healthy' | 'degraded' | 'down', affectedServices: {name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[]}} notification
 * @returns {Promise<void>}
 */
async function sendEmail(notification) {
	const apiKey = readEnvValue(process.env.RESEND_API_KEY)
	if (!apiKey) {
		throw new Error('RESEND_API_KEY is required for alert email delivery')
	}

	if (RESEND_RECIPIENTS.length === 0) {
		throw new Error('STATUS_ALERT_RECIPIENTS must contain at least one email')
	}

	const response = await fetch(RESEND_API_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: RESEND_FROM_EMAIL.includes('<')
				? RESEND_FROM_EMAIL
				: `Stashlify <${RESEND_FROM_EMAIL}>`,
			to: RESEND_RECIPIENTS,
			subject: buildSubject(
				notification.kind,
				notification.state,
				notification.affectedServices,
			),
			html: buildHtmlBody(
				notification.kind,
				notification.state,
				notification.affectedServices,
			),
			text: buildTextBody(
				notification.kind,
				notification.state,
				notification.affectedServices,
			),
		}),
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`Resend returned ${response.status}: ${message}`)
	}
}

/**
 * Persist the new alert state.
 * @param {{overallState: 'healthy' | 'degraded' | 'down', affectedServices: {name: string, status: 'healthy' | 'degraded' | 'down', responseMs: number, statusCode: number | null}[], lastChangedAt: string | null, lastNotifiedAt: string | null}} state
 * @returns {Promise<void>}
 */
async function writeAlertState(state) {
	const payload = `${JSON.stringify(state, null, 2)}\n`
	await writeFile(STATUS_ALERT_STATE_FILE, payload)
}

/**
 * Refresh uptime, send a transition alert, and persist the dedupe state.
 */
async function main() {
	const previousState = await loadAlertState()
	const simulatedServiceName = getSimulatedServiceName()

	const probeResults = await Promise.all(
		SERVICES.map((service) => probeServiceWithConfirmation(service)),
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

	const nextState = summarizeServices(normalizedResults)
	const notificationKind = getNotificationKind(
		previousState.overallState,
		nextState.overallState,
	)

	const now = new Date().toISOString()
	const nextAlertState = {
		overallState: nextState.overallState,
		affectedServices: nextState.affectedServices,
		lastChangedAt:
			notificationKind && previousState.overallState !== nextState.overallState
				? now
				: previousState.lastChangedAt,
		lastNotifiedAt:
			notificationKind === null ? previousState.lastNotifiedAt : now,
	}

	if (!notificationKind) {
		console.log(
			`No alert state change. Previous: ${previousState.overallState}, current: ${nextState.overallState}`,
		)
		return
	}

	await sendEmail({
		kind: notificationKind,
		state: nextState.overallState,
		affectedServices: nextState.affectedServices,
	})

	await writeAlertState(nextAlertState)
	console.log(
		`Alert email sent and state saved at ${STATUS_ALERT_STATE_FILE}`,
	)
}

main().catch((error) => {
	console.error('Failed to run status alert workflow:', error)
	process.exitCode = 1
})
