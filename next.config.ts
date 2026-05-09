import type { NextConfig } from 'next'

/**
 * Standalone status site configuration for the public Upptime-backed repo.
 */
const nextConfig: NextConfig = {
	output: 'export',
	trailingSlash: true,
	images: {
		unoptimized: true,
	},
	poweredByHeader: false,
}

export default nextConfig
