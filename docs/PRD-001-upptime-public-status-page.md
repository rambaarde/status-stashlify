# PRD-001: Public Upptime Status Page for Stashlify

## Summary

Build a production status site for Stashlify in a separate public repository so the page stays reachable when the main product is degraded or fully unavailable.

The current `ims-fe-2025` status page is the visual source of truth. The new status system must reproduce that exact public-facing experience as closely as possible while moving the monitoring, history, and deployment into an independent Upptime-backed repository.

## Problem Statement

The existing status experience is effectively self-referential:

- The frontend ` /status` page proxies to the backend via `/api/status`.
- The backend uptime monitor checks Stashlify endpoints from inside the same backend runtime.
- The page falls back to optimistic behavior when data is missing.

This means a full outage can prevent the system from recording or exposing the outage.

### Current implementation evidence

- Frontend status proxy: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/api/status/route.ts](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/api/status/route.ts)
- Current status UI: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/page.tsx](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/page.tsx)
- Historical uptime UI: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/history/page.tsx](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/history/page.tsx)
- Backend uptime monitor: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-be-2025/src/uptime/uptime.service.ts](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-be-2025/src/uptime/uptime.service.ts)
- Uptime persistence model: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-be-2025/prisma/models/uptime.prisma](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-be-2025/prisma/models/uptime.prisma)

### Visual source of truth

The screenshots of the existing `stashlify.com/status` and `stashlify.com/status/history` pages define the production UI target:

- `System Status` page with a top-right refresh action
- green overall health banner
- four service rows with 90-day uptime bars
- right-aligned service state labels
- `Past Incidents` section with date rows and "No incidents reported."
- `Incidents` / `Uptime` tab layout on the history page
- month navigation with previous/next controls
- month-grouped incident list
- month-grouped uptime calendar with hover tooltips

The production status site should preserve this layout, spacing, typography, and interaction model unless a change is required for Upptime compatibility or accessibility.

### Code source for UI parity

The current `ims-fe-2025` status-page implementation is the code-level reference that should be copied into the separate repo where compatible:

- Current status page: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/page.tsx](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/page.tsx)
- Current history page: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/history/page.tsx](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/history/page.tsx)
- Current status layout: [/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/layout.tsx](/Users/ramchristopherbaarde/Documents/intern/stashlify/ims-fe-2025/src/app/status/layout.tsx)

The goal is to copy the existing UI structure, component composition, spacing, and interaction patterns into `status-stashlify`, then replace only the data source and deployment plumbing needed for Upptime.

## Goals

- Keep a public status page online even when the main product is down.
- Record uptime from an independent failure domain using Upptime.
- Preserve the current Stashlify status-page visual language and layout as closely as possible.
- Support a custom domain at `status.stashlify.com`.
- Keep incident reporting and historical uptime data authoritative and auditable.
- Minimize ongoing maintenance after launch.

## Non-Goals

- No tenant-scoped functionality.
- No merchant/admin dashboard logic.
- No reuse of the main Stashlify backend for uptime recording.
- No custom incident CMS.
- No API versioning or changes to the primary product API.
- No attempt to make the main Stashlify repo public.
- No redesign of the current status visual language beyond the minimum required to map it onto Upptime.

## Product Decision

Use a separate public repository, `status-stashlify`, as the production status system.

Upptime will be the operational backbone:

- GitHub Actions performs monitoring.
- GitHub Issues store incidents.
- GitHub Pages serves the public status site.

Official Upptime docs confirm:

- It is free and open source.
- Public repositories are the normal deployment path.
- Private repositories require extra proxy/auth setup for the status site.
- The repo configuration lives in `.upptimerc.yml`.

References:

- [Upptime overview](https://upptime.js.org/docs/)
- [Upptime getting started](https://upptime.js.org/docs/get-started)
- [Upptime configuration](https://upptime.js.org/docs/configuration)
- [Upptime FAQ](https://upptime.js.org/docs/faq/)

## Current `status-stashlify` State

The separate repo already exists locally and is connected to the public GitHub remote:

- Local repo root: [/Users/ramchristopherbaarde/Documents/intern/stashlify/status-stashlify](/Users/ramchristopherbaarde/Documents/intern/stashlify/status-stashlify)
- Remote: `https://github.com/rambaarde/status-stashlify`
- Branch intent: `main` plus `develop`
- Current scaffold: a static-export Next app with a demo JSON feed and an initial Upptime manifest

Important correction:

- The current scaffold is a useful transition step, but the production path should align with the actual Upptime template and workflows, not depend on the main Stashlify app.

## Functional Requirements

### 1. Public status site

- Serve the page at `https://status.stashlify.com`.
- Show a global banner with overall system state.
- Show service cards for:
  - Dashboard & Storefront
  - Inventory, Sales & Orders
  - Payments
  - Authentication
- Show a 90-day uptime view for each service.
- Show a historical incidents page.
- Match the current screenshots for:
  - the exact `System Status` hero treatment
  - the top-right refresh button
  - the 4-row service card stack
  - the `Past Incidents` block
  - the `Incidents` and `Uptime` history tabs
  - the month range selector and left/right navigation
  - the month-grid uptime calendar and hover tooltip behavior
- Copy the current `ims-fe-2025` status-page code into the new repo wherever compatible with the Upptime data model.
- Preserve the same component hierarchy and interaction behavior from the current `ims-fe-2025` status pages.

### 2. Independent monitoring

- Monitor Stashlify production endpoints from Upptime, not from the primary backend runtime.
- Record incidents when endpoints fail.
- Keep incident history available even if the main app is unavailable.

### 3. Honest status behavior

- Do not default to "operational" when the data source is missing.
- If the feed cannot be loaded, show a visible degraded/unknown state.
- Distinguish between "no data" and "healthy".
- Do not present empty history as proof of uptime.

### 4. Branding parity

- Preserve the current editorial Stashlify status-page look, feel, spacing, and interaction model as much as Upptime allows.
- Keep typography, spacing, and the monochrome plus lime-accent visual language.
- Keep the page lightweight and fast on mobile and desktop.

### 5. Deployment

- Use GitHub Pages for public hosting.
- Use the `status.stashlify.com` CNAME.
- Keep repository metadata and workflows aligned with Upptime defaults.

## Data Sources

Primary:

- Upptime GitHub Actions outputs, GitHub Issues, and generated static site assets.

Secondary:

- Optional local demo JSON only for development previews or design work.

## Architecture

### Source of truth

`status-stashlify` repo is the source of truth for status history and site generation.

### Runtime

GitHub Actions executes the monitoring workflow on a schedule. GitHub Pages serves the generated public site. No Stashlify backend dependency is allowed in the production path.

### Domain

- Main product: `stashlify.com`
- Public status site: `status.stashlify.com`

## Risks

- Upptime uses its own template and site generation model, so exact pixel parity may require custom theme work.
- A public repo exposes incident history publicly by design.
- GitHub Actions and Pages constraints can change over time, so the workflow must stay within official Upptime defaults.
- If the status site is implemented as a custom wrapper around Upptime instead of the template itself, it may drift from the upstream model.

## Acceptance Criteria

- The public status site loads at `status.stashlify.com`.
- The site remains accessible when the main Stashlify app is down.
- Incidents are generated from independent monitoring, not the main backend.
- The page visually matches the current Stashlify status page screenshots closely enough that users recognize it immediately.
- The `status` and `status/history` routes preserve the existing layout hierarchy and interaction patterns.
- The history uptime view preserves month grouping, navigation, and hover tooltips.
- The repo is public and documented as the canonical public status source.
- The implementation does not require opening the main Stashlify repos.

## Open Questions

- Do we monitor only production, or also staging endpoints on separate tabs/sections?
- Should `status.stashlify.com` show only public production health, or include a disclaimer that some internal services are excluded?
- How much custom theming is needed to match the existing screenshots while still following Upptime conventions?

## Decision

Proceed with a production public status system powered by Upptime in the separate `status-stashlify` repository, with the current Stashlify status page used as the visual reference and brand target.
Where Upptime-compatible, copy the existing `ims-fe-2025` status-page implementation directly into the new repo and adapt only the monitoring source and hosting layer.
