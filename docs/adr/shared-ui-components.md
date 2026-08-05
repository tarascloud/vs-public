# ADR: @vibe-studio/ui — Shared shadcn Component Library

**Date:** 2026-04-19
**Status:** PROPOSED
**Task:** REV-20260419-0015
**Effort:** XL (cross-repo extraction)

## Context

shadcn/ui components are duplicated across PD, JF, and SH. Each project independently ran `npx shadcn add <component>` and then diverged over time.

### Component inventory

| Component | PD | JF | SH | Notes |
|-----------|:--:|:--:|:--:|-------|
| accordion.tsx | x | | | PD-only |
| avatar.tsx | x | | | PD-only |
| badge.tsx | x | x | x | ALL DIFFERENT (custom variants) |
| button.tsx | x | x | x | PD~SH (19 diff lines), JF heavily customized |
| calendar.tsx | x | | | PD-only |
| card.tsx | x | x | x | PD~SH (20 diff lines), JF heavily customized |
| checkbox.tsx | x | | | PD-only |
| command.tsx | x | | | PD-only |
| confirm-dialog.tsx | x | | | PD-only custom |
| dialog.tsx | x | x | x | PD~SH (27 diff lines), JF heavily customized |
| dropdown-menu.tsx | x | x | x | **PD=SH identical**, JF different |
| fab.tsx | x | | | PD-only custom |
| input-group.tsx | x | | | PD-only custom |
| input.tsx | x | x | x | **PD=SH identical**, JF different |
| label.tsx | x | x | | PD/JF different |
| password-input.tsx | x | | | PD-only custom |
| period-selector.tsx | x | | | PD-only custom |
| popover.tsx | x | | | PD-only |
| radio-group.tsx | x | | | PD-only |
| scroll-area.tsx | x | | | PD-only |
| select.tsx | x | x | x | **PD=SH identical**, JF different |
| separator.tsx | x | x | x | **PD=SH identical**, JF different |
| sheet.tsx | x | | x | PD/SH to compare |
| skeleton.tsx | x | x | x | PD~SH (4 diff lines), JF different |
| slider.tsx | x | | | PD-only |
| sonner.tsx | x | | | PD-only |
| switch.tsx | x | x | x | **PD=SH identical**, JF different |
| table.tsx | x | x | | PD/JF different |
| tabs.tsx | x | x | x | PD~SH (4 diff lines), JF different |
| textarea.tsx | x | x | x | **PD=SH identical**, JF different |
| toggle.tsx | x | | | PD-only |
| tooltip.tsx | x | x | | PD/JF different |

**File counts:** PD: 32 | JF: 15 | SH: 13

### Identity analysis

**Byte-identical across PD and SH (6 components):**
- `dropdown-menu.tsx`, `input.tsx`, `select.tsx`, `separator.tsx`, `switch.tsx`, `textarea.tsx`

**Near-identical PD~SH (< 30 diff lines, trivial differences):**
- `button.tsx` (19 lines), `card.tsx` (20 lines), `dialog.tsx` (27 lines), `skeleton.tsx` (4 lines), `tabs.tsx` (4 lines)

**Heavily customized per-project (> 60 diff lines):**
- `badge.tsx` — each project has unique variant sets
- All JF components — JF customized props, styling, and structure significantly

### Root cause of divergence

JF was built independently with different design requirements (job search UI vs personal dashboard). SH was forked from PD later, so it closely matches PD. The real sharing opportunity is **PD <-> SH** with JF joining only for base primitives.

## Decision

Create `@vibe-studio/ui` as a shared component package with a tiered approach.

### Tier 1: Base primitives (identical or trivially different)

These go into the shared package as-is. PD is the canon source.

```
packages/ui/src/
  dropdown-menu.tsx
  input.tsx
  select.tsx
  separator.tsx
  switch.tsx
  textarea.tsx
  skeleton.tsx
  tabs.tsx
  button.tsx
  card.tsx
  dialog.tsx
```

### Tier 2: Customizable via variants/slots

Components where projects need different variant sets (badge, table, tooltip). Export base + allow variant extension.

```typescript
// packages/ui/src/badge.tsx
export const badgeVariants = cva("...", {
  variants: {
    variant: { default: "...", secondary: "...", outline: "..." },
  },
});

// pd-private: extends with income/expense/pending variants
// jf-private: extends with match/applied/rejected variants
```

### Tier 3: Project-specific (NOT shared)

Components that only exist in one project or are too specialized:
- PD: `accordion`, `avatar`, `calendar`, `checkbox`, `command`, `confirm-dialog`, `fab`, `input-group`, `password-input`, `period-selector`, `popover`, `radio-group`, `scroll-area`, `slider`, `sonner`, `toggle`

### Package structure

```
packages/ui/
  package.json          # @vibe-studio/ui
  src/
    button.tsx
    card.tsx
    dialog.tsx
    dropdown-menu.tsx
    input.tsx
    select.tsx
    separator.tsx
    skeleton.tsx
    switch.tsx
    tabs.tsx
    textarea.tsx
    badge.tsx            # extensible base
    label.tsx            # extensible base
    tooltip.tsx          # extensible base
    table.tsx            # extensible base
    sheet.tsx            # extensible base
  index.ts              # barrel export
  tsconfig.json
```

### Dependencies

- `@vibe-studio/dashboard-tokens` (ADR: shared-css-tokens.md) — must be extracted first
- React 19, Tailwind CSS 4, `class-variance-authority`, `tailwind-merge`, `lucide-react`

### Migration plan

| Phase | Description | Effort | Depends on |
|-------|-------------|--------|------------|
| 0 | Extract `@vibe-studio/dashboard-tokens` first | XL | shared-css-tokens ADR |
| 1 | Create `packages/ui/` with Tier 1 components from PD | M | Phase 0 |
| 2 | Replace PD `components/ui/` Tier 1 with imports from `@vibe-studio/ui` | M | Phase 1 |
| 3 | Replace SH `components/ui/` — should be near drop-in | S | Phase 1 |
| 4 | Replace JF `components/ui/` shared subset — may need adapter wrappers | M | Phase 1 |
| 5 | Add Storybook or visual test harness for shared components | M | Phase 1 |

### Risks

- **Version coupling** — a breaking change in shared button affects all 3 projects. Mitigate with semver and visual tests.
- **JF divergence** — JF's components are significantly different. May need wrapper components or forked variants. Do not force-unify.
- **Build complexity** — workspace packages need correct `exports` config for Next.js App Router. Use `"type": "module"` + raw TSX (no pre-build).

## Alternatives considered

1. **shadcn registry** — too complex for 3 internal projects
2. **git submodule** — rejected: poor DX
3. **Keep copying, add diff-check CI** — stopgap, not sustainable

## Consequences

- 11 components maintained in one place instead of 3
- New projects (VS app, future) get a consistent UI baseline
- PD remains the "canon" source for shared components
