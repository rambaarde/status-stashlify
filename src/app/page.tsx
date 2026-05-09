import StatusPage from './status/page'

/**
 * Root route renders the public status dashboard so the custom domain shows
 * the same content immediately without a client-side redirect.
 */
export default function HomePage() {
	return <StatusPage />
}
