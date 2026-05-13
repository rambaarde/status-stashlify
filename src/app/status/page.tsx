'use client'

import {
	useState,
	useEffect,
	useCallback,
	useMemo,
} from 'react'
import { RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { loadStatusFeed, type StatusResponse } from '@/lib/status-feed'

type Status =
	| 'operational'
	| 'degraded'
	| 'down'
	| 'nodata'

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

// Colors matching Claude Status exactly
const BAR_COLORS: Record<string, string> = {
	operational: '#76ad2a',
	degraded: '#e6a82a',
	down: '#e04343',
	nodata: '#d5d3c8',
}

const STATUS_LABEL: Record<
	string,
	{ text: string; color: string }
> = {
	operational: {
		text: 'Operational',
		color: 'text-[#76ad2a]',
	},
	degraded: {
		text: 'Degraded Performance',
		color: 'text-[#e6a82a]',
	},
	down: {
		text: 'Major Outage',
		color: 'text-[#e04343]',
	},
	nodata: {
		text: 'No Data',
		color: 'text-[#b0ada3]',
	},
}

const BANNER_CONFIG: Record<
	string,
	{ bg: string; text: string }
> = {
	operational: {
		bg: 'bg-[#6DB528]',
		text: 'All Systems Operational',
	},
	degraded: {
		bg: 'bg-[#e6a82a]',
		text: 'Some Systems Experiencing Issues',
	},
	down: {
		bg: 'bg-[#e04343]',
		text: 'Major System Outage',
	},
	nodata: {
		bg: 'bg-[#A39F90]',
		text: 'Status Data Temporarily Unavailable',
	},
}

function formatDate(dateStr: string): string {
	const date = new Date(dateStr + 'T00:00:00')
	return date.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	})
}

function Tooltip({
	day,
	summary,
	barRef,
}: {
	day: DayData
	summary?: string
	barRef: HTMLDivElement
}) {
	const [pos, setPos] = useState({ left: 0, top: 0, arrowLeft: 0 })

	useEffect(() => {
		const barRect = barRef.getBoundingClientRect()
		const isMobile = window.innerWidth < 640
		const tooltipW = isMobile ? 240 : 280
		const barCenterX = barRect.left + barRect.width / 2

		let left = barCenterX - tooltipW / 2
		const rightEdge = window.innerWidth - 12
		if (left + tooltipW > rightEdge) left = rightEdge - tooltipW
		if (left < 12) left = 12

		const arrowLeft = barCenterX - left
		const top = barRect.bottom + 10

		setPos({ left, top, arrowLeft })
	}, [barRef])

	const status = day.status as Status
	const label =
		status === 'nodata'
			? 'No data available'
			: status === 'operational'
				? 'No downtime recorded on this day.'
				: status === 'degraded'
					? 'Degraded performance'
					: 'Downtime recorded'

	return (
		<div
			className="fixed z-[100] pointer-events-none"
			style={{ left: pos.left, top: pos.top }}
		>
			<div
				className="absolute -top-[7px]"
				style={{ left: pos.arrowLeft - 7 }}
			>
				<div className="w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[7px] border-b-[#DEDCD1]" />
				<div className="absolute top-[1px] left-[-6px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[#FAF9F5] dark:border-b-[#1A1A1A]" />
			</div>
			<div className="bg-[#FAF9F5] dark:bg-[#1A1A1A] border border-[#DEDCD1] dark:border-[#333] rounded shadow-[0_3px_6px_rgba(0,0,0,0.15)] p-3 sm:p-4 w-[240px] sm:w-[280px]">
				<div className="text-[14px] font-semibold text-[#141413] dark:text-[#F7F7F5] mb-2">
					{formatDate(day.date)}
				</div>
				{status !== 'nodata' && status !== 'operational' && (
					<div className="flex items-center gap-2 mb-2">
						<span
							className="w-2.5 h-2.5 rounded-full inline-block"
							style={{ backgroundColor: BAR_COLORS[status] }}
						/>
						<span className="text-[13px] text-[#141413] dark:text-[#ccc]">
							{label}
						</span>
					</div>
				)}
				{status === 'operational' && (
					<div className="text-[13px] text-[#7c7b72] dark:text-[#999]">
						{label}
					</div>
				)}
				{status === 'nodata' && (
					<div className="text-[13px] text-[#b0ada3] dark:text-[#666] italic">
						{label}
					</div>
				)}
				{summary && status !== 'operational' && (
					<p className="mt-2 text-[13px] leading-5 text-[#141413] dark:text-[#F7F7F5]">
						{summary}
					</p>
				)}
			</div>
		</div>
	)
}

function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false)
	useEffect(() => {
		const check = () =>
			setIsMobile(window.innerWidth < 640)
		check()
		window.addEventListener('resize', check)
		return () =>
			window.removeEventListener('resize', check)
	}, [])
	return isMobile
}

function UptimeBar({
	days,
	uptimePercent,
	serviceName,
	reportMap,
}: {
	days: DayData[]
	uptimePercent: string
	serviceName: string
	reportMap: Map<string, string>
}) {
	const [activeDay, setActiveDay] = useState<{
		index: number
		ref: HTMLDivElement
	} | null>(null)
	const isMobile = useIsMobile()

	const visibleDays = useMemo(
		() => (isMobile ? days.slice(-30) : days),
		[days, isMobile]
	)
	const daysLabel = isMobile ? '30' : '90'

	return (
		<div className="relative mt-1">
			<div
				className="flex gap-[3px] sm:gap-[2px] h-[40px] sm:h-[34px]"
				onMouseLeave={() => setActiveDay(null)}
			>
				{visibleDays.map((day, i) => {
					const status =
						(day.status as Status) || 'nodata'
					const color =
						BAR_COLORS[status] ??
						BAR_COLORS.nodata
					return (
						<div
							key={i}
							className={`flex-1 transition-opacity ${
								activeDay !== null &&
								activeDay.index !== i
									? 'opacity-50'
									: ''
							}`}
							style={{
								backgroundColor: color,
								minWidth: isMobile
									? 6
									: 2,
							}}
							onMouseEnter={(e) => {
								setActiveDay({
									index: i,
									ref: e.currentTarget,
								})
							}}
						/>
					)
				})}
			</div>

			<div className="flex items-center mt-1.5">
				<span className="text-[11px] sm:text-[12px] text-[#b0ada3] flex-1">
					{daysLabel} days ago
				</span>
				<span className="text-[11px] sm:text-[12px] text-[#b0ada3] flex-1 text-center">
					<span>{uptimePercent}</span>
					<span> % uptime</span>
				</span>
				<span className="text-[11px] sm:text-[12px] text-[#b0ada3] flex-1 text-right">
					Today
				</span>
			</div>

			{activeDay !== null && (
				<Tooltip
					day={visibleDays[activeDay.index]}
					summary={
						reportMap.get(
							`${visibleDays[activeDay.index].date}::${serviceName}`,
						)
					}
					barRef={activeDay.ref}
				/>
			)}
		</div>
	)
}

function ServiceCard({
	service,
	reportMap,
}: {
	service: ServiceData
	reportMap: Map<string, string>
}) {
	const status = service.currentStatus as Status
	const label =
		STATUS_LABEL[status] ?? STATUS_LABEL.nodata

	return (
		<div className="px-4 sm:px-5 py-4 sm:py-[17px]">
			<div className="flex items-start sm:items-center justify-between gap-2">
				<h3 className="text-[13px] sm:text-[14px] font-bold text-[#141413] dark:text-[#F7F7F5]">
					{service.name}
				</h3>
				<span
					className={`text-[12px] sm:text-[14px] font-medium whitespace-nowrap ${label.color}`}
				>
					{label.text}
				</span>
			</div>
			<UptimeBar
				days={service.days}
				uptimePercent={service.uptimePercent}
				serviceName={service.name}
				reportMap={reportMap}
			/>
		</div>
	)
}

function StatusSkeleton() {
	return (
		<div className="animate-pulse space-y-6">
			<div className="h-[52px] rounded bg-[#D5D5D0] dark:bg-[#2A2A2A]" />
			<div className="border border-[#DEDCD1] dark:border-[#2A2A2A] rounded">
				{[1, 2, 3, 4].map((i) => (
					<div
						key={i}
						className="px-5 py-[17px] border-b border-[#DEDCD1] dark:border-[#2A2A2A] last:border-b-0"
					>
						<div className="h-4 w-48 bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded mb-3" />
						<div className="h-[34px] bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded" />
						<div className="flex justify-between mt-2">
							<div className="h-3 w-16 bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded" />
							<div className="h-3 w-20 bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded" />
							<div className="h-3 w-10 bg-[#EEEEEA] dark:bg-[#1A1A1A] rounded" />
						</div>
					</div>
				))}
			</div>
		</div>
	)
}

/**
 * Public current-status page for the standalone Stashlify status site.
 */
export default function StatusPage() {
	const [data, setData] =
		useState<StatusResponse | null>(null)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)

	const fetchStatus = useCallback(
		async (isRefresh = false) => {
			if (isRefresh) setRefreshing(true)
			else setLoading(true)

			try {
				const json: StatusResponse = await loadStatusFeed()
				setData(json)
			} finally {
				setLoading(false)
				setRefreshing(false)
			}
		},
		[]
	)

	useEffect(() => {
		fetchStatus()
		const interval = setInterval(
			() => fetchStatus(true),
			60000
		)
		return () => clearInterval(interval)
	}, [fetchStatus])

	const overall: string = (() => {
		if (!data?.services?.length) return 'nodata'
		const statuses = data.services.map(
			(s) => s.currentStatus
		)
		if (statuses.every((s) => s === 'nodata')) return 'nodata'
		if (statuses.some((s) => s === 'down'))
			return 'down'
		if (statuses.some((s) => s === 'degraded'))
			return 'degraded'
		return 'operational'
	})()

	const banner =
		BANNER_CONFIG[overall] ??
		BANNER_CONFIG.nodata
	const incidentSummaryMap = useMemo(() => {
		const map = new Map<string, string>()
		for (const report of data?.incidentReports || []) {
			map.set(`${report.date}::${report.serviceName}`, report.summary)
		}
		return map
	}, [data?.incidentReports])

	return (
		<div className="min-h-screen bg-[#F7F7F5] dark:bg-[#0A0A0A] text-[#0F0F0F] dark:text-[#F7F7F5] font-[family-name:var(--font-inter)] selection:bg-[#0F0F0F] dark:selection:bg-white selection:text-white dark:selection:text-[#0F0F0F]">
			<main className="max-w-[850px] mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-16 sm:pb-20">
				<div className="flex items-center justify-between mb-8 sm:mb-10">
					<h1 className="text-2xl sm:text-3xl md:text-4xl font-medium font-[family-name:var(--font-outfit)] tracking-tight text-[#0F0F0F] dark:text-[#F7F7F5]">
						System Status
					</h1>
					<button
						onClick={() => fetchStatus(true)}
						disabled={refreshing}
						className="h-8 sm:h-9 px-3 sm:px-5 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.08em] border border-[#0F0F0F] dark:border-[#F7F7F5] text-[#0F0F0F] dark:text-[#F7F7F5] rounded hover:bg-[#0F0F0F] hover:text-white dark:hover:bg-[#F7F7F5] dark:hover:text-[#0A0A0A] transition-colors disabled:opacity-50 flex items-center gap-1.5 sm:gap-2"
					>
						<RefreshCw
							className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`}
						/>
						Refresh
					</button>
				</div>

				{loading ? (
					<StatusSkeleton />
				) : (
					<>
						<div
							className={`${banner.bg} text-white rounded px-4 sm:px-6 py-3 sm:py-4`}
						>
							<span className="text-[14px] sm:text-[15px] font-semibold">
								{banner.text}
							</span>
						</div>

						<div className="flex justify-end mt-8 sm:mt-12 mb-3">
							<p className="text-[12px] sm:text-[13px] text-[#b0ada3]">
								<span className="hidden sm:inline">
									Uptime over the
									past 90 days.
								</span>
								<span className="sm:hidden">
									Uptime over the
									past 30 days.
								</span>{' '}
								<Link
									href="/status/history"
									className="text-[#141413] dark:text-[#F7F7F5] font-medium underline underline-offset-2 hover:no-underline"
								>
									View historical
									uptime.
								</Link>
							</p>
						</div>

						<div className="border border-[#DEDCD1] dark:border-[#2A2A2A] rounded divide-y divide-[#DEDCD1] dark:divide-[#2A2A2A]">
							{data?.services?.length ? (
								data.services.map(
									(service) => (
										<ServiceCard
											key={
												service.name
											}
											service={
												service
											}
											reportMap={
												incidentSummaryMap
											}
										/>
									)
								)
							) : (
								<div className="px-5 py-10 text-center text-sm text-[#b0ada3]">
									Unable to load
									status data.
									Please try
									refreshing.
								</div>
							)}
						</div>

						<p className="text-[12px] text-[#b0ada3] text-center mt-5">
							Auto-refreshes every 60s
						</p>

						<div className="mt-12 sm:mt-16">
							<h2 className="text-xl sm:text-2xl font-bold text-[#141413] dark:text-[#F7F7F5] mb-4">
								Past Incidents
							</h2>
							{[0, 1, 2, 3, 4, 5, 6].map(
								(daysAgo) => {
									const date =
										new Date()
									date.setDate(
										date.getDate() -
											daysAgo
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
									return (
										<div
											key={daysAgo}
											className="py-3 border-b border-[#DEDCD1] dark:border-[#2A2A2A]"
										>
											<h3 className="text-[14px] font-bold text-[#141413] dark:text-[#F7F7F5]">
												{formatted}
											</h3>
											<p className="text-[14px] text-[#b0ada3] mt-0.5">
												No
												incidents
												reported.
											</p>
										</div>
									)
								}
							)}
						</div>
					</>
				)}
			</main>
		</div>
	)
}
