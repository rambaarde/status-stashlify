import type { Metadata } from 'next'
import './globals.css'

/**
 * Root layout for the standalone status site.
 */
export const metadata: Metadata = {
	title: {
		default: 'Stashlify Status',
		template: '%s | Stashlify Status',
	},
	description:
		'Public uptime and incident page for Stashlify, powered by an isolated status repo.',
	metadataBase: new URL('https://status.stashlify.com'),
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang='en'>
			<body>{children}</body>
		</html>
	)
}
