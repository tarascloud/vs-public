// @vibe-studio/ui — LocaleSwitcher primitive
// Generic locale switcher UI. Project-specific router/cookie/next-intl glue
// stays in the consumer; this primitive only handles presentation + a11y.
//
// Usage:
//   <LocaleSwitcher
//     locales={["en", "es", "ua"]}
//     current={locale}
//     onChange={(loc) => switchLocale(loc)}
//     labels={{ en: "EN", es: "ES", ua: "UA" }}
//   />
//
// Style: consumes design tokens (--foreground, --muted-foreground,
// --border, --card). Active state uses --foreground for AA contrast.

"use client"

import { cva, type VariantProps } from "class-variance-authority"

const switcherVariants = cva(
  "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] p-0.5",
  {
    variants: {
      size: {
        default: "gap-0",
        compact: "gap-0",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const buttonVariants = cva(
  "rounded-full px-2.5 text-[11px] font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/50 disabled:cursor-not-allowed",
  {
    variants: {
      size: {
        default: "py-1.5 min-h-[28px]",
        compact: "py-1 min-h-[24px]",
      },
      active: {
        true: "bg-[var(--foreground)] text-[var(--background)] shadow-sm",
        false:
          "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
      },
    },
    defaultVariants: {
      size: "default",
      active: false,
    },
  }
)

export interface LocaleSwitcherProps
  extends VariantProps<typeof switcherVariants> {
  /** All available locale codes, e.g. ["en", "es", "ua"]. */
  locales: readonly string[]
  /** Currently active locale code. */
  current: string
  /** Called when user picks a new locale (skipped if same as current). */
  onChange: (locale: string) => void
  /** Visible labels per locale, e.g. { en: "EN", es: "ES" }. Falls back to uppercase. */
  labels?: Record<string, string>
  /** Disable interaction (e.g., while a transition is pending). */
  disabled?: boolean
  /** ARIA label for the group. */
  ariaLabel?: string
  /** Optional className for the container. */
  className?: string
}

export function LocaleSwitcher({
  locales,
  current,
  onChange,
  labels,
  disabled = false,
  size,
  ariaLabel = "Language",
  className,
}: LocaleSwitcherProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={[switcherVariants({ size }), className]
        .filter(Boolean)
        .join(" ")}
    >
      {locales.map((loc) => {
        const active = loc === current
        const label = labels?.[loc] ?? loc.toUpperCase()
        return (
          <button
            key={loc}
            type="button"
            onClick={() => {
              if (!active && !disabled) onChange(loc)
            }}
            disabled={disabled && !active}
            aria-pressed={active}
            aria-label={`Switch language to ${label}`}
            className={buttonVariants({ size, active })}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
