import type { Metadata } from 'next'

/**
 * Metadata for the public status route.
 */
export const metadata: Metadata = {
	title: 'System Status',
	description:
		'Real-time operational status for Stashlify services.',
}

export default function StatusLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return children
}
