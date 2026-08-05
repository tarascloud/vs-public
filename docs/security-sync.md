# Security Utils Sync — Canonical Sources

Cross-project security utilities that must stay in sync until `@vibe-studio/security` is extracted.
See also: `.claude/rules/security-sync.md` (agent-facing rules), `docs/adr/shared-security-utils.md` (ADR).

## Canon versions

| Utility | Canon project | Canon file | Description |
|---------|--------------|------------|-------------|
| `sanitizeHtml()` | **PD** | `pd-private/next/src/lib/sanitize-html.ts` | DOMPurify-based HTML sanitizer (strict) |
| `sanitizeSchemaHtml()` | **SH** | `sh-private/src/lib/sanitize-html.ts` | SVG/diagram-aware sanitizer |
| `requireAuth/requireOwner` | **JF** | `jf-private/src/lib/auth-helpers.ts` | API route auth guards |
| `checkRateLimit` | **PD** | `pd-private/next/src/lib/rate-limit.ts` | Redis-backed rate limiter |
| `prompt-guard.ts` | **PD** | `pd-private/next/src/lib/prompt-guard.ts` | LLM prompt injection detection + input sanitization |

## prompt-guard.ts

Canon: `pd-private/next/src/lib/prompt-guard.ts` (created REV-20260419-0046).

Exports:
- `isLikelyPromptInjection(text: string): boolean` — detects instruction override, system prompt leaks, ChatML/Llama template escapes
- `sanitizeUserInput(text: string, maxLength?: number): string` — trims to prevent token-exhaustion (default 10000 chars)
- `wrapUserContent(text: string): string` — wraps in `<user_input>` tags for model boundary enforcement

Usage: MUST be applied on all AI endpoints that accept user text before forwarding to LLM.

Projects that need this utility:
- PD: AI Chat endpoints (canon, already uses it)
- JF: AI scoring endpoints (gap — needs copy from PD)
- SH: Ollama prompt endpoints (gap — needs copy from PD)
- VS: no direct AI endpoints currently

## Sync workflow

1. Canonical change goes to the canon project first
2. Copy to consumer projects (preserving the file verbatim)
3. If a project needs project-specific modifications, document WHY in a code comment
4. Track sync gaps in `.claude/rules/security-sync.md` known gaps section
