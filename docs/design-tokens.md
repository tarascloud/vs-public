# example.com Ecosystem — Shared Design Tokens

> Single source of truth for design decisions across all products.
> Generated 2026-04-15 from actual CSS files.

---

## 1. Shared Foundation

### Font Family

All products use **Inter** as the primary sans-serif font.

```
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
```

Exceptions:
- **SH** adds `--font-serif: Playfair Display` for headings (`.font-serif`, `.page-title`)
- **VS** uses `JetBrains Mono` for mono instead of SF Mono

### Spacing Scale (4px grid)

```
--space-1:  0.25rem   /*  4px */
--space-2:  0.5rem    /*  8px */
--space-3:  0.75rem   /* 12px */
--space-4:  1rem      /* 16px */
--space-5:  1.25rem   /* 20px */
--space-6:  1.5rem    /* 24px */
--space-8:  2rem      /* 32px */
--space-10: 2.5rem    /* 40px */
--space-12: 3rem      /* 48px */
```

Currently explicitly defined in VS. PD/JF/SH use Tailwind defaults (which align to the same 4px grid).

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `calc(var(--radius) * 0.6)` | Chips, badges, small elements |
| `--radius-md` | `calc(var(--radius) * 0.8)` | Buttons, inputs |
| `--radius-lg` | `var(--radius)` | Cards (base) |
| `--radius-xl` | `calc(var(--radius) * 1.4)` | Large cards, modals |
| `--radius-2xl` | `calc(var(--radius) * 1.8)` | Hero sections |
| `--radius-full` | `9999px` | Pills, avatars |

**Per-product `--radius` base value:**

| Product | `--radius` | Effective `--radius-lg` |
|---------|-----------|------------------------|
| PD (default) | `0.625rem` (10px) | 10px |
| PD (aurora) | `0.75rem` (12px) | 12px |
| PD (owner) | `0.375rem` (6px) | 6px |
| JF | `0.625rem` (10px) | 10px |
| SH | `0.75rem` (12px) | 12px |
| VS | `0.75rem` (12px, explicit) | 12px |
| Website | `12px / 16px / 24px` (explicit) | 12-24px |
| Status | `0.375rem` (6px) | 6px |

### Shadows

```css
/* Shared shadow scale */
--shadow-sm:  0 1px 3px rgba(0, 0, 0, 0.08);       /* light */
              0 1px 3px rgba(0, 0, 0, 0.3);          /* dark */
--shadow-md:  0 4px 16px rgba(0, 0, 0, 0.1);        /* light */
              0 4px 16px rgba(0, 0, 0, 0.4);         /* dark */
--shadow-lg:  0 12px 40px rgba(0, 0, 0, 0.12);      /* light */
              0 12px 40px rgba(0, 0, 0, 0.5);        /* dark */
```

### Transitions

```css
--transition-base: 200ms ease;               /* VS, PD, JF */
--transition-slow: 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);  /* Website */
```

Standard duration: **200ms** for interactions (hover, focus), **300-400ms** for entrances (page transitions, modals).

### Focus Ring Pattern

All products use the same focus-visible approach:

```css
/* PD / JF — ring shadow */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 15%, transparent);
}

/* VS — outline */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* SH — custom shadow */
:focus-visible {
  box-shadow: var(--focus-shadow); /* 0 0 0 3px rgba(primary, 0.2) */
  outline: none;
}
```

**Recommended unified pattern:** Use `box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring, var(--primary)) 20%, transparent)` for consistency.

### Reduced Motion

All products respect `prefers-reduced-motion: reduce`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### iOS / Mobile Shared Patterns

```css
/* Prevent iOS zoom on input focus */
@media screen and (max-width: 768px) {
  input, select, textarea { font-size: 16px !important; }
}

/* Touch targets >= 44px */
@media (hover: none) and (pointer: coarse) {
  button, a[role="button"], [role="tab"], [role="menuitem"] {
    min-height: 44px;
    min-width: 44px;
  }
}

/* Safe area for notch devices */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
}
```

---

## 2. Per-Product Accent Colors

### Dark Theme

| Product | Primary / Accent | Accent Hover | Background | Card |
|---------|-----------------|-------------|------------|------|
| **PD** (default) | `#3b82f6` (blue-500) | — | `#0a0f1a` | `rgba(255,255,255,0.04)` |
| **PD** (aurora) | `#8b7cf8` (violet) | — | `#131211` | `#1c1b1a` |
| **PD** (owner) | `#ffd600` (gold) | — | `#26282b` | `#2b2d30` |
| **PD** (neon) | `#00e5ff` (cyan) | `#ff0080` (magenta) | `#0a0a0f` | `#12121a` |
| **JF** | `#3b82f6` (blue-500) | — | `#0a0f1a` | `rgba(255,255,255,0.04)` |
| **SH** | `#3ec98a` (emerald) | `#c49a42` (gold accent) | `#0c100e` | `#151b17` |
| **VS** | `#6366f1` (indigo-500) | `#818cf8` (indigo-400) | `#09090b` (zinc-950) | `#18181b` (zinc-900) |
| **Website** | `#FFC700` (gold) | `#FFD600` | `#26282B` | `#2b2d30` |
| **Status** | `#FFC700` (gold) | `#FFA800` | `#26282B` | `#2B2D30` |

### Light Theme

| Product | Primary / Accent | Background | Card |
|---------|-----------------|------------|------|
| **PD** (default) | `#2563eb` (blue-600) | `#f8fafc` | `#ffffff` |
| **PD** (aurora) | `#6d5af0` (violet) | `#faf9f7` | `#ffffff` |
| **JF** | `#2563eb` (blue-600) | `#f8fafc` | `#ffffff` |
| **SH** | `#237d54` (emerald-700) | `#f6f5f0` (warm) | `#fdfcfa` |
| **VS** | `#4f46e5` (indigo-600) | `#ffffff` | `#fafafa` |
| **Website** | `#B8860B` (dark gold) | `#f5f5f7` | `#fafafa` |
| **Status** | `#D4A017` (gold) | `#ffffff` | `#fafafa` |

### Brand Color Families

| Family | Products | Dark Accent | Light Accent | Usage |
|--------|----------|------------|-------------|-------|
| **Gold** | Website, Status, PD "owner" skin | `#FFC700` | `#B8860B` | Personal brand, monitoring |
| **Blue** | PD default, JF | `#3b82f6` | `#2563eb` | Dashboard, productivity tools |
| **Indigo/Violet** | VS, PD "aurora" skin | `#6366f1` | `#4f46e5` | Dev tools, creative |
| **Emerald/Gold** | SH | `#3ec98a` / `#c49a42` | `#237d54` / `#d4a853` | Coaching platform |
| **Cyan/Magenta** | PD "neon" skin | `#00e5ff` / `#ff0080` | — (dark-only) | Cyberpunk variant |

---

## 3. Semantic Colors

### Status / Feedback Colors

| Semantic | Dark | Light | Usage |
|----------|------|-------|-------|
| **Success** | `#22c55e` / `#34d399` | `#16a34a` / `#059669` | Positive actions, income, healthy |
| **Warning** | `#f59e0b` / `#fbbf24` | `#d97706` | Caution, degraded |
| **Danger** | `#ef4444` / `#f87171` | `#dc2626` | Errors, expenses, destructive |
| **Info** | `#60a5fa` | `#2563eb` | Informational, links |

### Chart Palette (PD/JF shared)

```
Dark:  #60a5fa  #34d399  #fbbf24  #a78bfa  #f87171
Light: #2563eb  #059669  #d97706  #7c3aed  #dc2626
```

### SH Chart Palette (emerald/gold)

```
Dark:  #3ec98a  #c49a42  #6edcac  #e8c87a  #8a9a90
Light: #237d54  #d4a853  #4ecca3  #f0d89a  #6b6155
```

### VS Semantic Colors

```css
--success: #22c55e;       --success-subtle: #22c55e1a;
--warning: #f59e0b;       --warning-subtle: #f59e0b1a;
--danger:  #ef4444;       --danger-subtle:  #ef44441a;
```

### Status Page Colors

```css
--green:  #22c55e;   /* up / ok */
--red:    #ef4444;   /* down / critical */
--yellow: #eab308;   /* degraded / warning */
--blue:   #3b82f6;   /* info */
```

---

## 4. Theme Pattern (Unified)

### For Next.js apps (PD, JF, SH, VS app)

**Tooling:** `next-themes` + Tailwind CSS 4 `@custom-variant dark`

```tsx
// layout.tsx
import { ThemeProvider } from "next-themes";

<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

```css
/* globals.css */
@custom-variant dark (&:is(.dark *));

:root {
  /* light theme variables */
}
.dark {
  /* dark theme variables */
}
```

**PD also supports skins** via `data-skin` attribute:
```css
[data-skin="aurora"]      { /* aurora light */ }
.dark[data-skin="aurora"] { /* aurora dark */ }
[data-skin="owner"]       { /* always dark — color-scheme: dark */ }
[data-skin="neon"]        { /* always dark — color-scheme: dark */ }
```

### For static HTML (Website, Status)

**Pattern:** `prefers-color-scheme` media query + `data-theme` attribute for manual toggle.

```css
:root {
  /* dark theme (default) */
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    /* light overrides */
  }
}

:root[data-theme="light"] {
  /* explicit light */
}

:root[data-theme="dark"] {
  /* explicit dark */
}
```

```js
// Toggle script
const toggle = document.querySelector('.theme-toggle');
toggle.addEventListener('click', () => {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : (current === 'light' ? '' : 'dark');
  if (next) {
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  } else {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem('theme');
  }
});

// Restore on load
const saved = localStorage.getItem('theme');
if (saved) document.documentElement.dataset.theme = saved;
```

---

## 5. PWA Checklist

### manifest.json Template

```json
{
  "name": "Product Name",
  "short_name": "Product",
  "description": "...",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Per-product theme_color / background_color:**

| Product | theme_color | background_color |
|---------|------------|-----------------|
| PD | `#2563eb` | `#0a0f1a` |
| JF | `#2563eb` | `#0a0f1a` |
| SH | `#237d54` | `#0c100e` |
| VS | `#6366f1` | `#09090b` |
| Website | `#FFC700` | `#26282B` |
| Status | `#FFC700` | `#26282B` |

### Icons Needed

- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png` (180x180)
- `icon-192x192.png`
- `icon-512x512.png`
- `icon-512x512-maskable.png` (safe zone: inner 80%)

### Service Worker

PD and JF use **Serwist 9.5** (next-pwa successor). SH and VS currently do not have SW. Website/Status are static, no SW needed.

---

## 6. CSS Variables Template

### Shared Base (copy into any new product)

```css
/* ============================================================
   example.com Design Tokens — Base Template
   Copy this block and override per-product accent colors.
   ============================================================ */

@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter);
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
}

/* ── Light theme ── */
:root {
  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;
  --primary: #2563eb;            /* <-- CHANGE per product */
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --accent: #f1f5f9;
  --accent-foreground: #0f172a;
  --destructive: #dc2626;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #2563eb;               /* <-- CHANGE per product */
  --radius: 0.625rem;            /* <-- CHANGE per product */
}

/* ── Dark theme ── */
.dark {
  --background: #0a0f1a;
  --foreground: #f1f5f9;
  --card: rgba(255, 255, 255, 0.04);
  --card-foreground: #f1f5f9;
  --popover: #1e293b;
  --popover-foreground: #f1f5f9;
  --primary: #3b82f6;            /* <-- CHANGE per product */
  --primary-foreground: #ffffff;
  --secondary: rgba(255, 255, 255, 0.04);
  --secondary-foreground: #f1f5f9;
  --muted: rgba(255, 255, 255, 0.04);
  --muted-foreground: #a1b0c4;
  --accent: rgba(255, 255, 255, 0.04);
  --accent-foreground: #f1f5f9;
  --destructive: #f87171;
  --border: rgba(255, 255, 255, 0.09);
  --input: rgba(255, 255, 255, 0.08);
  --ring: #3b82f6;               /* <-- CHANGE per product */
}
```

### Per-Product Overrides (only the values that differ)

#### VS — Indigo/Violet

```css
:root {
  --primary: #4f46e5;  --ring: #4f46e5;
  --background: #ffffff;
  --card: #fafafa;
}
.dark {
  --primary: #6366f1;  --ring: #6366f1;
  --background: #09090b;
  --card: #18181b;
}
```

#### SH — Emerald/Gold

```css
:root {
  --primary: #237d54;  --ring: #237d54;
  --accent: #d4a853;   --accent-foreground: #1a1a14;
  --background: #f6f5f0;
  --card: #fdfcfa;
  --radius: 0.75rem;
}
.dark {
  --primary: #3ec98a;  --ring: #3ec98a;
  --accent: #c49a42;   --accent-foreground: #e8ece9;
  --background: #0c100e;
  --card: #151b17;
}
```

#### Website / Status — Gold

```css
:root {
  --accent: #FFC700;
  --background: #26282B;
  --card: #2b2d30;
  --border: rgba(255,255,255,0.07);
  --radius: 0.375rem;
  color-scheme: dark;   /* dark-first */
}
```

---

## 7. Cross-Product Consistency Notes

### Scrollbar

All products use thin custom scrollbars (5-6px), theme-aware:

```css
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--background); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
```

### Selection Color

```css
::selection {
  background-color: color-mix(in srgb, var(--ring, var(--accent)) 25%, transparent);
  color: inherit;
}
```

### Card Hover Pattern

```css
.card-hover {
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--card-hover-shadow);
  border-color: var(--card-hover-border);
}
```

Used in PD, JF (metric-card), VS (agent-card), SH (card-hover), Website (cards), Status (unchanged).

### Page Enter Animation

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-page-in { animation: fadeIn 0.2s ease-out; }
```

---

## 8. Divergences to Resolve

| Issue | Products | Recommendation |
|-------|----------|---------------|
| Variable naming | VS uses `--accent`, PD/JF use `--primary` | Standardize on shadcn pattern (`--primary`, `--accent`) |
| Dark bg | PD `#0a0f1a`, VS `#09090b`, SH `#0c100e` | OK, intentionally different per brand |
| Card bg approach | PD/JF use `rgba(255,255,255,0.04)`, VS uses solid `#18181b`, SH uses solid `#151b17` | Both valid; rgba allows background bleed |
| Focus ring | PD/JF use shadow, VS uses outline | Recommend shadow for consistency with shadcn |
| Mono font | VS uses JetBrains Mono, others use SF Mono | Keep as-is (VS is dev-focused) |
| Status/Website tokens | Completely different naming (`--bg`, `--text`, `--green`) | Expected for static HTML; no action needed |

---

## Source Files

| Product | File |
|---------|------|
| PD | `pd-private/next/src/app/globals.css` |
| JF | `jf-private/src/app/globals.css` |
| SH | `sh-private/src/app/globals.css` |
| VS | `app/src/app/globals.css` |
| Website | `services/owner/index.html` (inline `<style>`) |
| Status | `services/status/static/style.css` |
