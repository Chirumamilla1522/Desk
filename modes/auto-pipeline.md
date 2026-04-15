# Mode: auto-pipeline — Fully Automated Pipeline

When the user pastes a Job Description (JD)—either as text or a URL—without an explicit sub-command, execute the ENTIRE pipeline in sequence:

## Step 0 — Extract JD

If the input is a **URL** (rather than pasted JD text), follow this strategy to extract the content:

**Priority Order:**

1. **Playwright (Preferred):** Most job boards (Lever, Ashby, Greenhouse, Workday) are SPAs (Single Page Applications). Use `browser_navigate` + `browser_snapshot` to render and read the JD.
2. **WebFetch (Fallback):** For static pages (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (Last Resort):** Search for the role title + company name on secondary portals that index the JD in static HTML.

**If no method works:** Ask the candidate to paste the JD manually or share a screenshot.

**If the input is JD text** (not a URL): Use it directly; no fetching is required.

## Step 1 — A-G Evaluation
Execute exactly as in `oferta` mode (read `modes/oferta.md` for all Blocks A-F + Block G: Posting Legitimacy).

## Step 2 — Save .md Report
Save the complete evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (see format in `modes/oferta.md`).
Include Block G in the saved report. Add `**Legitimacy:** {tier}` to the report header.

## Step 3 — Generate PDF
Execute the full `pdf` pipeline (read `modes/pdf.md`).

## Step 4 — Draft Application Answers (Only if Score >= 4.5)

If the final score is >= 4.5, generate a draft of responses for the application form:

1. **Extract Form Questions:** Use Playwright to navigate to the application form and capture a snapshot. If questions cannot be extracted, use the generic questions instead. 2. **Generate responses** following the tone (see below).

3. **Save in the report** as section `## H) Draft Application Answers`.

### Generic Questions (use if they cannot be extracted from the form)

- Why are you interested in this role?

- Why do you want to work at [Company]?

- Tell us about a relevant project or achievement
- What makes you a good fit for this position?

- How did you hear about this role?

## Tone for Form Answers

**Position: "I'm choosing you."** The candidate has options and is choosing this company for specific reasons.

**Tone Rules:**
- **Confident without arrogance**: "I've spent the past year building production AI agent systems — your role is where I want to apply that experience next."
- **Selective without arrogance**: "I've been intentional about finding a team where I can contribute meaningfully from day one."
- **Specific and concrete**: Always reference something REAL from JD or the company, and something REAL from the candidate's experience.
- **Direct, without fluff**: 2-4 sentences per answer. No "I'm passionate about..." or "I would love the opportunity to..."
- **The hook is the evidence, not the claim**: Instead of "I'm great at X," say "I built X that does Y."

**Framework per question:**
- **Why this role?** → "Your [specific thing] maps directly to [specific thing I built]."

- **Why this company?** → Mention something specific about the company. "I've been using [product] for [time/purpose]."
- **Relevant experience?** → A quantified proof point. "Built [X] that [metric]. Sold the company in 2025."
- **Good fit?** → "I sit at the intersection of [A] and [B], which is exactly where this role lives."
- **How did you hear?** → Honest: "Found through [portal/scan], evaluated against my criteria, and it scored highest."

**Language**: Always use the language of the JD (EN by default). Apply `/tech-translate`.

## Step 5 — Update Tracker
Record the entry in `data/applications.md`, filling in all columns—including Report and PDF—with ✅.

**If any step fails**, proceed with the subsequent steps and mark the failed step as pending in the tracker.