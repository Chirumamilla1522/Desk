---
description: Scan job portals and discover new offers
---

Scan job portals for new offers using career-ops scan mode.

Prefer running `node scan.mjs` from the repo root for the API-backed scan (Greenhouse/Ashby/Lever). It applies `location_filter` in `portals.yml` (default US-only when `mode: us`). Use `node scan.mjs --all-locations` to include non-US roles.

Then follow `modes/scan.md` for Playwright + WebSearch discovery, using the same US location rules as `scan-location-filter.mjs`.

Load the career-ops skill:
```
skill({ name: "career-ops" })
```
