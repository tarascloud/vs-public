# ADR: Gemma Model Migration

**Latest decision:** 2026-04-12 -- GO (gemma4:e4b)
**Previous decision:** 2026-04-11 -- NO-GO (gemma3:27b)

---

## Gemma 4 Evaluation (2026-04-12)

**Date:** 2026-04-12
**Status:** ACCEPTED (GO)
**Decider:** COO (Ola), based on benchmark by Developer agent
**Task:** GEMMA4-20260412-01

### Context

After rejecting gemma3:27b on 2026-04-11 due to speed and RAM penalties, Google released gemma4:e4b -- a new efficient 4-billion parameter model with significantly improved multilingual capabilities. A full benchmark was conducted on production hardware (VPS: Ryzen 5 5500U, 32GB RAM, CPU-only) comparing gemma4:e4b against the current production model qwen2.5:14b-instruct-q4_K_M.

### Benchmark Results

| Metric | Qwen2.5:14b | Gemma4:e4b | Winner |
|--------|-------------|------------|--------|
| Token generation speed | 4.3 tok/s | 10 tok/s | **Gemma4 (2.3x faster)** |
| RAM usage | 9.75 GiB | 9.91 GiB | Tie (practically identical) |
| Ukrainian quality (avg) | 3.2/5.0 | 4.7/5.0 | **Gemma4** |
| CJK contamination | Present | None | **Gemma4** |
| Russian language bleeding | Present (sometimes responds in Russian instead of Ukrainian) | None | **Gemma4** |
| Concurrent load stability | Stable | Stable (slightly faster) | **Gemma4** |

### Decision

**GO** -- migrate to gemma4:e4b as the production model, replacing qwen2.5:14b-instruct-q4_K_M.

### Rationale

1. **2.3x speed improvement.** 10 tok/s vs 4.3 tok/s is a dramatic UX improvement for interactive products (PD AI Chat, SH worker, JF scoring). Response times roughly halved.

2. **Same RAM footprint.** 9.91 GiB vs 9.75 GiB -- negligible difference. No infrastructure changes needed. Ollama 24g container limit remains comfortable.

3. **Superior Ukrainian language quality.** 4.7/5 vs 3.2/5 -- gemma4 produces significantly better Ukrainian text. No CJK bleeding, no Russian language contamination. This eliminates the need for CJK guardrail system prompts (previously P2 follow-up action from gemma3 NO-GO).

4. **All three NO-GO reasons from gemma3:27b are resolved.** Speed is now faster (not slower), RAM is identical (not 2x), and Ukrainian quality is even better.

### Migration Plan

Phased rollout, one service at a time, with validation between each:

| Phase | Service | Target date | Validation |
|-------|---------|-------------|------------|
| 1 | PD (AI Chat) | 2026-04-12 | Manual QA: Ukrainian responses, speed, no regressions |
| 2 | SH (worker transcription/materials) | 2026-04-13 | Check material generation quality, participant names |
| 3 | JF (vacancy scoring) | 2026-04-14 | Compare match scores on 10 known vacancies |
| 4 | Cleanup: remove qwen2.5:14b | 2026-04-26 | After 2-week rollback window |

Steps per phase:
1. `ollama pull gemma4:e4b` (already done during benchmark)
2. Update model name in service config / environment variable
3. Restart service container
4. Validate output quality and response times
5. Monitor for 24h before proceeding to next phase

### Rollback Plan

- **qwen2.5:14b stays installed until 2026-04-26** (14-day retention)
- Rollback per service: revert model name in config, restart container (~2 min)
- Both models fit in RAM simultaneously (9.91 + 9.75 = 19.66 GiB < 24 GiB limit) -- parallel hosting is possible during transition, unlike gemma3:27b
- If any service shows quality regression, roll back that service immediately and investigate

### Consequences

- **qwen2.5:14b is being replaced** across PD, SH, JF, and all Ollama-backed inference
- **CJK guardrail system prompts** (P2 from gemma3 NO-GO) are no longer needed -- can be removed during migration
- **Ollama container stays at 24g** memory limit -- no changes required
- **ML fine-tuning pipeline** (pd-private/ml-training/) will need updating for gemma4 architecture if fine-tuning is desired later

### References

- Benchmark report: `docs/eval/gemma4-e4b-vs-qwen25-benchmark.md` (to be created)
- Previous decision (gemma3 NO-GO): see below
- Ollama config: `infra/docker-compose.yml` (ollama service)

---

## Historical: Gemma3:27b Evaluation (2026-04-11)

**Date:** 2026-04-11
**Status:** REJECTED (NO-GO)
**Decider:** COO (Ola), based on benchmark by Developer agent
**Tasks:** GEMMA-20260411-06 (this decision), GEMMA-20260411-07 (conditional migration, cancelled)

## Context

Gemma3:27b was evaluated as a potential replacement for Qwen2.5:14b-instruct-q4_K_M, the current production LLM running on VPS via Ollama. The motivation was:

1. **Ukrainian language quality** -- Qwen2.5 has a known CJK bleeding issue where Chinese characters contaminate Ukrainian output in cross-language tasks (translation, summarization).
2. **Google ecosystem alignment** -- Gemma is Google's open model family; VS already uses Gemini Flash for cloud-based inference.
3. **General quality** -- newer model generation, potentially better reasoning.

A full benchmark was conducted (see `docs/eval/gemma3-vs-qwen25-benchmark.md`) covering speed, quality, and concurrent load on production hardware (VPS: Ryzen 5 5500U, 32GB RAM, CPU-only).

## Benchmark Results Summary

| Metric | Qwen2.5:14b | Gemma3:27b | Winner |
|--------|-------------|------------|--------|
| Token generation speed | 4.3 tok/s | 2.2 tok/s | Qwen (2x faster) |
| RAM usage | 9.75 GiB | 18.87 GiB | Qwen (1.9x less) |
| Cold load time | 16.8s | 12.7s | Gemma |
| Ukrainian quality (avg) | 3.4/5.0 | 4.3/5.0 | Gemma |
| Grammar score | 3.0/5.0 | 5.0/5.0 | Gemma |
| CJK contamination | Present | None | Gemma |
| Concurrent wall time (3 req) | 129s | 152s | Qwen |
| Can run both simultaneously | No (28.5 GiB combined > 24g limit) | | Neither |

## Decision

**NO-GO** -- do not migrate to Gemma3:27b. Keep Qwen2.5:14b-instruct-q4_K_M as the production model.

## Rationale

1. **Speed is a dealbreaker for user-facing products.** PD AI Chat and SH worker are interactive -- a 2x slowdown (91s vs 47s for a 200-token response) directly degrades UX. Users will notice and stop using the feature.

2. **RAM budget is too tight.** Gemma uses 18.87 GiB of 24 GiB container limit, leaving only 5 GiB headroom. With concurrent services (pg, redis, status, etc.), this risks OOM under peak load. Qwen leaves 14 GiB headroom -- much safer.

3. **Ukrainian quality gap is addressable without migration.** Qwen's CJK bleeding issue can be mitigated via system prompt engineering ("Always respond in Ukrainian. Never output Chinese, Japanese, or Korean characters."). This is cheaper than accepting 2x latency penalty.

4. **No parallel model hosting possible.** Both models cannot coexist in RAM (28.5 GiB combined), ruling out a HYBRID approach on current hardware.

## Consequences

- **Qwen2.5:14b remains the production model** for PD AI Chat, SH worker, JF scoring, and all Ollama-backed inference.
- **GEMMA-20260411-07** (conditional migration task) is cancelled.
- **System prompts should be updated** across PD/SH/JF to include explicit language guardrails against CJK contamination.
- **Ollama container stays at 24g** memory limit (was raised from 10g during eval). This gives Qwen comfortable headroom and allows for future model upgrades without config changes.

## Follow-up Actions

| Action | Priority | Notes |
|--------|----------|-------|
| Add CJK guardrail to Qwen system prompts | P2 | PD, SH, JF -- "respond only in the requested language" |
| Monitor gemma3:12b release | P4 | May offer quality gains without speed/RAM penalty |
| Re-evaluate on hardware upgrade | P4 | GPU or 64GB RAM would change the calculus |
| Consider Qwen2.5:14b fine-tuning for Ukrainian | P3 | Already have LoRA pipeline in pd-private/ml-training/ |

## References

- Benchmark report: `docs/eval/gemma3-vs-qwen25-benchmark.md`
- Ollama config: `infra/docker-compose.yml` (ollama service)
- ML training pipeline: `pd-private/ml-training/`
