# Sprints: Public Upptime Status Page

## Sprint 1: Foundation and repository alignment

Goal: make `status-stashlify` the canonical public status repository.

Deliverables:

- Confirm repo settings and branch model.
- Keep `main` as the default branch and `develop` as the working branch.
- Finalize `.upptimerc.yml`.
- Confirm `status.stashlify.com` CNAME setup.
- Decide whether the repo follows the Upptime template directly or keeps the current Next scaffold as a temporary adapter.
- Lock the screenshots of the current `stashlify.com/status` and `stashlify.com/status/history` pages as the UI reference for parity.
- Identify the current `ims-fe-2025` status-page files that will be copied into the new repo.

Exit criteria:

- Repository is ready for production work.
- The deployment target and source-of-truth model are unambiguous.

## Sprint 2: Monitoring and data integrity

Goal: establish reliable, independent uptime checks.

Deliverables:

- Configure production endpoints in Upptime.
- Verify check cadence and incident creation.
- Confirm GitHub Actions workflows run on schedule.
- Confirm GitHub Issues are created and closed correctly on outages.
- Decide how to handle "unknown" and "no data" states.
- Define the source-of-truth mapping from Upptime history to the current screenshot-style uptime bars and incident rows.
- Map the current `ims-fe-2025` status data model to the Upptime-generated data shape.

Exit criteria:

- Monitoring can detect outages without the main Stashlify backend.
- Incident history is authoritative and reproducible.

## Sprint 3: Visual parity with the current status page

Goal: make the public status site feel like the current Stashlify status page.

Deliverables:

- Match the current banner, service cards, and history layout.
- Keep the light editorial design.
- Preserve the lime operational color and red outage color.
- Ensure mobile and desktop layouts are clean.
- Keep the page fast and accessible.
- Match the `System Status` page screenshot, including the refresh button placement, 4-row service list, and `Past Incidents` block.
- Match the history page screenshot, including the tab rail, range controls, month cards, and calendar tooltips.
- Port the current `ims-fe-2025` status page and history page structure into the new repo where Upptime-compatible.
- Reuse the current component hierarchy, spacing, and interaction details instead of redrawing the UI from scratch.

Exit criteria:

- A user familiar with the current Stashlify status page recognizes the new page immediately.

## Sprint 4: Custom domain and production cutover

Goal: launch the public status site on `status.stashlify.com`.

Deliverables:

- Configure GitHub Pages publication.
- Verify DNS/CNAME.
- Add any required repo metadata.
- Validate the live site from outside the Stashlify stack.
- Document the operational process for future incidents.
- Verify the live page still reads like the current screenshots after deployment on `status.stashlify.com`.

Exit criteria:

- `status.stashlify.com` is live and independent.
- The production status site no longer depends on the main Stashlify runtime.

## Sprint 5: Hardening and maintenance

Goal: reduce operational surprise after launch.

Deliverables:

- Add incident-writing guidance.
- Document maintenance steps for monitor changes.
- Review alert routing and issue templates.
- Add a fallback or disclaimer for prolonged GitHub service issues.
- Add guidance for keeping the public status screenshots visually stable across future edits.

Exit criteria:

- The status site has a repeatable maintenance path and clear ownership.

## Recommended order

1. Sprint 1
2. Sprint 2
3. Sprint 3
4. Sprint 4
5. Sprint 5

## Notes

- The current `ims-fe-2025` and `ims-be-2025` status code is a reference point, not the production architecture.
- The production design should prefer Upptime-generated data over backend-generated uptime records.
- If we decide to preserve the current Next scaffold, it should be treated as an adapter or preview layer, not the source of truth.
