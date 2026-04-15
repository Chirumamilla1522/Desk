# Mode: offer — Full Evaluation A–G

When the candidate pastes a job posting (text or URL), ALWAYS deliver the 7 blocks (A–F evaluation + G legitimacy).

---

## Step 0 — Archetype Detection

Classify the job into one of the 6 archetypes (see `_shared.md`). If hybrid, indicate the 2 closest.

This determines:
- Which proof points to prioritize in Block B  
- How to rewrite the summary in Block E  
- Which STAR stories to prepare in Block F  

---

## Block A — Role Summary

Create a table with:
- Detected archetype  
- Domain (platform / agentic / LLMOps / ML / enterprise)  
- Function (build / consult / manage / deploy)  
- Seniority  
- Remote (full / hybrid / onsite)  
- Team size (if mentioned)  
- TL;DR in 1 sentence  

---

## Block B — Match with CV

Read `cv.md`. Create a table mapping each JD requirement to exact lines from the CV.

### Adaptation by Archetype
- FDE → prioritize fast delivery and client-facing proof points  
- SA → prioritize system design and integrations  
- PM → prioritize product discovery and metrics  
- LLMOps → prioritize evals, observability, pipelines  
- Agentic → prioritize multi-agent systems, HITL, orchestration  
- Transformation → prioritize change management, adoption, scaling  

### Gaps Section

For each gap:
1. Is it a hard blocker or a nice-to-have?  
2. Can the candidate show adjacent experience?  
3. Is there a portfolio project covering this gap?  
4. Concrete mitigation plan:
   - Cover letter phrasing  
   - Quick project  
   - Positioning strategy  

---

## Block C — Level and Strategy

1. **Detected level** in the JD vs **candidate’s natural level for that archetype**

2. **“Sell senior without lying” plan**
   - Specific phrasing aligned with archetype  
   - Key achievements to highlight  
   - Position founder experience as leverage  

3. **“If down-leveled” plan**
   - Accept if compensation is fair  
   - Negotiate a 6-month review  
   - Define clear promotion criteria  

---

## Block D — Compensation and Demand

Use WebSearch to gather:
- Salary benchmarks (Glassdoor, Levels.fyi, Blind)  
- Company compensation reputation  
- Demand trend for the role  

### Output
- Table with data + cited sources  
- If no data exists → explicitly say so (do not fabricate)

---

## Block E — Personalization Plan

| # | Section | Current State | Proposed Change | Why |
|---|--------|--------------|----------------|-----|
| 1 | Summary | ... | ... | ... |

### Deliverables
- Top 5 CV changes  
- Top 5 LinkedIn changes  

Goal: maximize match with this role.

---

## Block F — Interview Plan

Create 6–10 STAR+R stories mapped to JD requirements:

| # | JD Requirement | STAR+R Story | S | T | A | R | Reflection |
|---|--------------|-------------|---|---|---|---|------------|

### Reflection
The **Reflection** column captures lessons learned or what would be done differently.  
This signals seniority:
- Junior → describes events  
- Senior → extracts insights  

---

### Story Bank

If `interview-prep/story-bank.md` exists:
- Check for existing stories  
- Append new ones if missing  

Goal: build a reusable bank of 5–10 core stories.

---

### Archetype-Based Emphasis

- FDE → delivery speed, client interaction  
- SA → architecture decisions  
- PM → discovery and trade-offs  
- LLMOps → metrics, evals, production hardening  
- Agentic → orchestration, error handling, HITL  
- Transformation → adoption, org change  

---

### Additional Requirements

- 1 recommended case study:
  - Which project to present  
  - How to structure it  

- Red-flag questions + answers:
  - Example: “Why did you sell your company?”  
  - Example: “Do you manage people?”  

---

## Block G — Posting Legitimacy

Analyze whether the job posting is real and active.

### Ethical Framing
Provide observations, not accusations.  
All signals may have legitimate explanations.

---

### Signals to Analyze

#### 1. Posting Freshness
- Date posted / “X days ago”  
- Apply button state (active / closed / missing / redirect)  
- Redirect behavior  

#### 2. Description Quality
- Specific tools/technologies listed?  
- Team/org context provided?  
- Realistic requirements?  
- Clear 6–12 month scope?  
- Compensation transparency?  
- % of generic vs specific content  
- Internal contradictions?  

#### 3. Company Hiring Signals
Search:
- `"{company}" layoffs {year}`  
- `"{company}" hiring freeze {year}`  

Evaluate:
- Timing  
- Scale  
- Department relevance  

---

#### 4. Reposting Detection
- Check `scan-history.tsv`  
- Has the same role been reposted multiple times?  

---

#### 5. Role Market Context
- Typical hiring duration (4–6 weeks?)  
- Alignment with company business  
- Realistic seniority expectations  

---

### Output Format

#### Assessment
- High Confidence  
- Proceed with Caution  
- Suspicious  

#### Signals Table
| Signal | Finding | Weight |
|--------|--------|--------|

#### Context Notes
Explain edge cases and mitigating factors.

---

### Edge Cases

- Government / academic → 60–90 day cycles normal  
- Evergreen roles → continuous hiring, not suspicious  
- Executive roles → long timelines expected  
- Startups → vague JDs may be valid  
- No posting date → default to “Proceed with Caution”  
- Recruiter-sourced → recruiter contact = positive signal  

---

# Post-Evaluation (MANDATORY)

## 1. Save Report (.md)

### Path
```

reports/{###}-{company-slug}-{YYYY-MM-DD}.md

````

### Naming Rules
- `{###}` = sequential ID (zero-padded)  
- `{company-slug}` = lowercase, hyphen-separated  
- `{YYYY-MM-DD}` = current date  

---

## Report Template

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}  
**Archetype:** {detected}  
**Score:** {X/5}  
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}  
**PDF:** {path or pending}  

---

## A) Role Summary
(full Block A)

## B) Match with CV
(full Block B)

## C) Level and Strategy
(full Block C)

## D) Compensation and Demand
(full Block D)

## E) Personalization Plan
(full Block E)

## F) Interview Plan
(full Block F)

## G) Posting Legitimacy
(full Block G)

## H) Draft Application Answers
(only if score >= 4.5)

---

## Extracted Keywords
(15–20 ATS keywords from the JD)
````

---

## 2. Register in Tracker

Always log in:

```
data/applications.md
```

### Fields

* Sequential ID
* Date
* Company
* Role
* Score (1–5)
* Status: `Evaluated`
* PDF: ❌ / ✅
* Report link

---

## Tracker Format

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```

```
```
