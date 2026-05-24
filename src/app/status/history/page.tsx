'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import {
	formatIncidentGeneratedAt,
	loadStatusFeed,
	type IncidentReport,
	type StatusResponse,
} from '@/lib/status-feed'

type Status = 'operational' | 'degraded' | 'down' | 'nodata'

interface DayData {
	date: string
	status: string
}

interface ServiceData {
	name: string
	days: DayData[]
	currentStatus: string
	uptimePercent: string
}

const BAR_COLORS: Record<string, string> = {
	operational: '#76ad2a',
	degraded: '#e6a82a',
	down: '#e04343',
	nodata: '#d5d3c8',
}

type TabType = 'incidents' | 'uptime'

interface MonthData {
	year: number
	month: number
	label: string
	days: DayData[]
	uptimePercent: string
}

function getMonthLabel(year: number, month: number): string {
	return new Date(year, month, 1).toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric',
	})
}

function groupDaysByMonth(days: DayData[]): MonthData[] {
	const monthMap = new Map<
		string,
		{ year: number; month: number; days: DayData[] }
	>()

	for (const day of days) {
		const date = new Date(day.date + 'T00:00:00')
		const year = date.getFullYear()
		const month = date.getMonth()
		const key = `${year}-${month}`

		if (!monthMap.has(key)) {
			monthMap.set(key, { year, month, days: [] })
		}
		monthMap.get(key)!.days.push(day)
	}

	const result: MonthData[] = []
	for (const [, value] of monthMap) {
		const total = value.days.length
		const operational = value.days.filter(
			(d) => d.status === 'operational'
		).length
		const percent =
			total > 0
				? ((operational / total) * 100).toFixed(2)
				: '0.00'

		result.push({
			year: value.year,
			month: value.month,
			label: getMonthLabel(value.year, value.month),
			days: value.days.sort(
				(a, b) =>
					new Date(a.date).getTime() -
					new Date(b.date).getTime()
			),
			uptimePercent: percent,
		})
	}

	return result.sort((a, b) => {
		if (a.year !== b.year) return a.year - b.year
		return a.month - b.month
	})
}

function CalendarTooltip({
	day,
	summary,
	cellRef,
}: {
	day: DayData
	summary?: string
	cellRef: HTMLDivElement
}) {
	const [pos, setPos] = useState({ left: 0, top: 0 })

	useEffect(() => {
		const rect = cellRef.getBoundingClientRect()
		const tooltipW = 200
		let left = rect.left + rect.width / 2 - tooltipW / 2
		const rightEdge = window.innerWidth - 12
		if (left + tooltipW > rightEdge) left = rightEdge - tooltipW
		if (left < 12) left = 12
		setPos({ left, top: rect.bottom + 8 })
	}, [cellRef])

	const status = day.status as Status
	const date = new Date(day.date + 'T00:00:00')
	const formatted = date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
	const statusLabel =
		status === 'operational'
			? 'No downtime'
			: status === 'degraded'
				? 'Degraded performance'
				: status === 'down'
					? 'Downtime recorded'
					: 'No data'

	return (
		<div
			className="fixed z-[100] pointer-events-none"
			style={{ left: pos.left, top: pos.top }}
		>
			<div className="bg-[#FAF9F5] dark:bg-[#1A1A1A] border border-[#DEDCD1] dark:border-[#333] rounded shadow-[0_3px_6px_rgba(0,0,0,0.15)] px-3 py-2 w-[200px]">
				<div className="text-[13px] font-semibold text-[#141413] dark:text-[#F7F7F5]">
					{formatted}
				</div>
				<div className="flex items-center gap-1.5 mt-1">
					<span
						className="w-2 h-2 rounded-full inline-block"
						style={{
							backgroundColor: BAR_COLORS[status],
						}}
					/>
					<span className="text-[12px] text-[#7c7b72] dark:text-[#999]">
						{statusLabel}
					</span>
				</div>
				{summary && status !== 'operational' && (
					<p className="mt-2 text-[12px] leading-5 text-[#141413] dark:text-[#F7F7F5]">
						{summary}
					</p>
				)}
			</div>
		</div>
	)
}

function MonthCalendar({
	month,
	reportMap,
	serviceName,
}: {
	month: MonthData
	reportMap: Map<string, IncidentReport>
	serviceName: string
}) {
	const [activeDay, setActiveDay] = useState<{
		index: number
		ref: HTMLDivElement
	} | null>(null)

	const firstDay = new Date(
		month.year,
		month.month,
		1
	).getDay()
	const startPad = firstDay === 0 ? 6 : firstDay - 1
	const daysInMonth = new Date(
		month.year,
		month.month + 1,
		0
	).getDate()

	const dayMap = new Map<number, DayData>()
	for (const day of month.days) {
		const date = new Date(day.date + 'T00:00:00')
		dayMap.set(date.getDate(), day)
	}

	const cells: (DayData | null)[] = []
	for (let i = 0; i < startPad; i++) cells.push(null)
	for (let d = 1; d <= daysInMonth; d++) {
		cells.push(
			dayMap.get(d) || {
				date: `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
				status: 'nodata',
			}
		)
	}

	return (
		<div className="flex-1 min-w-0">
			<div className="flex items-center justify-between mb-2">
				<h3 className="text-[14px] font-bold text-[#141413] dark:text-[#F7F7F5]">
					{month.label}
				</h3>
				<span className="text-[13px] text-[#b0ada3]">
					{month.uptimePercent}%
				</span>
			</div>
			<div
				className="grid grid-cols-7 gap-[3px] sm:gap-1"
				onMouseLeave={() => setActiveDay(null)}
			>
				{cells.map((day, i) => {
					if (!day) {
						return (
							<div
								key={`pad-${i}`}
								className="aspect-square"
							/>
						)
					}
					const status =
						(day.status as Status) || 'nodata'
					const color = BAR_COLORS[status]
					return (
						<div
							key={day.date}
							className={`aspect-square rounded-[3px] sm:rounded transition-opacity cursor-default ${
								activeDay !== null &&
								activeDay.index !== i
									? 'opacity-40'
									: ''
							}`}
							style={{ backgroundColor: color }}
							onMouseEnter={(e) =>
								setActiveDay({
									index: i,
									ref: e.currentTarget,
								})
							}
						/>
					)
				})}
			</div>
			{activeDay !== null && cells[activeDay.index] && (
				<CalendarTooltip
					day={cells[activeDay.index]!}
					summary={
						reportMap.get(
							`${cells[activeDay.index]!.date}::${serviceName}`,
						)?.summary
					}
					cellRef={activeDay.ref}
				/>
			)}
		</div>
	)
}

interface Incident {
	date: string
	services: { name: string; status: Status }[]
}

const STATUS_TEXT: Record<Status, string> = {
	degraded: 'Degraded performance',
	down: 'Major outage',
	operational: '',
	nodata: '',
}

function IncidentsTab({
	services,
	rangeStart,
}: {
	services: ServiceData[]
	rangeStart: Date
}) {
	const months = useMemo(() => {
		const incidentMap = new Map<
			string,
			{ name: string; status: Status }[]
		>()

		for (const service of services) {
			for (const day of service.days) {
				const status = day.status as Status
				if (
					status === 'degraded' ||
					status === 'down'
				) {
					if (!incidentMap.has(day.date)) {
						incidentMap.set(day.date, [])
					}
					incidentMap.get(day.date)!.push({
						name: service.name,
						status,
					})
				}
			}
		}

		const result: {
			label: string
			incidents: Incident[]
			hasNoIncidents: boolean
		}[] = []

		for (let m = 0; m <= 2; m++) {
			const monthDate = new Date(
				rangeStart.getFullYear(),
				rangeStart.getMonth() - m,
				1
			)
			const year = monthDate.getFullYear()
			const month = monthDate.getMonth()
			const label = monthDate.toLocaleDateString(
				'en-US',
				{ month: 'long', year: 'numeric' }
			)
			const daysInMonth = new Date(
				year,
				month + 1,
				0
			).getDate()

			const today = new Date()
			today.setHours(0, 0, 0, 0)

			const monthIncidents: Incident[] = []
			for (let d = daysInMonth; d >= 1; d--) {
				const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
				const date = new Date(year, month, d)
				if (date > today) continue
				const affected = incidentMap.get(dateStr)
				if (affected) {
					monthIncidents.push({
						date: dateStr,
						services: affected,
					})
				}
			}

			result.push({
				label,
				incidents: monthIncidents,
				hasNoIncidents: monthIncidents.length === 0,
			})
		}

		return result
	}, [services, rangeStart])

	return (
		<div>
			{months.map((month) => (
				<div key={month.label} className="mb-10">
					<h2 className="text-xl sm:text-2xl font-bold text-[#141413] dark:text-[#F7F7F5] mb-2 pb-2 border-b border-[#DEDCD1] dark:border-[#2A2A2A]">
						{month.label}
					</h2>
					{month.hasNoIncidents ? (
						<p className="text-[14px] text-[#b0ada3] py-4">
							No incidents reported this
							month.
						</p>
					) : (
						month.incidents.map((incident) => {
							const date = new Date(
								incident.date + 'T00:00:00'
							)
							const formatted =
								date.toLocaleDateString(
									'en-US',
									{
										month: 'short',
										day: 'numeric',
										year: 'numeric',
									}
								)
							const worstStatus =
								incident.services.some(
									(s) =>
										s.status === 'down'
								)
									? 'down'
									: 'degraded'
							const color =
								worstStatus === 'down'
									? 'text-[#e04343]'
									: 'text-[#e6a82a]'

							return (
								<div
									key={incident.date}
									className="py-3 border-b border-[#DEDCD1] dark:border-[#2A2A2A]"
								>
									<h3
										className={`text-[14px] font-semibold ${color}`}
									>
										{incident.services
											.map(
												(s) =>
													`${STATUS_TEXT[s.status]} on ${s.name}`
											)
											.join('; ')}
									</h3>
									<p className="text-[14px] text-[#7c7b72] dark:text-[#999] mt-0.5">
										{formatted}
									</p>
								</div>
							)
						})
					)}
				</div>
			))}
		</div>
	)
}

function UptimeTab({
	services,
	selectedService,
	onServiceChange,
	rangeStart,
	incidentReports,
}: {
	services: ServiceData[]
	selectedService: string
	onServiceChange: (name: string) => void
	rangeStart: Date
	incidentReports: IncidentReport[]
}) {
	const service = services.find(
		(s) => s.name === selectedService
	)
	const reportMap = useMemo(() => {
		const map = new Map<string, IncidentReport>()
		for (const report of incidentReports) {
			map.set(`${report.date}::${report.serviceName}`, report)
		}
		return map
	}, [incidentReports])

	const months = useMemo(() => {
		if (!service) return []
		const grouped = groupDaysByMonth(service.days)
		return grouped.filter((m) => {
			const monthDate = new Date(m.year, m.month, 1)
			const rangeEnd = new Date(
				rangeStart.getFullYear(),
				rangeStart.getMonth() + 1,
				0
			)
			const rangeBegin = new Date(
				rangeStart.getFullYear(),
				rangeStart.getMonth() - 2,
				1
			)
			return (
				monthDate >= rangeBegin &&
				monthDate <= rangeEnd
			)
		})
	}, [service, rangeStart])

	if (!service) {
		return (
			<div className="text-center py-10 text-[#b0ada3]">
				No uptime data available.
			</div>
		)
	}

	return (
		<div>
			<div className="mb-8">
				<select
					value={selectedService}
					onChange={(e) =>
						onServiceChange(e.target.value)
					}
					className="h-10 px-3 pr-8 text-[14px] border border-[#DEDCD1] dark:border-[#333] rounded bg-white dark:bg-[#1A1A1A] text-[#141413] dark:text-[#F7F7F5] appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20d%3D%22M3%205l3%203%203-3%22%20stroke%3D%22%23666%22%20fill%3D%22none%22%20stroke-width%3D%221.5%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_10px_center] bg-no-repeat cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#0F0F0F] dark:focus:ring-[#F7F7F5]"
				>
					{services.map((s) => (
						<option key={s.name} value={s.name}>
							{s.name}
						</option>
					))}
				</select>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
				{months.map((month) => (
					<MonthCalendar
						key={`${month.year}-${month.month}`}
						month={month}
						reportMap={reportMap}
						serviceName={service.name}
					/>
				))}
				{months.length === 0 && (
					<div className="col-span-3 text-center py-10 text-[#b0ada3]">
						No data available for this period.
					</div>
				)}
			</div>
		</div>
	)
}

function IncidentReportsSection({
	reports,
}: {
	reports: IncidentReport[]
}) {
	if (reports.length === 0) return null

	return (
		<div className="mt-12 sm:mt-16">
			<h2 className="text-xl sm:text-2xl font-bold text-[#141413] dark:text-[#F7F7F5] mb-4">
				Incident Reports
			</h2>
			<div className="space-y-4">
				{reports.map((report) => (
					<div
						key={report.id}
						className="border border-[#DEDCD1] dark:border-[#2A2A2A] rounded px-4 py-4 sm:px-5"
					>
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
							<div>
								<h3 className="text-[16px] font-semibold text-[#141413] dark:text-[#F7F7F5]">
									{report.title}
								</h3>
								<p className="text-[13px] text-[#b0ada3]">
									{report.serviceName}
									{' • '}
									{formatIncidentGeneratedAt(
										report.generatedAt
									)}
								</p>
							</div>
							<span className="text-[11px] uppercase tracking-[0.08em] text-[#7c7b72] border border-[#DEDCD1] dark:border-[#2A2A2A] rounded px-2 py-1 self-start">
								{report.status}
							</span>
						</div>
						<p className="text-[14px] text-[#141413] dark:text-[#F7F7F5] leading-6">
							{report.summary}
						</p>
						<div className="mt-4 grid gap-3 sm:grid-cols-2">
							<div>
								<p className="text-[12px] uppercase tracking-[0.08em] text-[#b0ada3] mb-1">
									Impact
								</p>
								<p className="text-[14px] text-[#141413] dark:text-[#F7F7F5] leading-6">
									{report.impact}
								</p>
							</div>
							<div>
								<p className="text-[12px] uppercase tracking-[0.08em] text-[#b0ada3] mb-1">
									Resolution
								</p>
								<p className="text-[14px] text-[#141413] dark:text-[#F7F7F5] leading-6">
									{report.resolution}
								</p>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

export default function HistoryPage() {
	const [tab, setTab] = useState<TabType>('incidents')
	const [data, setData] = useState<StatusResponse | null>(
		null
	)
	const [loading, setLoading] = useState(true)
	const [selectedService, setSelectedService] =
		useState<string>('')
	const [rangeStart, setRangeStart] = useState(() => {
		const now = new Date()
		return new Date(now.getFullYear(), now.getMonth(), 1)
	})

	const fetchStatus = useCallback(async () => {
		setLoading(true)
		try {
			const json: StatusResponse = await loadStatusFeed()
			setData(json)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchStatus()
	}, [fetchStatus])

	useEffect(() => {
		if (!selectedService && data?.services?.length) {
			setSelectedService(data.services[0].name)
		}
	}, [data, selectedService])

	const rangeLabel = useMemo(() => {
		const end = new Date(
			rangeStart.getFullYear(),
			rangeStart.getMonth(),
			1
		)
		const start = new Date(
			rangeStart.getFullYear(),
			rangeStart.getMonth() - 2,
			1
		)
		const fmt = (d: Date) =>
			d.toLocaleDateString('en-US', {
				month: 'long',
				year: 'numeric',
			})
		return `${fmt(start)} to ${fmt(end)}`
	}, [rangeStart])

	function shiftRange(delta: number) {
		setRangeStart(
			(prev) =>
				new Date(
					prev.getFullYear(),
					prev.getMonth() + delta * 3,
					1
				)
		)
	}

	const canGoForward = useMemo(() => {
		const now = new Date()
		const maxRangeStart = new Date(
			now.getFullYear(),
			now.getMonth() - 3,
			1
		)
		return rangeStart <= maxRangeStart
	}, [rangeStart])

	const incidentReports = useMemo(
		() =>
			(data?.incidentReports || [])
				.slice()
				.sort(
					(a, b) =>
						new Date(b.generatedAt).getTime() -
						new Date(a.generatedAt).getTime()
				),
		[data?.incidentReports]
	)

	return (
		<div className="min-h-screen bg-[#F7F7F5] dark:bg-[#0A0A0A] text-[#0F0F0F] dark:text-[#F7F7F5] font-[family-name:var(--font-inter)] selection:bg-[#0F0F0F] dark:selection:bg-white selection:text-white dark:selection:text-[#0F0F0F]">
			<main className="max-w-[850px] mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-16 sm:pb-20">
				<div className="flex items-center gap-0 border-b border-[#DEDCD1] dark:border-[#2A2A2A] mb-8">
					<button
						onClick={() => setTab('incidents')}
						className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors -mb-px ${
							tab === 'incidents'
								? 'border-[#141413] dark:border-[#F7F7F5] text-[#141413] dark:text-[#F7F7F5]'
								: 'border-transparent text-[#b0ada3] hover:text-[#141413] dark:hover:text-[#F7F7F5]'
						}`}
					>
						Incidents
					</button>
					<button
						onClick={() => setTab('uptime')}
						className={`px-4 py-2.5 text-[14px] font-medium border-b-2 transition-colors -mb-px ${
							tab === 'uptime'
								? 'border-[#141413] dark:border-[#F7F7F5] text-[#141413] dark:text-[#F7F7F5]'
								: 'border-transparent text-[#b0ada3] hover:text-[#141413] dark:hover:text-[#F7F7F5]'
						}`}
					>
						Uptime
					</button>
				</div>

				<div className="flex items-center justify-between mb-8">
					{tab === 'uptime' ? (
						<div />
					) : (
						<div />
					)}
					<div className="flex items-center gap-2">
						<button
							onClick={() => shiftRange(-1)}
							className="w-8 h-8 flex items-center justify-center border border-[#DEDCD1] dark:border-[#333] rounded hover:bg-[#EEEEEA] dark:hover:bg-[#1A1A1A] transition-colors"
						>
							<ChevronLeft className="w-4 h-4" />
						</button>
						<span className="text-[13px] sm:text-[14px] text-[#141413] dark:text-[#F7F7F5] min-w-[180px] sm:min-w-[240px] text-center">
							{rangeLabel}
						</span>
						<button
							onClick={() => shiftRange(1)}
							disabled={!canGoForward}
							className="w-8 h-8 flex items-center justify-center border border-[#DEDCD1] dark:border-[#333] rounded hover:bg-[#EEEEEA] dark:hover:bg-[#1A1A1A] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
						>
							<ChevronRight className="w-4 h-4" />
						</button>
					</div>
				</div>

				{loading ? (
					<div className="animate-pulse space-y-6">
						{tab === 'uptime' ? (
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
								{[1, 2, 3].map((i) => (
									<div key={i}>
										<div className="h-4 w-32 bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded mb-3" />
										<div className="grid grid-cols-7 gap-1">
											{Array.from(
												{
													length: 35,
												}
											).map(
												(_, j) => (
													<div
														key={
															j
														}
														className="aspect-square bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded"
													/>
												)
											)}
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="space-y-4">
								{[1, 2, 3, 4, 5].map(
									(i) => (
										<div
											key={i}
											className="py-3 border-b border-[#DEDCD1] dark:border-[#2A2A2A]"
										>
											<div className="h-4 w-40 bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded mb-2" />
											<div className="h-3 w-56 bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded" />
										</div>
									)
								)}
							</div>
						)}
					</div>
				) : tab === 'uptime' ? (
					<UptimeTab
						services={data?.services || []}
						selectedService={selectedService}
						onServiceChange={setSelectedService}
						rangeStart={rangeStart}
						incidentReports={incidentReports}
					/>
				) : (
					<IncidentsTab
						services={data?.services || []}
						rangeStart={rangeStart}
					/>
				)}

				<IncidentReportsSection reports={incidentReports} />

				<div className="mt-12 pt-6 border-t border-[#DEDCD1] dark:border-[#2A2A2A] flex items-center justify-between">
					<Link
						href="/status"
						className="text-[14px] text-[#141413] dark:text-[#F7F7F5] font-medium hover:underline"
					>
						&larr; Current Status
					</Link>
				</div>
			</main>
		</div>
	)
}
