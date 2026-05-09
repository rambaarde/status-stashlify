'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Root route redirects to the public status page.
 */
export default function HomePage() {
	const router = useRouter()

	useEffect(() => {
		router.replace('/status')
	}, [router])

	return null
}
