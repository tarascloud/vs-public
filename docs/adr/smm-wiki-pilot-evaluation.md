# ADR: SMM Wiki Pilot — Interim Evaluation (Day 5 of 14)

> **Status:** Proposed (interim — insufficient runtime data for final verdict)
> **Date:** 2026-04-16
> **Task:** SMM-WIKI-20260411-05
> **Evaluator:** COO Agent
> **Pilot period:** 2026-04-12 to 2026-04-26 (14 days)
> **Evaluation point:** Day 5 of 14 (35% elapsed)

---

## Context

On 2026-04-11, the SMM agent wiki was seeded as a persistent knowledge base
following the Karpathy pattern (structured markdown files that the agent reads
before every task and updates after). The wiki consolidates brand voice,
platform strategy, audience profiles, content templates, analytics, and
strategic decisions into `agents/smm/wiki/` (21 files, 91,603 bytes).

A 2-week pilot (Apr 12-26) was launched to validate the wiki-driven workflow.
Success criteria defined in `pilot/plan.md`:
- LAUNCH: +5 subscribers AND +200 total views
- ADJUST: +200 views but <5 subscribers
- PAUSE: <200 views total

This is an **interim assessment at Day 5** requested by Owner. The final
Go/No-Go review remains scheduled for 2026-04-27.

---

## Critical Finding: No Production Activity During Pilot

**The wiki was seeded but no content was produced during the pilot period.**

Evidence:
- `log.md` has 3 entries, all from 2026-04-11 (pre-pilot seed day). Zero
  entries from 2026-04-12 through 2026-04-16.
- Git history: 3 commits total, all on 2026-04-12 (seed + migration + pilot
  plan). Zero commits since pilot start.
- All 21 wiki files have identical modification timestamp: 2026-04-12 21:41.
  No file was updated during the pilot.
- No `publish` or `metric` type entries in `log.md`.
- Pilot deliverables checklist in `plan.md`: all items unchecked.

**Implication:** The pilot is testing wiki **structure and design quality**, not
wiki **operational effectiveness**. We cannot evaluate whether the wiki reduces
re-prompting, improves consistency, or compounds knowledge because the SMM agent
has not executed any content tasks using the wiki.

---

## Criterion 1: Consistency (re-prompting reduction)

**Target:** 50% reduction in re-prompting about tone/format.
**Result:** NOT MEASURABLE

- Zero content tasks executed during pilot.
- Zero corrections, tone adjustments, or re-prompts in `log.md`.
- Cannot compare before/after because there is no "after."

**Structural assessment:** The wiki *design* supports consistency well:
- `checklist.md` enforces "open brand-voice.md before writing" as Step 1.
- `brand-voice.md` has clear tone-per-platform table and "What VS is NOT" guard
  rails.
- 5 content templates provide fill-in-blank structure.
- Anti-patterns section in `checklist.md` explicitly lists common mistakes.

**Score:** Design = GOOD. Runtime evidence = NONE.

---

## Criterion 2: Compounding (cross-references)

**Target:** Cross-refs >= 2 per page.

**Result:**
- Markdown hyperlinks to .md files: **0** (no `[text](file.md)` links found).
- Filename references (plain text mentions of wiki pages): **47** across all
  files (avg 2.2 per file).
- These are navigational references (e.g., checklist.md says "File:
  `agents/smm/wiki/strategy/brand-voice.md`"), not semantic cross-links.

**Assessment:** The wiki has **procedural cross-references** (checklist points
to files to read) but lacks **semantic cross-references** (e.g., decisions.md
linking to the KPI that motivated a decision). This limits compounding because
new insights in one page do not automatically surface connections to other pages.

Compounding also requires the wiki to *grow over time* with new entries. Since
no content was produced, no new knowledge was captured. The append-only
`decisions.md` has 9 entries, all from seed day.

**Score:** Structure = ADEQUATE. Growth = ZERO.

---

## Criterion 3: Drift (contradictions and staleness)

**Target:** No contradictions between pages. No stale pages.

**Result:**
- Contradictions found: **0** (all content was created in a single batch on
  2026-04-12, so internal consistency is naturally high).
- Stale pages: **21 of 21** (100%) — no file has been modified since seed.
- `analytics/kpis.md` references baseline data from 2026-04-05 (11 days old).
  YouTube metrics are likely different now but not updated.
- `content/calendar.md` references "Active Production Priority (April-May
  2026)" with tasks that may have changed status.

**Assessment:** Drift is not yet a problem because nothing drifted — the wiki
is frozen at seed state. However, the *risk* of drift is high: if the wiki
resumes active use, the 11-day gap means the first session will operate on
stale analytics data.

**Score:** Current drift = LOW (frozen). Drift risk = HIGH (stale baselines).

---

## Criterion 4: Cost (token overhead)

**Measurements:**
- Total wiki size: **91,603 bytes** (21 files)
- Estimated token cost: ~91,603 / 4 = **~22,900 tokens** (if reading all files)
- Practical cost per run (agent reads index + log + 3-5 relevant pages):
  ~8,000-12,000 tokens
- Agent instructions in `smm.md` add wiki reading protocol: ~2,000 tokens of
  instruction overhead

**Comparison with MemPalace-only approach:**
- MemPalace search: 1 query = ~500-2,000 tokens result
- To get equivalent context, SMM agent would need 3-5 MemPalace searches =
  1,500-10,000 tokens
- But MemPalace results are non-deterministic (semantic search may miss
  structured data like template formats or hashtag sets)

**Assessment:** Wiki costs ~8,000-12,000 tokens/run for structured, deterministic
context. MemPalace costs ~5,000-10,000 tokens for fuzzy, potentially incomplete
context. The wiki premium is ~3,000-5,000 tokens per run, which buys
determinism and completeness.

At current Claude pricing (~$3/M input tokens for Sonnet), the wiki overhead is
approximately $0.024-$0.036 per SMM task. Negligible.

**Score:** ACCEPTABLE. Token overhead is modest and the determinism premium is
worth it for template-heavy workflows.

---

## Criterion 5: Delta vs MemPalace-only

| Capability | Wiki | MemPalace | Winner |
|------------|------|-----------|--------|
| Structured templates (fill-in-blank) | Native | Poor (loses formatting in search) | Wiki |
| Strategic decisions with rationale | Native (append-only log) | Good (semantic search) | Tie |
| Brand voice / tone rules | Deterministic (always loaded) | Fuzzy (may miss nuances) | Wiki |
| Cross-domain context (e.g., security + SMM) | Not available | Native (cross-wing search) | MemPalace |
| Analytics with tables/numbers | Exact (markdown tables) | Lossy (embedding may miss numbers) | Wiki |
| Historical context (past sessions) | Not available | Native (session ingestion) | MemPalace |
| Versioned / auditable changes | Git history | ChromaDB (no git) | Wiki |
| New agent onboarding | Read wiki = full context | Multiple searches needed | Wiki |

**Assessment:** Wiki and MemPalace serve complementary roles. Wiki excels at
**structured, template-heavy, deterministic knowledge** (brand voice, content
formats, hashtags, checklists). MemPalace excels at **fuzzy, cross-domain,
historical retrieval** (past decisions, session context, feedback patterns).

The SMM agent specifically benefits from wiki because its work is
template-driven and consistency-critical. Other agents (e.g., Developer,
Architect) might benefit less because their work is more ad-hoc.

**Score:** Wiki provides clear value-add over MemPalace-only for the SMM use
case. Not a replacement — a complement.

---

## Summary Table

| Criterion | Target | Result | Score |
|-----------|--------|--------|-------|
| Consistency | 50% less re-prompting | No data (0 tasks run) | UNMEASURABLE |
| Compounding | >=2 cross-refs/page | 2.2 filename refs/page, 0 hyperlinks | PARTIAL |
| Drift | No contradictions | 0 contradictions, 100% stale | LOW RISK (frozen) |
| Cost | Acceptable overhead | ~10K tokens/run, ~$0.03/task | PASS |
| Delta vs MemPalace | Clear value-add | Strong for templates/structure | PASS |

---

## Verdict: B. ITERATE

**Rationale:**

The wiki **design** is solid: well-structured, comprehensive, with clear
read/write protocols and a daily checklist that enforces consistency. The cost
is acceptable and the value-add over MemPalace-only is clear for
template-driven workflows.

However, the wiki has **zero runtime validation**. No content was produced
during the first 5 days of the pilot. We cannot confirm that the wiki actually
reduces re-prompting, that the checklist is followed, that log.md captures
useful data, or that templates produce better content. The pilot plan called for
4+ YouTube videos, 8+ Shorts, and 14+ Twitter posts by Day 14 — none have been
created.

**We cannot choose GO without runtime evidence. We cannot choose NO-GO because
the design is sound and the cost is low.**

Therefore: **ITERATE** — extend the pilot with a focus on actually executing
content tasks through the wiki workflow.

---

## Root Cause: Why No Production?

The wiki and pilot plan were created, but no SMM tasks were assigned or
triggered during Apr 12-16. Possible causes:
1. SMM agent was not invoked for content tasks during this period.
2. No "роби" command included SMM content tasks in the sprint.
3. Owner did not request content production during this window.
4. The pilot plan assumed daily production but no mechanism triggers it
   automatically (no cron, no scheduler, no daily task creation).

**Key insight:** The pilot plan describes *what* to produce but has no
*automation* to trigger production. It relies on manual invocation of the SMM
agent, which did not happen.

---

## Next Steps

### Immediate (before 2026-04-20)
1. **Create 3-5 concrete SMM tasks in VS** for Week 1 content (Days 14-18 are
   past, but the scripts/descriptions can still be generated as drafts).
2. **Assign tasks to SMM agent** with explicit wiki-workflow requirement.
3. **Run at least 2 content cycles** through the full checklist to validate
   the read-wiki -> create-content -> update-log flow.

### Before Final Evaluation (2026-04-27)
4. **Measure actual re-prompting rate** after 5+ content tasks.
5. **Check log.md growth** — should have 5+ new entries.
6. **Verify checklist adherence** — are all 8 steps followed?
7. **Update stale analytics** — pull fresh YouTube numbers into kpis.md.
8. **Add semantic cross-references** — decisions.md should link to the KPI or
   review that motivated each decision.

### If extending pilot
9. **Add automation:** daily cron or scheduler task that creates an SMM TODO
   task in VS for the day's content.
10. **Reduce wiki scope for first run:** agent reads only index.md + log.md +
    brand-voice.md + relevant template (4 files, ~3,000 tokens) instead of
    full wiki.

---

## Decision Record

- **Decision:** ITERATE (extend pilot, focus on execution)
- **Date:** 2026-04-16
- **Confidence:** Medium (design validated, runtime not)
- **Revisit:** 2026-04-27 (original final review date)
- **Owner:** Owner (approve next steps), COO (create tasks), SMM agent (execute)
