/**
 * Build a minimal HTML document for printing a job description to PDF.
 * Used by Desk "external JD" flow (Playwright via generate-pdf.mjs).
 */
export function escapeHtmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildJdReferenceHtml({ company, role, url, body }) {
  const c = escapeHtmlText(company || 'Company');
  const r = escapeHtmlText(role || 'Role');
  const u = url && String(url).trim() ? escapeHtmlText(String(url).trim()) : '';
  const raw = String(body ?? '');
  const bodyEscaped = escapeHtmlText(raw);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${c} — ${r}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 1.25rem; line-height: 1.5; color: #111; }
    h1 { font-size: 1.15rem; margin: 0 0 0.5rem; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1rem; word-break: break-word; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 0.88rem; margin: 0; }
  </style>
</head>
<body>
  <h1>Job description (reference)</h1>
  <div class="meta"><strong>${c}</strong> — ${r}${u ? `<br/>URL: ${u}` : ''}</div>
  <pre>${bodyEscaped}</pre>
</body>
</html>
`;
}

export function slugifyDesk(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'posting';
}
