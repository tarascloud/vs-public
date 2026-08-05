# @vibe-studio/ui

Canonical shadcn/ui components shared by Owner Cloud dashboard apps.

**Status:** Scaffold (v0.1.0). Not yet wired as an npm workspace. Each
consumer project still has its own `components/ui/`. See
[docs/adr/shared-ui-package.md](../../docs/adr/shared-ui-package.md)
for the migration plan.

## Canonical versions

The components in this package are taken from **PD** (pd-private) as
the reference implementation — PD has the most complete and best-maintained
shadcn install, and PD==SH for most components already. JF diverged the
most and will need the biggest adaptation.

| Component | Source | Notes |
|-----------|--------|-------|
| `button.tsx` | PD (`@base-ui/react/button` + cva) | 44px minimum mobile touch target via `size="lg"` |
| `input.tsx` | PD (`@base-ui/react/input`) | Accessible default |
| `card.tsx` | PD | `data-size` variants, `card-hover-fx` class hook |
| `dialog.tsx` | PD (`@base-ui/react/dialog`) | Has `role`, `aria-modal`, focus trap, `Esc` close |
| `select.tsx` | PD (`@base-ui/react/select`) | Portal, keyboard navigation, search |

## Accessibility guarantees

- All interactive components meet WCAG 2.1 AA contrast (4.5:1 text,
  3:1 UI) against the `@vibe-studio/dashboard-tokens` palette.
- Dialog and Select use `@base-ui/react` primitives which handle focus
  management, keyboard navigation, and ARIA roles automatically.
- Minimum touch target: 44×44 CSS pixels when `size="lg"` or `size="icon-lg"`.
- All icons inside buttons set `aria-hidden`; if a button has only an
  icon, the consumer MUST provide `aria-label`.

## Migration plan (per consumer project)

Recommended order: **PD → JF → SH → KO**.

1. `npm install @vibe-studio/ui` (workspace link).
2. Replace imports:
   - `@/components/ui/button` → `@vibe-studio/ui/button`
   - …same for input, card, dialog, select.
3. Delete per-project `components/ui/{button,input,card,dialog,select}.tsx`.
4. Keep per-project components that are **NOT** in the shared package
   (accordion, calendar, checkbox, etc. — see ADR table).
5. Visual regression: Playwright screenshot diff on at least one page
   per consumer to confirm nothing visually drifted.
6. If a project relied on a divergent variant (e.g. JF had extra button
   sizes), it must either contribute that variant back to the shared
   package OR wrap the shared Button with a project-local variant.

## Peer dependencies

Consumers must already have:

- React 19
- `@base-ui/react` 1.3+ (the new headless primitive library)
- `class-variance-authority` for Button variants
- `lucide-react` for XIcon, ChevronDownIcon, CheckIcon
- A `cn()` helper (`@/lib/utils`) — scaffold assumes the consumer
  provides this via path alias. The real migration will inject it via
  context or export a `cn` from this package.

## Known divergence between current implementations

(From diff analysis, 2026-04-19 review)

| Component | PD vs SH | PD vs JF |
|-----------|----------|----------|
| button | 19-line diff (mostly size table) | Heavy customization (extra variants) |
| card | 20-line diff (minor) | Heavy customization |
| dialog | 27-line diff (close button position, animation timings) | Heavy customization |
| dropdown-menu | **Identical** | Different |
| input | **Identical** | Different |
| select | **Identical** | Different |
| separator | **Identical** | Different |

**Conclusion:** PD/SH can converge trivially. JF will need a port PR
of its custom variants into the shared package (adding new `variant` /
`size` options) before migrating.

## Testing

Not yet extracted. Consumer-side `@playwright/test` + `@axe-core/playwright`
continues to be the authority for visual + a11y regression until
this package has its own test harness (future ticket).

## Versioning

- Adding variant or size: minor.
- Renaming a slot (`data-slot="..."`) or removing a subcomponent: **breaking (major)**.
  Consumers may have selectors keyed on data-slot.
- Changing default visual style without opt-in: **breaking (major)**.
