# Contrast Audit — --muted-foreground across projects

**Date:** 2026-04-19
**Ticket:** REV-20260419-0021
**Scope:** All Vibe Studio ecosystem projects (VS, PD, JF, SH, BP, KO)
**Standard:** WCAG 2.1 AA requires **4.5:1** for normal text, **3:1** for large text (>=18pt or 14pt bold).

## Summary

Most shared-token combinations already pass WCAG AA (see README.md contrast matrix). However, **PD and JF** historically ship `--muted-foreground: #64748b` (slate-500) which drops to ~4.64:1 on light backgrounds — technically passing but **borderline** and failing when users adjust gamma/brightness.

## Per-Project Measurements

### VS (Vibe Studio — dark zinc palette)

| Token               | FG        | BG        | Ratio  | Status |
|---------------------|-----------|-----------|--------|--------|
| `--text-muted`      | `#a1a1aa` | `#09090b` | 7.8:1  | PASS   |
| `--text-muted`      | `#a1a1aa` | `#18181b` | 6.9:1  | PASS   |

VS is safe — zinc-400 on near-black delivers strong contrast.

### PD (Personal Dashboard — slate palette, light+dark)

| Token               | FG        | BG        | Ratio  | Status      |
|---------------------|-----------|-----------|--------|-------------|
| `--muted-foreground`| `#64748b` | `#f8fafc` | 4.64:1 | BORDERLINE  |
| `--muted-foreground`| `#64748b` | `#ffffff` | 4.83:1 | BORDERLINE  |
| `--muted-foreground`| `#94a3b8` | `#0a0f1a` | 7.5:1  | PASS        |

**Recommendation:** darken `--muted-foreground` from `#64748b` (slate-500) to `#52525b` (zinc-600) or `#475569` (slate-600). New ratio: `#475569` on `#f8fafc` = **7.2:1** (AAA).

### JF (JobFinder — slate palette, light+dark)

Same palette as PD. Identical findings.

**Recommendation:** same — darken `--muted-foreground` → `#475569` or align with shared `--text-muted: #5f6f84` which passes at 4.9:1.

### SH (Shuleansky — warm palette)

| Token               | FG        | BG        | Ratio  | Status |
|---------------------|-----------|-----------|--------|--------|
| `--text-muted`      | `#6b6155` | `#f6f5f0` | 5.6:1  | PASS   |
| `--text-muted`      | `#8a9a90` | `#0c100e` | 6.5:1  | PASS   |

SH is safe.

### BP / KO

BP and KO inherit default shared-tokens palette (`--text-muted: #5f6f84`) — 4.7–5.1:1 across bg layers. PASS.

## Action Items

1. **PD:** edit `pd-private/next/src/app/globals.css` — replace `--muted-foreground: #64748b` with `#475569` (light) and verify dark stays `#94a3b8`.
2. **JF:** edit `jf-private/src/app/globals.css` — same change.
3. **VS/SH/BP/KO:** no changes required.
4. **Future:** prefer shared `--text-muted` token from `@vs/shared-tokens` rather than local `--muted-foreground` for new code.

## Methodology

- Ratios calculated with WebAIM Contrast Checker formula: `(L1 + 0.05) / (L2 + 0.05)` where `L = 0.2126*R + 0.7152*G + 0.0722*B` (linearised sRGB).
- Cross-checked with Chrome DevTools > Rendering > Emulate vision deficiencies.

## Not Changed in This Ticket

This ticket (REV-20260419-0021) is **documentation-only**. Per-project code changes deferred to follow-up tickets — each project owner should review and apply.
