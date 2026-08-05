# @vibe-studio/tailwind-preset

Shared Tailwind CSS 4 preset for the example.com ecosystem (VS, PD, JF, SH).

## What it provides

| Layer | File | Description |
|-------|------|-------------|
| **CSS animations** | `animations.css` | Shared @keyframes, `animate-in` utility, stagger helpers, `text-balance`/`text-pretty` |
| **JS/TS tokens** | `index.ts` | Spacing, radii, font, color constants for programmatic use |
| **v3 preset** | `index.ts` (`preset`) | Tailwind v3-compatible preset object (for projects not yet on pure CSS config) |

## Quick Start (Tailwind CSS 4 — CSS-first)

In your `globals.css`, add the import **before** your `@theme inline` block:

```css
@import "tailwindcss";
@import "@vibe-studio/tailwind-preset/animations.css";

@theme inline {
  /* your project-specific theme */
}
```

## Usage Examples

### animate-in (CSS-variable-driven entrance)

```html
<!-- Default fade-in (4px travel, 0.2s) -->
<div class="animate-in">Hello</div>

<!-- Custom travel distance -->
<div class="animate-in" style="--animate-in-y: 12px;">More travel</div>

<!-- Slide up with stagger -->
<div class="animate-slide-up stagger-1">Card 1</div>
<div class="animate-slide-up stagger-2">Card 2</div>
<div class="animate-slide-up stagger-3">Card 3</div>

<!-- Scale in (for icons, checkmarks) -->
<div class="animate-scale-in">OK</div>

<!-- Processing state -->
<span class="animate-subtle-pulse">Loading...</span>
```

### CSS Variables

Override per-element or globally:

| Variable | Default | Description |
|----------|---------|-------------|
| `--animate-in-duration` | `0.2s` | Animation duration |
| `--animate-in-easing` | `ease-out` | Timing function |
| `--animate-in-y` | `4px` | Vertical travel distance |
| `--animate-in-delay` | `0s` | Delay before start |

### text-balance / text-pretty

```html
<h1 class="text-balance">Long heading that wraps nicely</h1>
<p class="text-pretty">Paragraph with better line breaks</p>
```

### JS/TS Token Access

```ts
import { spacing, radii, semanticColors, projectAccents } from "@vibe-studio/tailwind-preset";

// spacing["4"] => "1rem"
// radii.lg => "0.75rem"
// semanticColors.success.DEFAULT => "#16a34a"
// projectAccents.vs.DEFAULT => "#6366f1"
```

## Config Comparison Across Projects

### Theme Approach

| Project | Mode | Config Method | Base Pattern |
|---------|------|---------------|-------------|
| **VS** | Dark-only | `@theme inline` + CSS vars | Custom design system (no shadcn) |
| **PD** | Light + Dark + 3 skins | `@theme inline` + shadcn | shadcn/ui + `--radius` multiplier |
| **JF** | Light + Dark + 3 skins | `@theme inline` + shadcn | shadcn/ui (identical structure to PD) |
| **SH** | Light + Dark | `@theme inline` + shadcn | shadcn/ui + serif font + warm palette |

### Color Systems

| Token | VS | PD | JF | SH |
|-------|----|----|----|----|
| Primary | `#6366f1` (indigo) | `#2563eb` (blue) | `#2563eb` (blue) | `#237d54` (emerald) |
| Destructive | `#ef4444` (danger) | `#dc2626` | `#dc2626` | `#dc2626` |
| Success | `#22c55e` | `#059669` (income) | `#059669` (income) | `#16a34a` |
| Warning | `#f59e0b` | `#d97706` | `#d97706` | `#d97706` |
| Background (light) | N/A (dark only) | `#f8fafc` | `#f8fafc` | `#f6f5f0` (warm) |
| Background (dark) | `#09090b` (zinc-950) | `#0a0f1a` | `#0a0f1a` | `#0c100e` |

### Border Radius

| Project | Strategy | Base Value |
|---------|----------|------------|
| **VS** | Fixed tokens: `--radius-sm/md/lg/full` | sm=4px, md=8px, lg=12px |
| **PD** | `--radius` multiplier (shadcn) | `0.625rem` (10px) |
| **JF** | `--radius` multiplier (shadcn) | `0.625rem` (10px) |
| **SH** | `--radius` multiplier (shadcn) | `0.75rem` (12px) |

### Typography

| Project | Sans | Mono | Serif |
|---------|------|------|-------|
| **VS** | Inter | JetBrains Mono | - |
| **PD** | Inter | system monospace | - |
| **JF** | Inter | system monospace | - |
| **SH** | Inter | system monospace | Playfair Display |

### Animations (before unification)

| Animation | VS | PD | JF | SH |
|-----------|----|----|----|----|
| fadeIn (page entrance) | `.heading-display` etc. (CSS) | `.animate-page-in` | `.animate-page-in` | `.page-animate` |
| fadeInUp (cards) | - | `.metric-card` | `.metric-card` | `.stagger-item` |
| scaleIn | - | - | - | Payment checkmark |
| subtlePulse | - | - | - | `.status-processing` |
| expand/collapse | - | - | - | Accordion |

**After preset:** All above replaced by `animate-in`, `animate-slide-up`, `animate-scale-in`, `animate-subtle-pulse`, `animate-expand`/`animate-collapse` from `animations.css`.

### What stays project-specific

- **Color schemes** (light/dark/skins) remain in each project's `globals.css`
- **shadcn/ui tokens** (`--card`, `--popover`, `--sidebar-*`) stay per-project
- **Chart colors** (PD/JF have 50+ chart-specific tokens) stay per-project
- **SH warm palette** and serif typography stay in SH's globals.css
- **VS landing page** styles (agent cards, memory cards) stay in VS

## Architecture

```
shared-tokens/tokens.css     <-- CSS variables (colors, spacing, radii)
                                  Source of truth for token VALUES
                                  Imported in each project's globals.css

tailwind-preset/
  animations.css              <-- Shared @keyframes, animate-in plugin, stagger helpers
                                  Imported in each project's globals.css
  index.ts                    <-- JS/TS token exports + v3 preset object
                                  Used for programmatic access
```

## Reduced Motion

All animations respect `prefers-reduced-motion: reduce`. The preset includes a blanket `animation: none !important` rule for all shared animation classes when reduced motion is preferred.
