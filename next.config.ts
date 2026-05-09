import type { NextConfig } from 'next'

/**
 * Standalone status site configuration for the public Upptime-backed repo.
 */
const nextConfig: NextConfig = {
	basePath: '/status-stashlify',
	assetPrefix: '/status-stashlify',
	output: 'export',
	trailingSlash: true,
	images: {
		unoptimized: true,
	},
	poweredByHeader: false,
}

export default nextConfig
