/**
 * @vibe-studio/tailwind-preset
 *
 * Shared Tailwind CSS preset for the example.com ecosystem.
 *
 * Tailwind CSS 4 uses CSS-based configuration (@theme inline blocks in globals.css)
 * rather than JS config objects. This preset provides:
 *
 * 1. A CSS file (`animations.css`) with shared @keyframes and utility classes
 * 2. A `createPlugin()` helper that registers the `animate-in` custom plugin
 * 3. Type-safe token constants for programmatic use (JS/TS)
 *
 * Integration (CSS-first approach for Tailwind v4):
 *   @import "@vibe-studio/tailwind-preset/animations.css";
 *
 * For projects that still use tailwind.config.ts (v3 compat):
 *   import { preset } from "@vibe-studio/tailwind-preset";
 *   export default { presets: [preset] };
 */

// ---------------------------------------------------------------------------
// Token Constants (from shared-tokens/tokens.css)
// Use these in JS/TS when you need programmatic access to design tokens.
// CSS variables remain the source of truth at runtime.
// ---------------------------------------------------------------------------

export const spacing = {
  1: "0.25rem",   //  4px
  2: "0.5rem",    //  8px
  3: "0.75rem",   // 12px
  4: "1rem",      // 16px
  5: "1.25rem",   // 20px
  6: "1.5rem",    // 24px
  8: "2rem",      // 32px
  12: "3rem",     // 48px
  16: "4rem",     // 64px
} as const;

export const radii = {
  sm: "0.25rem",    //  4px — badges, chips, tags
  md: "0.5rem",     //  8px — buttons, inputs
  lg: "0.75rem",    // 12px — cards, dialogs
  xl: "1rem",       // 16px — large containers
  full: "9999px",   // pill shape
} as const;

export const fontFamily = {
  sans: 'var(--font-inter), system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace',
} as const;

export const fontSize = {
  xs: "0.75rem",    // 12px
  sm: "0.875rem",   // 14px
  base: "1rem",     // 16px
  lg: "1.125rem",   // 18px
  xl: "1.25rem",    // 20px
  "2xl": "1.5rem",  // 24px
  "3xl": "1.875rem",// 30px
  "4xl": "2.25rem", // 36px
  "5xl": "3rem",    // 48px
} as const;

/** Semantic status colors (light mode defaults from tokens.css) */
export const semanticColors = {
  success: { DEFAULT: "#16a34a", subtle: "rgba(22, 163, 74, 0.1)" },
  warning: { DEFAULT: "#d97706", subtle: "rgba(217, 119, 6, 0.1)" },
  error: { DEFAULT: "#dc2626", subtle: "rgba(220, 38, 38, 0.1)" },
  info: { DEFAULT: "#2563eb", subtle: "rgba(37, 99, 235, 0.1)" },
} as const;

/** Per-project accent colors (light mode) */
export const projectAccents = {
  vs: { DEFAULT: "#6366f1", hover: "#818cf8" },
  pd: { DEFAULT: "#2563eb", hover: "#3b82f6" },
  jf: { DEFAULT: "#2563eb", hover: "#3b82f6" },
  sh: { DEFAULT: "#237d54", hover: "#16a34a" },
} as const;

// ---------------------------------------------------------------------------
// Animation duration / easing tokens
// ---------------------------------------------------------------------------

export const transitionDuration = {
  fast: "150ms",
  base: "200ms",
  slow: "300ms",
} as const;

export const transitionTimingFunction = {
  ease: "ease",
  easeOut: "ease-out",
  easeIn: "ease-in",
  spring: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

// ---------------------------------------------------------------------------
// Tailwind v3-compatible preset (for projects that still use config files)
// ---------------------------------------------------------------------------

export const preset = {
  theme: {
    extend: {
      spacing,
      borderRadius: radii,
      fontFamily,
      fontSize,
      transitionDuration,
      transitionTimingFunction,
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(var(--animate-in-y, 4px))" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(var(--animate-in-y, 8px))" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(var(--animate-in-y, -8px))" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "subtle-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "fade-in": "fade-in var(--animate-in-duration, 0.2s) var(--animate-in-easing, ease-out) both",
        "slide-up": "slide-up var(--animate-in-duration, 0.3s) var(--animate-in-easing, ease-out) both",
        "slide-down": "slide-down var(--animate-in-duration, 0.3s) var(--animate-in-easing, ease-out) both",
        "scale-in": "scale-in 0.4s ease both",
        "subtle-pulse": "subtle-pulse 2s ease-in-out infinite",
      },
    },
  },
} as const;
