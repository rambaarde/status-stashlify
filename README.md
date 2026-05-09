# status-stashlify

Standalone public status site scaffold for Stashlify.

## Purpose

- Preserve the current status-page UI in a separate failure domain.
- Record uptime snapshots in `public/status.json` via a GitHub Actions cron job.
- Read status data from the static JSON feed first, then fall back to the live
  uptime endpoint during local development.
- Keep the main Stashlify apps private and separate.
- Publish the site to GitHub Pages at `status.stashlify.com`.

## Local setup

1. Install dependencies.
2. Set `NEXT_PUBLIC_UPTIME_API_URL` or `NEXT_PUBLIC_STATUS_FEED_URL` if needed.
3. Run `npm run dev`.

## Notes

- `public/CNAME` is prefilled for `status.stashlify.com`.
- If the recorder file is missing, the UI falls back to the live uptime endpoint
  and then to a neutral no-data state instead of claiming everything is
  operational.
- The deployed site uses static export via Next.js and GitHub Pages.
