# Customization Guide

## Profile (config/profile.yml)

This is the single source of truth for your identity. All modes read from here.

Key sections:
- **candidate**: Name, email, phone, location, LinkedIn, portfolio
- **target_roles**: Your North Star roles and archetypes
- **target_companies**: Dream employers or a deliberate watchlist (optional; separate from `portals.yml` scan toggles)
- **narrative**: Your headline, exit story, superpowers, proof points
- **compensation**: Target range, minimum, currency
- **location**: Country, timezone, visa status, on-site availability

## Target Roles (modes/_shared.md)

The archetype table in `_shared.md` determines how offers are scored and CVs are framed. Edit the table to match YOUR career targets:

```markdown
| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Your Role 1** | key skills | what they need |
| **Your Role 2** | key skills | what they need |
```

Also update the "Adaptive Framing" table to map YOUR specific projects to each archetype.

## Portals (portals.yml)

Copy from `templates/portals.example.yml` and customize:

1. **title_filter.positive**: Keywords matching your target roles
2. **title_filter.negative**: Tech stacks or domains to exclude
3. **location_filter**: When `mode: us`, `node scan.mjs` keeps only US-based jobs using `isUSJobLocation()` (see `scan-location-filter.mjs`) — location is checked **before** the title keyword filter, and with `include_title_in_location_match` (default on) the job title is scanned for non-US offices like `(Tokyo)`. Use `node scan.mjs --all-locations` to disable.
4. **scan_options**: For `node scan.mjs`, sort new pipeline rows by ATS posted date (`sort_by: posted_at`, `sort_order: desc|asc`) and optionally append `YYYY-MM-DD` to each pipeline line (`show_posted_in_pipeline`). CLI recency: `node scan.mjs --last-day`, `--last-week`, or `--since-days N` keeps only jobs whose ATS posted timestamp falls in that rolling window (jobs without a date are excluded). **Use hyphens** (`--last-week`) or **underscores** (`--last_week`) — both work.
5. **search_queries**: WebSearch queries for job boards (Ashby, Greenhouse, Lever)
6. **tracked_companies**: Companies to check directly

## CV Template (templates/cv-template.html)

The HTML template uses these design tokens:
- **Fonts**: Space Grotesk (headings) + DM Sans (body) -- self-hosted in `fonts/`
- **Colors**: Cyan primary (`hsl(187,74%,32%)`) + Purple accent (`hsl(270,70%,45%)`)
- **Layout**: Single-column, ATS-optimized

To customize fonts/colors, edit the CSS in the template. Update font files in `fonts/` if switching fonts.

## Negotiation Scripts (modes/_shared.md)

The negotiation section provides frameworks for salary discussions. Replace the example scripts with your own:
- Target ranges
- Geographic arbitrage strategy
- Pushback responses

## Hooks (Optional)

Career-ops can integrate with external systems via Claude Code hooks. Example hooks:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Career-ops session started'"
      }]
    }]
  }
}
```

Save hooks in `.claude/settings.json`.

## States (templates/states.yml)

The canonical states rarely need changing. If you add new states, update:
1. `templates/states.yml`
2. `normalize-statuses.mjs` (alias mappings)
3. `modes/_shared.md` (any references)
