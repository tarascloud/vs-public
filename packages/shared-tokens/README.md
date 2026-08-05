# Shared Design Tokens

Unified design token system for all Vibe Studio ecosystem projects: **VS**, **PD**, **JF**, **SH**.

## Installation

Import at the top of your project's `globals.css`:

```css
@import "@vs/shared-tokens/tokens.css";
```

Or copy `tokens.css` directly into your project and import locally.

## Foundation Tokens

### Background Layers

| Token            | Light          | Dark              | Purpose                         |
|------------------|----------------|-------------------|---------------------------------|
| `--bg-base`      | `#f8fafc`      | `#0a0f1a`         | Main page background            |
| `--bg-subtle`    | `#f1f5f9`      | `#111827`         | Secondary/muted areas           |
| `--bg-surface`   | `#ffffff`      | `#1e293b`         | Cards, popovers, modals         |

### Text Hierarchy

| Token             | Light          | Dark              | Purpose                         |
|-------------------|----------------|-------------------|---------------------------------|
| `--text-primary`  | `#0f172a`      | `#f1f5f9`         | Headings, primary content       |
| `--text-secondary`| `#334155`      | `#cbd5e1`         | Body text, descriptions         |
| `--text-muted`    | `#5f6f84`      | `#94a3b8`         | Captions, placeholders          |

### Borders

| Token             | Light          | Dark                        | Purpose                  |
|-------------------|----------------|-----------------------------|--------------------------|
| `--border-default` | `#e2e8f0`     | `rgba(255,255,255,0.09)`    | Card borders, dividers   |
| `--border-subtle`  | `#f1f5f9`     | `rgba(255,255,255,0.05)`    | Subtle separators        |

### Semantic Status Colors

| Token                   | Light          | Dark           | Purpose              |
|-------------------------|----------------|----------------|----------------------|
| `--color-success`       | `#16a34a`      | `#4ade80`      | Positive, confirmed  |
| `--color-success-subtle`| 10% opacity    | 10% opacity    | Success backgrounds  |
| `--color-warning`       | `#d97706`      | `#fbbf24`      | Caution, pending     |
| `--color-warning-subtle`| 10% opacity    | 10% opacity    | Warning backgrounds  |
| `--color-error`         | `#dc2626`      | `#f87171`      | Danger, destructive  |
| `--color-error-subtle`  | 10% opacity    | 10% opacity    | Error backgrounds    |
| `--color-info`          | `#2563eb`      | `#60a5fa`      | Informational, links |
| `--color-info-subtle`   | 10% opacity    | 10% opacity    | Info backgrounds     |

### Spacing Scale (4px grid) — REV-20260419-0013

| Token        | Value     | Pixels |
|--------------|-----------|--------|
| `--space-0`  | `0`       | 0px    |
| `--space-1`  | `0.25rem` | 4px    |
| `--space-2`  | `0.5rem`  | 8px    |
| `--space-3`  | `0.75rem` | 12px   |
| `--space-4`  | `1rem`    | 16px   |
| `--space-5`  | `1.25rem` | 20px   |
| `--space-6`  | `1.5rem`  | 24px   |
| `--space-8`  | `2rem`    | 32px   |
| `--space-10` | `2.5rem`  | 40px   |
| `--space-12` | `3rem`    | 48px   |
| `--space-16` | `4rem`    | 64px   |

### Border Radius Scale — REV-20260419-0019

| Token          | Value     | Pixels | Use case               |
|----------------|-----------|--------|------------------------|
| `--radius-xs`  | `0.25rem` | 4px    | Extra-small elements   |
| `--radius-sm`  | `0.375rem`| 6px    | Chips, tags            |
| `--radius-md`  | `0.5rem`  | 8px    | Buttons, inputs        |
| `--radius-lg`  | `0.75rem` | 12px   | Cards, dialogs         |
| `--radius-xl`  | `1rem`    | 16px   | Large containers       |
| `--radius-2xl` | `1.5rem`  | 24px   | Hero cards, modals     |
| `--radius-full`| `9999px`  | pill   | Avatars, pill buttons  |

### Typography Scale — REV-20260419-0022 (modular 1.25)

| Token         | Value     | Pixels |
|---------------|-----------|--------|
| `--font-xs`   | `0.75rem` | 12px   |
| `--font-sm`   | `0.875rem`| 14px   |
| `--font-base` | `1rem`    | 16px   |
| `--font-lg`   | `1.125rem`| 18px   |
| `--font-xl`   | `1.25rem` | 20px   |
| `--font-2xl`  | `1.5rem`  | 24px   |
| `--font-3xl`  | `1.875rem`| 30px   |
| `--font-4xl`  | `2.25rem` | 36px   |
| `--font-5xl`  | `3rem`    | 48px   |
| `--font-6xl`  | `3.75rem` | 60px   |

Line heights: `--lh-tight` (1.2), `--lh-snug` (1.35), `--lh-normal` (1.55), `--lh-relaxed` (1.7).

### Font Families — REV-20260419-0023

| Token          | Stack                                                  |
|----------------|--------------------------------------------------------|
| `--font-sans`  | `ui-sans-serif, system-ui, "Inter", sans-serif`        |
| `--font-serif` | `ui-serif, Georgia, "Playfair Display", serif`         |
| `--font-mono`  | `ui-monospace, "JetBrains Mono", monospace`            |

### Shadows — REV-20260419-0027

| Token           | Use case                        |
|-----------------|---------------------------------|
| `--shadow-xs`   | Subtle lift (inputs, chips)     |
| `--shadow-sm`   | Cards at rest                   |
| `--shadow-md`   | Hover state cards, dropdowns    |
| `--shadow-lg`   | Popovers, larger dropdowns      |
| `--shadow-xl`   | Modals, dialogs                 |
| `--shadow-focus`| Focus ring (indigo 50% alpha)   |

### Transitions & Z-Index

| Token                | Value          |
|----------------------|----------------|
| `--transition-fast`  | `150ms ease`   |
| `--transition-base`  | `250ms ease`   |
| `--transition-slow`  | `400ms ease`   |
| `--z-base`           | `0`            |
| `--z-dropdown`       | `10`           |
| `--z-sticky`         | `20`           |
| `--z-modal`          | `50`           |
| `--z-toast`          | `100`          |

### Neutral Token Usage Example

```css
.hero-card {
  font-family: var(--font-sans);
  font-size: var(--font-2xl);
  line-height: var(--lh-snug);
  padding: var(--space-8) var(--space-6);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-md);
  transition: box-shadow var(--transition-base);
}
.hero-card:hover {
  box-shadow: var(--shadow-lg);
}
.hero-card:focus-visible {
  box-shadow: var(--shadow-focus);
}
```

## Per-Project Accent Colors

| Token              | Light      | Dark       | Project             |
|--------------------|------------|------------|---------------------|
| `--accent-vs`      | `#6366f1`  | `#818cf8`  | Vibe Studio (indigo)|
| `--accent-vs-hover`| `#818cf8`  | `#a5b4fc`  | VS hover state      |
| `--accent-pd`      | `#2563eb`  | `#3b82f6`  | Personal Dashboard  |
| `--accent-pd-hover`| `#3b82f6`  | `#60a5fa`  | PD hover state      |
| `--accent-jf`      | `#2563eb`  | `#3b82f6`  | JobFinder           |
| `--accent-jf-hover`| `#3b82f6`  | `#60a5fa`  | JF hover state      |
| `--accent-sh`      | `#237d54`  | `#3ec98a`  | Shuleansky          |
| `--accent-sh-hover`| `#16a34a`  | `#4ade80`  | SH hover state      |

## Project-Specific Overrides

The tokens file also ships overrides for projects whose palette diverges from the default slate scale:

- **`[data-project="vs"]` / `.theme-vs`** -- VS uses a permanent dark zinc palette
- **`[data-project="sh"]` / `.theme-sh`** -- SH uses warm ivory/linen tones in light mode and dark emerald in dark mode

## WCAG AA Contrast Ratios

All text/background combinations meet or exceed WCAG AA (4.5:1 for normal text).

### Light Mode (default slate palette)

| Combination                      | Foreground | Background | Ratio  | Pass |
|----------------------------------|------------|------------|--------|------|
| text-primary on bg-base          | `#0f172a`  | `#f8fafc`  | 17.1:1 | AA   |
| text-primary on bg-subtle        | `#0f172a`  | `#f1f5f9`  | 16.3:1 | AA   |
| text-primary on bg-surface       | `#0f172a`  | `#ffffff`  | 17.9:1 | AA   |
| text-secondary on bg-base        | `#334155`  | `#f8fafc`  |  9.9:1 | AA   |
| text-secondary on bg-subtle      | `#334155`  | `#f1f5f9`  |  9.5:1 | AA   |
| text-secondary on bg-surface     | `#334155`  | `#ffffff`  | 10.4:1 | AA   |
| text-muted on bg-base            | `#5f6f84`  | `#f8fafc`  |  4.9:1 | AA   |
| text-muted on bg-subtle          | `#5f6f84`  | `#f1f5f9`  |  4.7:1 | AA   |
| text-muted on bg-surface         | `#5f6f84`  | `#ffffff`  |  5.1:1 | AA   |

### Dark Mode (default palette)

| Combination                      | Foreground | Background | Ratio  | Pass |
|----------------------------------|------------|------------|--------|------|
| text-primary on bg-base          | `#f1f5f9`  | `#0a0f1a`  | 17.5:1 | AA   |
| text-primary on bg-subtle        | `#f1f5f9`  | `#111827`  | 16.2:1 | AA   |
| text-primary on bg-surface       | `#f1f5f9`  | `#1e293b`  | 13.4:1 | AA   |
| text-secondary on bg-base        | `#cbd5e1`  | `#0a0f1a`  | 12.9:1 | AA   |
| text-secondary on bg-subtle      | `#cbd5e1`  | `#111827`  | 11.9:1 | AA   |
| text-secondary on bg-surface     | `#cbd5e1`  | `#1e293b`  |  9.9:1 | AA   |
| text-muted on bg-base            | `#94a3b8`  | `#0a0f1a`  |  7.5:1 | AA   |
| text-muted on bg-subtle          | `#94a3b8`  | `#111827`  |  6.9:1 | AA   |
| text-muted on bg-surface         | `#94a3b8`  | `#1e293b`  |  5.7:1 | AA   |

### VS Dark-Only

| Combination                      | Foreground | Background | Ratio  | Pass |
|----------------------------------|------------|------------|--------|------|
| text-primary on bg-base          | `#fafafa`  | `#09090b`  | 19.1:1 | AA   |
| text-secondary on bg-base        | `#e4e4e7`  | `#09090b`  | 15.7:1 | AA   |
| text-muted on bg-base            | `#a1a1aa`  | `#09090b`  |  7.8:1 | AA   |
| text-primary on bg-surface       | `#fafafa`  | `#18181b`  | 17.0:1 | AA   |
| text-secondary on bg-surface     | `#e4e4e7`  | `#18181b`  | 14.0:1 | AA   |
| text-muted on bg-surface         | `#a1a1aa`  | `#18181b`  |  6.9:1 | AA   |

### SH Light

| Combination                      | Foreground | Background | Ratio  | Pass |
|----------------------------------|------------|------------|--------|------|
| text-primary on bg-base          | `#1a1a14`  | `#f6f5f0`  | 16.0:1 | AA   |
| text-secondary on bg-base        | `#3d3d30`  | `#f6f5f0`  | 10.1:1 | AA   |
| text-muted on bg-base            | `#6b6155`  | `#f6f5f0`  |  5.6:1 | AA   |
| text-primary on bg-surface       | `#1a1a14`  | `#fdfcfa`  | 17.0:1 | AA   |
| text-muted on bg-surface         | `#6b6155`  | `#fdfcfa`  |  5.9:1 | AA   |

### SH Dark

| Combination                      | Foreground | Background | Ratio  | Pass |
|----------------------------------|------------|------------|--------|------|
| text-primary on bg-base          | `#e8ece9`  | `#0c100e`  | 16.1:1 | AA   |
| text-secondary on bg-base        | `#b8c8be`  | `#0c100e`  | 11.0:1 | AA   |
| text-muted on bg-base            | `#8a9a90`  | `#0c100e`  |  6.5:1 | AA   |
| text-primary on bg-surface       | `#e8ece9`  | `#151b17`  | 14.7:1 | AA   |
| text-muted on bg-surface         | `#8a9a90`  | `#151b17`  |  5.9:1 | AA   |

## Usage Examples

### Using foundation tokens in Tailwind CSS

```css
/* In your component or globals.css */
.my-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  color: var(--text-primary);
}

.my-card p {
  color: var(--text-secondary);
}

.my-card .timestamp {
  color: var(--text-muted);
  font-size: 0.875rem;
}
```

### Using project accent

```css
/* In vs-private globals.css */
.btn-primary {
  background: var(--accent-vs);
  color: white;
}
.btn-primary:hover {
  background: var(--accent-vs-hover);
}

/* In pd-private globals.css */
.btn-primary {
  background: var(--accent-pd);
  color: white;
}
```

### Using semantic colors

```css
.alert-success {
  background: var(--color-success-subtle);
  color: var(--color-success);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.alert-error {
  background: var(--color-error-subtle);
  color: var(--color-error);
}
```

### Using spacing

```css
.section {
  padding: var(--space-8) var(--space-4);   /* 32px top/bottom, 16px left/right */
  gap: var(--space-6);                       /* 24px between children */
}

.compact-list > * + * {
  margin-top: var(--space-2);               /* 8px between items */
}
```

## Migration Guide

These tokens are additive -- they do not replace existing project CSS variables.
Each project can adopt them incrementally:

1. Import `tokens.css` at the top of `globals.css`
2. Start using `--bg-base`, `--text-primary`, etc. in new components
3. Gradually replace hardcoded colors with shared tokens
4. Keep project-specific tokens (charts, skins, sidebar) as-is

## Architecture

```
packages/shared-tokens/
  tokens.css    -- all CSS custom properties
  README.md     -- this file
```

Tokens are organized in 3 layers:
1. **Foundation** (shared) -- backgrounds, text, borders, semantic, spacing, radius
2. **Project accents** -- per-project brand colors
3. **Project overrides** -- VS dark-only, SH warm palette
