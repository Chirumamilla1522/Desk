# Mode: Deep — Deep Research Prompt

Generates a structured prompt for Perplexity/Claude/ChatGPT with 6 axes:

```
## Deep Research: [Company] — [Role]

Context: I am evaluating a candidate for [role] at [company]. I need actionable information for the interview.

### 1. AI Strategy
- What products/features use AI/ML?
- What is their AI stack? (models, infrastructure, tools)
- Do they have an engineering blog? What do they publish?
- What papers or talks have they given on AI?

### 2. Recent Developments (last 6 months)
- Any relevant hires in AI/ML/product?
- Any acquisitions or partnerships?
- Any product launches or pivots?
- Any funding rounds or leadership changes?

### 3. Engineering Culture
- How do they ship? (deployment cadence, CI/CD)
- Single-repo or multi-repo?
- What languages/frameworks do they use?
- Remote-first or office-first?
- Glassdoor/Blind reviews on engineering culture?

### 4. Probable Challenges
- What scaling issues do they have?
- Reliability, cost, and latency challenges?
- Are they migrating anything? (infrastructure, models, platforms)
- What pain points do people mention in reviews?

### 5. Competitors and Differentiation
- Who are their main competitors?
- What is their moat/differentiator?
- How do they position themselves against the competition?

### 6. Candidate Perspective
Given my profile (read from cv.md and profile.yml for specific experience):
- What unique value do I bring to this team?
- Which of my projects are most relevant?
- What story should I tell in the interview?
``

Customize each section with the specific context of the job posting.