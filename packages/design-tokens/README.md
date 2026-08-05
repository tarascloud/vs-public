# @vibe-studio/design-tokens

Umbrella design-tokens package for the entire Vibe Studio ecosystem
(VS, PD, JF, SH, KO, BP, Tatiana).

> **Status:** v0.1.0 — scaffold + canonical sheet. Per-project migration
> tracked in the ADR `docs/adr/shared-design-tokens.md`. No
> project consumes it yet — visual output of every project is unchanged
> until a follow-up ticket migrates its `globals.css`.

## `tokens.css` — the canonical sheet (DES-20260610-0001)

`tokens.css` is the **single-file canon** that unifies the 3 token
architectures found in production:

| Architecture | Projects | What it looked like |
|---|---|---|
| shadcn semantic (`--background`, `--primary`, …) | PD, JF, SH | PD is the value canon (`.claude/rules/css-tokens-sync.md`) |
| Own palette | VS | `#09090b`, `--accent` ≡ primary |
| Raw hex + `--status-*-bg/fg` badges | KO | hex literals in components |

It contains: shadcn semantic colors (light `:root` + `.dark`, values from
the PD canon), the unified `--status-*` scheme, `--radius`, a spacing
scale (`--space-*`) and a type scale (`--text-*`).

### Canonical `--status-*` scheme (decision)

Production had **two incompatible status schemes**:

- **JF:** flat accents `--status-success|error|warning` (re-bound per
  skin, 6 themes) — used for text, icons, dots.
- **KO:** surface pairs `--status-<kind>-bg` / `--status-<kind>-fg`
  (kinds: success, error, info, warning, progress, neutral) — used for
  badges/chips.

**Decision: the canon is the UNION of both**, because they answer
different needs and neither subsumes the other:

```
--status-<kind>      accent  (JF-compatible; text/icon/dot color)
--status-<kind>-bg   surface (KO-compatible; badge background)
--status-<kind>-fg   on-surface text (KO-compatible)
kind ∈ success | error | warning | info | progress | neutral
```

- Accent **values** come from JF light/dark (the only production accent
  implementation); `info/progress/neutral` accents are new, picked from
  the same Tailwind families as KO's fg colors.
- bg/fg **values** come verbatim from KO light/dark (the only production
  surface implementation).
- Top-level aliases `--success`, `--warning`, `--info` exist parallel to
  shadcn's `--destructive`.
- On migration: JF gains the 3 missing kinds + bg/fg pairs; KO gains
  accents; PD/SH/VS/BP gain the whole block.

### Consumption — copy-sync (current mechanism)

Projects are **separate git repos**, so npm workspace linking is not
possible today. Until per-project migration tasks wire up a `file:`/
registry dependency, consumption is **copy-sync**, same model as
`@vibe-studio/security` (`scripts/security-utils-check.sh`):

1. Copy the needed token declarations from `tokens.css` into the
   project's `globals.css` (keep names AND values identical).
2. Drift is detected by the checker (report-only, no auto-fix):

   ```bash
   bash scripts/design-tokens-sync.sh
   ```

3. When changing a canon value: edit `tokens.css` first, then update
   every project that already adopted the token, then re-run the checker.

Known intentional divergence: KO's `--accent` (high-contrast button
background — see `.claude/rules/css-tokens-sync.md` "KO --accent
exception"); the checker skips it.

## Why another tokens package?

We already have:

- **`@vs/shared-tokens`** — foundation tokens (bg/text/border, status,
  spacing, radius, typography scale). Adopted in some surfaces.
- **`@vibe-studio/dashboard-tokens`** — shadcn-flavour tokens used by
  PD/JF dashboards (`--background`, `--card`, `--chart-*`, etc.).

What was missing was **a single ecosystem-wide vocabulary** that:

1. Names primitive values consistently (`--vs-core-*`).
2. Maps them to semantic roles (`--vs-bg`, `--vs-primary`, `--vs-text`).
3. Lets each brand re-bind those roles without forking the foundation.

This package supplies that vocabulary. `@vs/shared-tokens` and
`@vibe-studio/dashboard-tokens` can keep shipping in parallel — they
are layered on top of the same primitives and won't be deleted by
v0.1.

## File layout

```
packages/design-tokens/
├── package.json
├── README.md
├── tokens.css               # CANON single-file sheet (shadcn naming) — drift-checked
├── index.css                # default entry: core + semantic + light + dark (--vs-* tiers)
└── tokens/
    ├── core.css             # primitives (raw colors, spacing px, font stacks)
    ├── semantic.css         # roles (--vs-primary, --vs-bg, --vs-font-body)
    ├── light.css            # light theme bg/text bindings
    ├── dark.css             # dark theme bg/text bindings
    └── brands/
        ├── vs.css           # VS — dark-only, indigo, Inter
        ├── pd.css           # PD — blue, dual-mode, Inter
        ├── jf.css           # JF — blue, dual-mode, Geist
        ├── sh.css           # SH — emerald + warm cream, Geist + Playfair
        ├── ko.css           # KO — monochrome gallery, Inter + Playfair
        ├── bp.css           # BP — terracotta + olive
        └── tatiana.css      # Tatiana — indigo + Playfair display
```

## Token layers

Three explicit layers (Tier 0 → Tier 2):

| Tier | Prefix              | Example                          | Rule                                 |
|------|---------------------|----------------------------------|--------------------------------------|
| 0    | `--vs-core-*`       | `--vs-core-indigo-500`           | Never used directly in components    |
| 1    | `--vs-<role>`       | `--vs-primary`, `--vs-bg`        | Components MUST use these            |
| 2    | brand override      | `[data-brand="ko"]` re-binds `--vs-primary` | Apps load only their brand file |

Components reference Tier 1 only. Brand skins re-bind Tier 1 to
different Tier 0 primitives.

## Usage

```css
/* Vanilla (light + dark, no brand): */
@import "@vibe-studio/design-tokens";

/* PD: */
@import "@vibe-studio/design-tokens";
@import "@vibe-studio/design-tokens/tokens/brands/pd.css";

/* KO: */
@import "@vibe-studio/design-tokens";
@import "@vibe-studio/design-tokens/tokens/brands/ko.css";
```

```html
<!-- Activate the brand: -->
<html data-brand="pd" class="dark">
  <body>
    <!-- consumers: -->
    <div class="card">
      <!-- styles use --vs-card-bg, --vs-primary, --vs-text, --vs-font-body -->
    </div>
  </body>
</html>
```

## Brand alignment matrix (decisions made in this scaffold)

| Brand   | `--vs-primary`             | `--vs-font-body` | `--vs-font-display` | Mode      |
|---------|----------------------------|------------------|---------------------|-----------|
| VS      | indigo-500 (#6366f1)       | Inter            | Inter               | dark only |
| PD      | blue-600 (#2563eb)         | Inter            | Inter               | dual      |
| JF      | blue-600 (#2563eb)         | Geist            | Geist               | dual      |
| SH      | emerald-700 (#237d54)      | Geist            | Playfair            | dual      |
| KO      | black (#000)               | Inter            | Playfair            | dual      |
| BP      | terracotta (#b85c38)       | Inter            | Inter               | dual      |
| Tatiana | indigo-500 (#6366f1)       | Inter            | Playfair            | light     |

**Shared neutrals** (bg/card/text/border) come from foundation; brands
override only when the visual identity demands it (KO, SH, VS).

See ADR `docs/adr/shared-design-tokens.md` for the full
reasoning behind each decision.

## What this package does NOT do

- Does **not** ship Tailwind config (use `@vibe-studio/tailwind-preset`).
- Does **not** ship shadcn `--background` / `--primary` etc. (use
  `@vibe-studio/dashboard-tokens` for that — naming-compatible with shadcn).
- Does **not** ship animations / utilities (those live in
  `@vibe-studio/tailwind-preset`).
- Does **not** force migration. Each project's `globals.css` is
  untouched until an explicit follow-up ticket per project.

## Migration plan (per project)

1. Add `"@vibe-studio/design-tokens": "workspace:*"` to project `package.json`.
2. Insert `@import "@vibe-studio/design-tokens";` and the brand file
   at the top of `globals.css`.
3. Set `<html data-brand="..." />` in the root layout.
4. Gradually migrate component CSS from project-local vars (`--accent`,
   `--background`) to ecosystem vars (`--vs-primary`, `--vs-bg`).
5. Once 100% migrated, delete the duplicated tokens from `globals.css`.

Migration order recommended:

| Step | Project | Why                                              |
|------|---------|--------------------------------------------------|
| 1    | PD      | Largest token surface, canon source              |
| 2    | VS      | Dark-only, simplest brand override               |
| 3    | JF      | Mirrors PD structure                             |
| 4    | SH      | Warm palette is non-trivial, do after dashboards |
| 5    | KO      | Monochrome — must preserve `--accent` exception  |
| 6    | BP      | Earth tones                                      |
| 7    | Tatiana | Smallest                                         |
