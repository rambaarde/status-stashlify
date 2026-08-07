# status-stashlify

Standalone public status site for Stashlify.

## Tech Stack

- Next.js 15.5.7
- React 19
- TypeScript
- GitHub Actions
- GitHub Pages

## What It Does

- Publishes the public status UI at `https://status.stashlify.com`
- Records uptime snapshots without a database
- Stores the live feed in `public/status/current.json`
- Archives daily history in `public/status/archive/YYYY/MM/DD.json`
- Keeps `public/status.json` as a compatibility alias during the migration
- Sends outage and recovery email alerts from a separate GitHub Actions workflow
- Falls back to the live uptime API during local development when needed

## How It Works

1. A scheduled GitHub Actions workflow runs every 5 minutes.
2. The workflow probes the public Stashlify endpoints.
3. The workflow writes the latest results into `public/status/current.json`.
4. The workflow also writes a dated archive row into `public/status/archive/YYYY/MM/DD.json`.
5. A separate alert workflow checks the same endpoints and emails the team through Resend on state changes.
6. A separate Pages deploy workflow publishes the static site from `main`.
7. The status UI reads `public/status/current.json` first, then falls back to `public/status.json`, then to the live uptime API, then to a neutral no-data state.

## Data Storage

- No database is used for `status.stashlify.com`.
- The recorder is the GitHub Actions workflow.
- The alert dedupe state lives in `.github/status-alert-state.json`.
- The persisted live snapshot lives in `public/status/current.json`.
- The historical archive lives under `public/status/archive/`.
- `public/status.json` remains as a compatibility copy until consumers are migrated.
- GitHub Pages serves that file as part of the static export.
- The alert workflow uses `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `STATUS_ALERT_RECIPIENTS` from GitHub Secrets.

## Local Setup

1. Install dependencies.
2. Run `npm run dev`.
3. Set `NEXT_PUBLIC_STATUS_FEED_URL` only if you want to test a custom feed.
4. For alert workflow testing, configure the GitHub Secrets used by the scheduled workflow.

## Notes

- `public/CNAME` is prefilled for `status.stashlify.com`.
- The recorder workflow lives in `.github/workflows/record-status.yml`.
- The alert workflow lives in `.github/workflows/alert-status.yml`.
- The site uses static export via Next.js and GitHub Pages.
- If the recorder file is missing, the UI falls back to the live uptime endpoint and then to a neutral no-data state instead of claiming everything is operational.
