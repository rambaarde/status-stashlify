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
- Stores the feed in `public/status.json`
- Falls back to the live uptime API during local development when needed

## How It Works

1. A scheduled GitHub Actions workflow runs every 5 minutes.
2. The workflow probes the public Stashlify endpoints.
3. The workflow writes the latest results into `public/status.json`.
4. A separate Pages deploy workflow publishes the static site from `main`.
5. The status UI reads `status.json` first, then falls back to the live uptime API, then to a neutral no-data state.

## Data Storage

- No database is used for `status.stashlify.com`.
- The recorder is the GitHub Actions workflow.
- The persisted history lives in `public/status.json` inside this repo.
- GitHub Pages serves that file as part of the static export.

## Local Setup

1. Install dependencies.
2. Run `npm run dev`.
3. Set `NEXT_PUBLIC_STATUS_FEED_URL` only if you want to test a custom feed.

## Notes

- `public/CNAME` is prefilled for `status.stashlify.com`.
- The recorder workflow lives in `.github/workflows/record-status.yml`.
- The site uses static export via Next.js and GitHub Pages.
- If the recorder file is missing, the UI falls back to the live uptime endpoint and then to a neutral no-data state instead of claiming everything is operational.
