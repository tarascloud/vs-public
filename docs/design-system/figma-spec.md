# Figma Design System Specification

**Version:** 1.0.0
**Date:** 2026-04-17
**Projects:** VS, PD, JF, SH, Website
**Source of truth:** `packages/shared-tokens/tokens.css`, `docs/brand-guidelines.md`

---

## Page 1: Foundations

### 1.1 Color Styles

#### Shared Semantic Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `success` | `#16a34a` (green-600) | `#4ade80` (green-400) | Positive, confirmed, income |
| `success-subtle` | `rgba(22,163,74,0.1)` | `rgba(74,222,128,0.1)` | Success background tint |
| `warning` | `#d97706` (amber-600) | `#fbbf24` (amber-400) | Caution, pending |
| `warning-subtle` | `rgba(217,119,6,0.1)` | `rgba(251,191,36,0.1)` | Warning background tint |
| `error` | `#dc2626` (red-600) | `#f87171` (red-400) | Danger, destructive, expense |
| `error-subtle` | `rgba(220,38,38,0.1)` | `rgba(248,113,113,0.1)` | Error background tint |
| `info` | `#2563eb` (blue-600) | `#60a5fa` (blue-400) | Informational, links |
| `info-subtle` | `rgba(37,99,235,0.1)` | `rgba(96,165,250,0.1)` | Info background tint |

#### Shared Background & Surface Tokens

| Token | Light | Dark |
|-------|-------|------|
| `bg-base` | `#f8fafc` (slate-50) | `#0a0f1a` |
| `bg-subtle` | `#f1f5f9` (slate-100) | `#111827` (gray-900) |
| `bg-surface` | `#ffffff` | `#1e293b` (slate-800) |

#### Shared Text Tokens

| Token | Light | Dark |
|-------|-------|------|
| `text-primary` | `#0f172a` (slate-900) | `#f1f5f9` (slate-100) |
| `text-secondary` | `#334155` (slate-700) | `#cbd5e1` (slate-300) |
| `text-muted` | `#5f6f84` | `#94a3b8` (slate-400) |

#### Shared Border Tokens

| Token | Light | Dark |
|-------|-------|------|
| `border-default` | `#e2e8f0` (slate-200) | `rgba(255,255,255,0.09)` |
| `border-subtle` | `#f1f5f9` (slate-100) | `rgba(255,255,255,0.05)` |

#### Per-Project Accent Colors

| Project | Light Accent | Light Hover | Dark Accent | Dark Hover | Brand Gradient |
|---------|-------------|-------------|-------------|------------|----------------|
| **VS** | `#6366f1` (indigo-500) | `#818cf8` (indigo-400) | `#818cf8` (indigo-400) | `#a5b4fc` (indigo-300) | `linear-gradient(135deg, #6366f1, #8b5cf6)` |
| **PD** | `#2563eb` (blue-600) | `#3b82f6` (blue-500) | `#3b82f6` (blue-500) | `#60a5fa` (blue-400) | -- |
| **JF** | `#2563eb` (blue-600) | `#3b82f6` (blue-500) | `#3b82f6` (blue-500) | `#60a5fa` (blue-400) | -- |
| **SH** | `#237d54` (emerald) | `#16a34a` (green-600) | `#3ec98a` | `#4ade80` (green-400) | `linear-gradient(135deg, #237d54, #d4a853)` |
| **Website** | `#B8860B` (dark gold) | -- | `#FFC700` (gold) | `#FFA800` | `linear-gradient(135deg, #FFC700, #FFA800)` |

#### VS Dark-Only Override

VS uses a permanent dark theme. No light mode.

| Token | Value |
|-------|-------|
| `bg-base` | `#09090b` (zinc-950) |
| `bg-subtle` | `#111113` |
| `bg-surface` | `#18181b` (zinc-900) |
| `text-primary` | `#fafafa` (zinc-50) |
| `text-secondary` | `#e4e4e7` (zinc-200) |
| `text-muted` | `#a1a1aa` (zinc-400) |
| `border-default` | `#27272a` (zinc-800) |
| `border-subtle` | `#1f1f23` |

#### SH Warm Light Override

| Token | Light | Dark |
|-------|-------|------|
| `bg-base` | `#f6f5f0` | `#0c100e` |
| `bg-subtle` | `#edeae2` | `#1a201c` |
| `bg-surface` | `#fdfcfa` | `#151b17` |
| `text-primary` | `#1a1a14` | `#e8ece9` |
| `text-secondary` | `#3d3d30` | `#b8c8be` |
| `text-muted` | `#6b6155` | `#8a9a90` |
| `border-default` | `#ddd7cc` | `rgba(255,255,255,0.09)` |

#### PD/JF Skins

| Skin | Primary | Background | Character |
|------|---------|------------|-----------|
| Default Light | `#2563eb` | `#f8fafc` | Clean, professional |
| Default Dark | `#3b82f6` | `#0a0f1a` | Deep blue night |
| Aurora Light | `#6d5af0` | `#faf9f7` | Warm violet, organic |
| Aurora Dark | `#8b7cf8` | `#131211` | Cozy, warm |
| Owner | `#ffd600` | `#26282b` | Dark gold, anthracite |
| Neon | `#00e5ff` | `#0a0a0f` | Cyberpunk, electric |

**Figma setup:** Create a Figma color style for each token. Group them:
- `Semantic / success`, `Semantic / warning`, `Semantic / error`, `Semantic / info`
- `Surface / bg-base`, `Surface / bg-subtle`, `Surface / bg-surface`
- `Text / primary`, `Text / secondary`, `Text / muted`
- `Border / default`, `Border / subtle`
- `Brand / VS`, `Brand / PD`, `Brand / JF`, `Brand / SH`, `Brand / Website`
- `Skin / Aurora`, `Skin / Owner`, `Skin / Neon`

Use light/dark mode variants within each style via Figma Variables.

---

### 1.2 Typography Styles

#### Font Families

| Font | Role | Projects | CSS Variable |
|------|------|----------|-------------|
| **Inter** | Primary sans-serif | VS, PD, JF, Website | `--font-sans` |
| **Playfair Display** | Serif headings | SH | `--font-serif` |
| **JetBrains Mono** | Code, monospace | VS | `--font-mono` |
| **System monospace** | Fallback mono | PD, JF, SH | `--font-mono` |

#### Type Scale

| Style Name | Size | Weight | Line-height | Letter-spacing | Usage |
|------------|------|--------|-------------|----------------|-------|
| `Display` | 72px (4.5rem) | 800 | 1.25 | -0.025em | Hero landing |
| `Heading 1` | 48px (3rem) | 700 | 1.25 | -0.025em | Page titles |
| `Heading 2` | 36px (2.25rem) | 700 | 1.375 | -0.025em | Section titles |
| `Heading 3` | 24px (1.5rem) | 600 | 1.375 | normal | Card titles |
| `Body Large` | 18px (1.125rem) | 400 | 1.625 | normal | Lead text |
| `Body Base` | 16px (1rem) | 400 | 1.5 | normal | Body text |
| `Body Small` | 14px (0.875rem) | 400 | 1.5 | normal | Secondary text |
| `Label` | 14px (0.875rem) | 500 | 1.5 | +0.025em | Labels, captions |
| `Code` | 14px (0.875rem) | 400 (mono) | 1.5 | normal | Code snippets |

#### SH-specific Styles

| Style Name | Font | Size | Weight |
|------------|------|------|--------|
| `SH / Page Title` | Playfair Display | 1.5rem (md: 1.875rem) | 600 |
| `SH / Section Title` | Inter | 1.125rem | 600 |
| `SH / Card Title` | Inter | 1rem | 500 |
| `SH / Subtitle` | Inter | 0.875rem | 400 |

**Figma setup:** Create text styles grouped as `Heading / Display`, `Heading / H1`, `Body / Large`, etc. SH styles prefixed with `SH /`.

---

### 1.3 Spacing Scale

Base unit: **4px**. All spacing is a multiple of 4.

| Token | px | rem | Tailwind | Usage |
|-------|----|-----|----------|-------|
| `space-1` | 4 | 0.25 | `p-1`, `gap-1` | Tight internal spacing |
| `space-2` | 8 | 0.5 | `p-2`, `gap-2` | Default internal spacing |
| `space-3` | 12 | 0.75 | `p-3`, `gap-3` | Compact component padding |
| `space-4` | 16 | 1 | `p-4`, `gap-4` | Standard padding |
| `space-5` | 20 | 1.25 | `p-5`, `gap-5` | Enhanced padding |
| `space-6` | 24 | 1.5 | `p-6`, `gap-6` | Card padding |
| `space-8` | 32 | 2 | `p-8`, `gap-8` | Section inner spacing |
| `space-12` | 48 | 3 | `py-12` | Section vertical padding |
| `space-16` | 64 | 4 | `py-16` | Large section vertical padding |
| `space-20` | 80 | 5 | `py-20` | Hero section vertical padding |

**Figma setup:** Create spacing variables in a collection `Spacing`. Use Auto Layout with these values exclusively.

---

### 1.4 Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Badges, chips, tags, code inline |
| `radius-md` | 8px | Buttons, inputs, tags |
| `radius-lg` | 12px | Cards, panels, dialogs |
| `radius-xl` | 16px | Large containers, modals |
| `radius-full` | 9999px | Pills, avatars, pill buttons |

**Figma setup:** Create radius variables in collection `Radius`. Apply to corners via component properties.

---

### 1.5 Shadow / Elevation Scale

| Level | CSS Value | Usage |
|-------|-----------|-------|
| `None` | -- | Default flat cards (VS) |
| `Accent` | `0 0 0 1px var(--accent-border), 0 4px 20px -2px var(--accent-subtle)` | VS card hover |
| `Small` | `0 1px 3px rgba(0,0,0,0.08)` | SH card-elevated (light) |
| `Medium` | `0 4px 16px rgba(0,0,0,0.1)` | Website cards |
| `Large` | `0 12px 40px rgba(0,0,0,0.12)` | Hero elements |
| `Card Hover (light)` | `0 8px 24px rgba(0,0,0,0.08)` | PD/JF metric cards on hover |
| `Card Hover (dark)` | `0 8px 24px rgba(0,0,0,0.3)` | PD/JF metric cards on hover (dark) |

**Elevation model by project:**
- **VS:** Border-based elevation (border color change on hover, no shadows)
- **PD/JF:** Shadow-based elevation (hover = translateY(-2px) + shadow)
- **SH:** Hybrid (subtle shadows + border changes)

**Figma setup:** Create Effect Styles: `Elevation / None`, `Elevation / Small`, `Elevation / Medium`, `Elevation / Large`, `Elevation / Card Hover`.

---

## Page 2: Components

### Component Baseline

All shared components follow the **PD shadcn v4 pattern** (@base-ui + CVA). This is the recommended baseline for Figma components as well.

### 2.1 Button

**Variants:**

| Variant | Background | Border | Text |
|---------|-----------|--------|------|
| `default` (primary) | `var(--primary)` / `var(--accent)` | none | white |
| `secondary` | transparent | `var(--border)` | `var(--foreground)` |
| `outline` | transparent | `var(--border)` | `var(--foreground)` |
| `ghost` | transparent | none | `var(--foreground)` |
| `destructive` | `var(--error)` | none | white |
| `link` | transparent | none | `var(--primary)` (underlined) |

**Sizes:**

| Size | Height | Padding H | Font Size | Icon Size |
|------|--------|-----------|-----------|-----------|
| `xs` | 24px (h-6) | 8px | 12px | 14px |
| `sm` | 32px (h-8) | 12px | 13px | 14px |
| `md` (default) | 36px (h-9) | 16px | 14px | 16px |
| `lg` | 40px (h-10) | 20px | 14px | 16px |
| `icon` | 36x36px | -- | -- | 16px |
| `icon-sm` | 28x28px | -- | -- | 14px |

**States:**

| State | Change |
|-------|--------|
| `default` | As defined above |
| `hover` | Background lightens (accent-hover), cursor: pointer |
| `active` | `transform: scale(0.98)` or darker background |
| `focus-visible` | `box-shadow: 0 0 0 3px var(--accent-subtle)` |
| `disabled` | `opacity: 0.5; cursor: not-allowed` |

**Auto Layout:** Horizontal, `gap: 8px` (icon + text), vertical center alignment. Padding: per size table above. `border-radius: radius-md` (8px).

---

### 2.2 Badge

**Variants:**

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| `default` | `var(--primary)` | white | none |
| `secondary` | `var(--muted)` | `var(--foreground)` | none |
| `outline` | transparent | `var(--foreground)` | `var(--border)` |
| `destructive` | `var(--error-subtle)` | `var(--error)` | none |
| `success` | `var(--success-subtle)` | `var(--success)` | none |
| `warning` | `var(--warning-subtle)` | `var(--warning)` | none |
| `info` | `var(--info-subtle)` | `var(--info)` | none |

**Specs:** Height auto, padding `2px 10px`, font-size 12px, weight 500, `border-radius: radius-full` (pill). No interactive states (badges are static).

**Auto Layout:** Horizontal, padding `2px 10px`, center alignment.

---

### 2.3 Card

**Variants:**

| Variant | Background | Border | Shadow |
|---------|-----------|--------|--------|
| `default` | `var(--bg-surface)` | `1px solid var(--border-default)` | None |
| `elevated` | `var(--bg-surface)` | `1px solid var(--border-default)` | Small |
| `interactive` | `var(--bg-surface)` | `1px solid var(--border-default)` | None |

**States (interactive only):**

| State | Change |
|-------|--------|
| `default` | As above |
| `hover` | VS: border-color to accent. PD/JF: `translateY(-2px)` + Card Hover shadow |

**Specs:** `border-radius: radius-lg` (12px), `padding: space-6` (24px).

**Sub-components:**
- `CardHeader` -- top section, contains title + description. Auto Layout vertical, gap 4px.
- `CardTitle` -- Heading 3 style (24px/600).
- `CardDescription` -- Body Small style, text-muted.
- `CardContent` -- main content area. Auto Layout vertical, gap 16px.
- `CardFooter` -- bottom section, horizontal, gap 8px, justify end.

**Auto Layout:** Vertical, `gap: 0`, children stretch. Internal padding: `space-6`.

---

### 2.4 Dialog (Modal)

**Sizes:**

| Size | Max-width |
|------|-----------|
| `sm` | 480px |
| `md` (default) | 640px |
| `lg` | 960px |

**Structure:**
- `Overlay` -- `background: rgba(0,0,0,0.5)`, full viewport, z-50.
- `DialogContent` -- `bg-surface`, `border-radius: radius-lg`, `padding: space-6`. Centered.
- `DialogHeader` -- Auto Layout vertical, gap 4px.
- `DialogTitle` -- Heading 3 (24px/600).
- `DialogDescription` -- Body Small, text-muted.
- `DialogFooter` -- Horizontal, gap 8px, justify end.
- `DialogClose` -- Icon button (X), top-right corner, 20px from edges.

**States:** Overlay visible/hidden (animation: fade 200ms). Content: slide-up + fade.

**Auto Layout:** Vertical, `gap: space-4`, padding `space-6`.

---

### 2.5 Input

**Variants:**

| Variant | Description |
|---------|-------------|
| `default` | Standard text input |
| `with-icon` | Left icon + input |
| `with-addon` | Left/right addon (text or button) |

**States:**

| State | Border | Shadow |
|-------|--------|--------|
| `default` | `var(--border-default)` | none |
| `hover` | slightly darker border | none |
| `focus` | `var(--primary)` | `0 0 0 3px var(--accent-subtle)` |
| `error` | `var(--error)` | `0 0 0 3px var(--error-subtle)` |
| `disabled` | `var(--border-subtle)` | none, `opacity: 0.5` |

**Specs:** Height 36px (md), `padding: 10px 14px`, `font-size: 14px` (16px on mobile), `border-radius: radius-md` (8px), `background: var(--bg-surface)`.

**Auto Layout:** Horizontal, gap 8px (if icon), vertical center. Padding 10px 14px.

---

### 2.6 Label

**Specs:** `font-size: 14px`, `font-weight: 500`, `line-height: 1.5`, `letter-spacing: +0.025em`, `color: var(--text-primary)`.

Associated with Input via layout -- place Label above Input with `gap: space-2` (8px).

---

### 2.7 Select

**Structure:**
- `SelectTrigger` -- looks like Input, with chevron-down icon on the right. Height 36px.
- `SelectContent` -- dropdown panel. `bg-surface`, `border: var(--border-default)`, `radius-lg`, `shadow: Medium`. Max-height 300px with scroll.
- `SelectItem` -- `padding: 8px 12px`, hover: `bg-subtle`. Active: `bg-primary/10`.
- `SelectSeparator` -- 1px `border-default`.

**States:** Same as Input for trigger. Items have hover/active.

**Auto Layout:** Trigger: horizontal, justify space-between, center alignment. Content: vertical, gap 0, padding 4px.

---

### 2.8 Skeleton

**Specs:** `background: var(--bg-subtle)`, `border-radius: radius-md`, `animate-pulse` (1s ease-in-out infinite). Height and width per context.

**Variants:** `text` (h: 16px, w: 100%), `avatar` (circle, 40x40), `card` (full card placeholder).

---

### 2.9 Table

**Structure:**
- `Table` -- container, full width, `border-collapse: collapse`.
- `TableHeader` -- `background: var(--bg-subtle)`.
- `TableHead` -- `padding: 12px 16px`, Label style (14px/500), `text-muted`, `text-align: left`.
- `TableBody` -- rows.
- `TableRow` -- `border-bottom: 1px solid var(--border-subtle)`. Hover: `bg-subtle` tint.
- `TableCell` -- `padding: 12px 16px`, Body Small (14px/400).

**Auto Layout:** Table uses Figma's Auto Layout vertical for rows, horizontal for cells. Each cell has horizontal padding `space-4`.

---

### 2.10 Tabs

**Variants:**

| Variant | Description |
|---------|-------------|
| `underline` (default) | Bottom border indicator, transparent background |
| `pills` | Background pill indicator |

**States:**

| State | Styling |
|-------|---------|
| `default` | `text-muted`, no indicator |
| `hover` | `text-secondary` |
| `active` | `text-primary`, indicator visible (underline or pill bg) |
| `disabled` | `opacity: 0.5` |

**Specs:** Tab item: `padding: 8px 16px`, Body Base (16px/500). Underline indicator: 2px, `var(--primary)`. Pill indicator: `bg-surface`, `radius-md`.

**Auto Layout:** TabsList: horizontal, `gap: 4px`. TabsContent: vertical below TabsList, `gap: space-4`.

---

### 2.11 Tooltip

**Specs:** `background: var(--bg-surface)` (dark: `#1e293b`), `color: var(--text-primary)`, `padding: 6px 12px`, `border-radius: radius-md`, `font-size: 12px`, `max-width: 240px`, `shadow: Medium`.

Arrow: 8px, same color as background.

**Placement:** top (default), bottom, left, right. 8px gap from trigger.

---

### 2.12 EmptyState

**Structure:**
- Icon: 48-64px, `text-muted`, centered.
- Title: Heading 3 (24px/600), centered.
- Description: Body Small (14px), `text-muted`, centered, `max-width: 360px`.
- Action: Button (optional), below description, `margin-top: space-4`.

**Auto Layout:** Vertical, center alignment, `gap: space-3` (12px). Padding `space-8` (32px).

---

### 2.13 Switch

**Specs:** Track: 36x20px, `radius-full`. Thumb: 16x16px circle. Off: track `var(--border-default)`, thumb white. On: track `var(--primary)`, thumb white.

**States:** default, hover (subtle brightness), active, focus-visible (ring), disabled (opacity 0.5).

---

### 2.14 Separator

**Specs:** Horizontal: `height: 1px`, `background: var(--border-default)`, full width. Vertical: `width: 1px`, full height.

---

### 2.15 Textarea

Same as Input, but multi-line. `min-height: 80px`, `resize: vertical`. Same states and styling.

---

## Page 3: Patterns

### 3.1 Navigation

#### Sidebar (PD, JF, SH)

- Width: 256px (expanded), 64px (collapsed, icon-only).
- Background: `var(--bg-subtle)`.
- Border-right: `1px solid var(--border-default)`.
- Logo area: top, height 64px, centered.
- Nav items: vertical stack, `gap: 2px`.
  - Item: `padding: 8px 12px`, `radius-md`, Lucide icon (20px) + Body Base text.
  - Hover: `bg-surface`.
  - Active: `bg-primary/10`, `text-primary`, accent left-border (VS: indigo, PD/JF: blue, SH: emerald vertical bar 3px).
- Collapse toggle: bottom or inline, chevron icon.
- Mobile: overlay drawer from left, full height, with overlay backdrop.

#### Top Bar

- Height: 56px.
- Background: `var(--bg-base)`.
- Border-bottom: `1px solid var(--border-default)`.
- Layout: horizontal, justify space-between, vertical center.
- Left: logo / breadcrumbs.
- Right: theme toggle, language toggle, avatar/profile.

#### Bottom Nav (Mobile)

- Height: 56px + safe-area-inset-bottom.
- Background: `var(--bg-surface)` with `backdrop-filter: blur(12px)`.
- Border-top: `1px solid var(--border-default)`.
- Items: 4-5 icons, horizontal, equal width. Min touch target 44x44px.
- Active: icon `var(--primary)`, label bold. Inactive: `text-muted`.

#### Breadcrumbs

- Font: Body Small (14px), `text-muted`.
- Separator: `/` or chevron-right icon (12px).
- Last item: `text-primary`, not clickable.
- Auto Layout: horizontal, `gap: 4px`.

---

### 3.2 Forms

#### Login Form

- Container: Card (elevated), max-width 400px, centered.
- Logo: centered, 48px icon, `margin-bottom: space-6`.
- Title: Heading 2 (36px/700), centered.
- Subtitle: Body Small, `text-muted`, centered.
- Fields: Label + Input, vertical stack, `gap: space-4`.
- Buttons: "Sign in with Google" (outline, full-width), "Sign in with GitHub" (outline, full-width).
- Divider: `-- or --` separator.
- Footer: Body Small, link `text-primary`.

#### Search Form

- Input with search icon (left), full width.
- Optional: filter chips (Badge row) below input.
- Auto Layout: vertical, `gap: space-3`.

#### Filter Form

- Horizontal row of Select dropdowns + date picker.
- Wrapped on mobile (vertical stack).
- Apply button (primary) at end.
- Auto Layout: horizontal wrap, `gap: space-3`.

---

### 3.3 Data Display

#### Table View

- Standard Table component (see 2.9).
- Header: sticky, sortable columns (icon indicator).
- Pagination: bottom, horizontal, `gap: space-2`, page numbers + prev/next buttons.
- Empty state: EmptyState component centered in table body.

#### Cards Grid

- CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`.
- Gap: `space-4` (16px).
- Each card: Card component (interactive variant).
- Loading: Skeleton cards (same dimensions).

#### Stats Row

- Horizontal row of 3-4 stat cards.
- Each stat: Card with title (Label style, text-muted), value (Heading 2, text-primary), delta Badge (+/-%).
- Auto Layout: horizontal, `gap: space-4`, equal width.
- Mobile: 2-column grid or vertical stack.

---

## Page 4: Templates

### 4.1 Landing Page Template

**Layout:**
```
[TopBar: logo left, nav links center, CTA button right]
[Hero: Heading Display centered, Body Large subtitle, 2 buttons (primary + secondary)]
[Features: 3-column Cards Grid, icon + heading + description each]
[Social Proof: stats row or logo grid]
[CTA Section: Card (large), heading + description + button]
[Footer: 3-column links, logo, copyright]
```

**Specs:**
- Max-width: 1200px, centered.
- Section spacing: `space-20` (80px) vertical.
- Hero: full viewport height option.
- Background: `bg-base`. Hero may use gradient overlay.

---

### 4.2 Dashboard Template

**Layout:**
```
[Sidebar: 256px left (collapsible)]
[TopBar: full width of content area]
[Main Content Area:]
  [Stats Row: 4 metric cards]
  [Content Grid: 2 columns (chart left 2/3, activity right 1/3)]
  [Table Section: full width table with pagination]
```

**Specs:**
- Sidebar: fixed, scrollable if needed.
- Content area: `padding: space-6`, `max-width: 1400px`.
- Stats row: `margin-bottom: space-6`.
- Responsive: sidebar collapses to overlay on < 1024px.

---

### 4.3 Auth (Login / Signup) Template

**Layout:**
```
[Full viewport, two columns on desktop:]
  [Left: brand panel -- bg gradient, logo centered, tagline]
  [Right: Login Form centered vertically]

[Mobile: single column, form only, logo above form]
```

**Specs:**
- Brand panel: `background: var(--primary)` gradient, `min-height: 100vh`.
- Form panel: `background: var(--bg-base)`, centered Card.
- Max-width form: 400px.
- Gap between form fields: `space-4`.

---

### 4.4 Settings Template

**Layout:**
```
[Sidebar: same as Dashboard]
[TopBar: title "Settings"]
[Main Content:]
  [Tabs: Profile | Appearance | Notifications | Security | API]
  [Tab Content: Form sections]
    [Section: Label, Description, fields]
    [Section: Label, Description, fields]
    [Footer: Save button (primary) right-aligned]
```

**Specs:**
- Tabs: `underline` variant, full width.
- Content area: max-width 720px (narrow for readability).
- Section spacing: `space-8` between sections.
- Form fields: vertical stack, `gap: space-4`.
- Section divider: Separator between sections.

---

## Page 5: Brand

### 5.1 Logo Usage

#### VS Logo

- **Elements:** V-wave, circuit accents, surfer in S, sun rays.
- **Source:** `app/public/vs-logo/vs1.svg` (1024x1024, single source of truth).
- **Gradient:** `#4A50C6` to `#7379DD` (main), `#8E92EE` (highlight), `#F1CB4E` (gold star).
- **Background:** Always on dark background (`#09090b` or darker). Rounded square `rx=24`.
- **Wordmark:** "Vibe" Inter 700 `#ededed` + "Studio" Inter 300 `#888888`.
- **Clear space:** 1/4 icon height on all sides.
- **Min size:** Icon-only 16px (favicon), full logo 24px height.

**Formats in Figma:**
- `Logo / Full` -- icon + wordmark, horizontal (280x64)
- `Logo / Icon` -- icon only (120x120)
- `Logo / Mono` -- monochrome version for light backgrounds
- `Logo / Favicon` -- 32x32, simplified

---

### 5.2 Per-Project Brand Cards

#### VS (Vibe Studio)

| Attribute | Value |
|-----------|-------|
| Primary | `#6366f1` (Indigo) |
| Secondary | `#8b5cf6` (Violet) |
| Background | `#09090b` (Dark only) |
| Font heading | Inter 700 |
| Font body | Inter 400 |
| Component lib | Custom CSS (no shadcn) |
| Icons | Lucide |
| Theme | Dark only |

#### PD (Personal Dashboard)

| Attribute | Value |
|-----------|-------|
| Primary | `#2563eb` (Blue) |
| Background | `#f8fafc` (light) / `#0a0f1a` (dark) |
| Font heading | Inter 600 |
| Font body | Inter 400 |
| Component lib | shadcn/ui v4 + @base-ui |
| Icons | Lucide |
| Themes | Light + Dark + 3 skins |

#### JF (JobFinder)

| Attribute | Value |
|-----------|-------|
| Primary | `#2563eb` (Blue) |
| Background | `#f8fafc` (light) / `#0a0f1a` (dark) |
| Font heading | Inter 600 |
| Font body | Inter 400 |
| Component lib | shadcn/ui (classic forwardRef, migrating to v4) |
| Icons | Lucide |
| Themes | Light + Dark + 3 skins |

#### SH (Shuleansky)

| Attribute | Value |
|-----------|-------|
| Primary | `#237d54` (Emerald) |
| Accent | `#d4a853` (Gold) |
| Background | `#f6f5f0` (light, warm) / `#0c100e` (dark) |
| Font heading | Playfair Display 600 |
| Font body | Inter 400 |
| Component lib | Minimal custom (button, badge only) |
| Icons | Lucide |
| Themes | Light + Dark |

---

### 5.3 OG Image Templates

**Dimensions:** 1200x630px

**Structure:**
```
[Dark background (project-specific)]
[Logo / Icon: top-left or center, 64px]
[Title: Heading 1 (48px/700, white), max 2 lines]
[Subtitle: Body Large (18px, text-muted), 1 line]
[Gradient accent strip: bottom or side, 4px, brand gradient]
[URL: bottom-right, Body Small, text-muted]
```

**Per-project backgrounds:**
- VS: `#09090b` solid
- PD/JF: `#0a0f1a` solid
- SH: `#0c100e` solid
- Website: `#26282b` solid

**YouTube Thumbnails (1280x720px):**
- Dark gradient background.
- Large text: Inter 700-800, white, 2-3 words max.
- Accent strip: vertical or horizontal, brand gradient.
- Logo: bottom-right corner, 32px.

---

### 5.4 Do / Don't Examples

#### Do

- Use SVG for logos -- scales to any size without quality loss.
- Place logo on dark backgrounds (`#09090b`, `#111113`, `#18181b`, `#000`).
- Use CSS custom properties (`var(--accent)`) instead of hardcoded hex values.
- Test every color pair for WCAG AA contrast (4.5:1 minimum for text).
- Follow the 4px grid for all spacing.
- Use Lucide icons exclusively -- consistent stroke style.
- Use `prefers-reduced-motion: reduce` to disable animations.
- 44x44px minimum touch target on mobile.
- Use Inter for all text (except SH headings = Playfair).

#### Don't

- Don't stretch, skew, or alter logo proportions.
- Don't add shadows, glow, or effects to the logo.
- Don't place logo on bright colored backgrounds (red, yellow, neon).
- Don't use `#ef4444` (danger red) for non-error UI elements.
- Don't use opacity < 0.6 for text that should be readable.
- Don't mix border-radius styles in the same context.
- Don't hardcode font-family -- use CSS variables.
- Don't use font-weight > 800 (not available in Inter).
- Don't use font-size < 12px for readable content.
- Don't add new icon packages (Heroicons, FontAwesome, Material Icons).
- Don't create custom SVG icons when Lucide has an equivalent.
- Don't use hover effects as the only way to indicate interactivity.
- Don't remove `:focus-visible` styles.
- Don't animate layout properties (width, height) -- only transform/opacity.

---

## Appendix: Figma File Structure

```
Figma File: "example.com Design System"
|
|-- Page 1: Foundations
|   |-- Frame: Color Styles (all tokens, grouped by category)
|   |-- Frame: Typography (type scale samples)
|   |-- Frame: Spacing (4px grid reference)
|   |-- Frame: Border Radius (visual reference)
|   |-- Frame: Shadows / Elevation (side-by-side comparison)
|
|-- Page 2: Components
|   |-- Frame: Button (all variants x sizes x states)
|   |-- Frame: Badge (all variants)
|   |-- Frame: Card (variants + sub-components)
|   |-- Frame: Dialog (sizes + structure)
|   |-- Frame: Input (variants x states)
|   |-- Frame: Label
|   |-- Frame: Select (trigger + dropdown)
|   |-- Frame: Skeleton (text, avatar, card)
|   |-- Frame: Table (header + rows + pagination)
|   |-- Frame: Tabs (underline + pills, states)
|   |-- Frame: Tooltip (placements)
|   |-- Frame: EmptyState
|   |-- Frame: Switch (states)
|   |-- Frame: Separator
|   |-- Frame: Textarea
|
|-- Page 3: Patterns
|   |-- Frame: Navigation (sidebar, topbar, bottom nav, breadcrumbs)
|   |-- Frame: Forms (login, search, filters)
|   |-- Frame: Data Display (table view, cards grid, stats row)
|
|-- Page 4: Templates
|   |-- Frame: Landing Page
|   |-- Frame: Dashboard
|   |-- Frame: Auth (Login / Signup)
|   |-- Frame: Settings
|
|-- Page 5: Brand
|   |-- Frame: Logo Usage (full, icon, mono, favicon, clear space)
|   |-- Frame: Project Brand Cards (VS, PD, JF, SH)
|   |-- Frame: OG Image Templates
|   |-- Frame: Do / Don't
```

Each component frame should contain:
1. **Component set** with all variant combinations.
2. **Anatomy diagram** showing Auto Layout structure, padding, gaps.
3. **Specs annotation** with exact token values.
4. **Dark + Light preview** side by side (except VS = dark only).
