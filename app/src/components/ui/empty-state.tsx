"use client";

import { isValidElement, type ReactNode, type ElementType } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/app/components/ui/button";

/**
 * EmptyState — canonical shared component (UX-05-20260425).
 *
 * Source of truth: jf-private/src/components/EmptyState.tsx (extended).
 * Mirrored verbatim in:
 *   - jf-private/src/components/EmptyState.tsx
 *   - korobkovart/site/src/components/EmptyState.tsx
 *   - pd-private/next/src/components/shared/empty-state.tsx
 *   - sh-private/src/components/empty-state.tsx
 *   - app/src/components/ui/empty-state.tsx
 *
 * Keep in lockstep — see .claude/rules/css-tokens-sync.md §"Shared
 * components".
 *
 * --- API ---
 * Backward-compatible union for `icon` and `action`:
 *
 *   icon — accepts a Lucide-style component, a rendered ReactNode (`<svg/>`),
 *          or undefined.
 *   action — accepts {label, href?, onClick?}, a ReactNode, or undefined.
 *   compact — tightens vertical padding (`py-6` vs `py-16`) for card widgets.
 */

type IconProp = ElementType | ReactNode;
type ActionProp =
  | { label: string; href?: string; onClick?: () => void }
  | ReactNode;

interface EmptyStateProps {
  icon?: IconProp;
  title: string;
  description?: string;
  action?: ActionProp;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}

function isActionConfig(
  a: ActionProp | undefined,
): a is { label: string; href?: string; onClick?: () => void } {
  return (
    !!a &&
    typeof a === "object" &&
    !isValidElement(a) &&
    "label" in (a as object)
  );
}

function renderIcon(icon: IconProp | undefined): ReactNode | null {
  if (!icon) return null;
  if (isValidElement(icon)) {
    return (
      <div className="mb-4 rounded-full bg-muted p-4 inline-flex">{icon}</div>
    );
  }
  if (typeof icon === "function" || typeof icon === "object") {
    const Icon = icon as ElementType;
    return (
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }
  return null;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-4",
        compact ? "py-6" : "py-16",
        className,
      )}
    >
      {renderIcon(icon)}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
      {action && (
        <div className="mt-6">
          {isActionConfig(action) ? (
            action.href ? (
              <Link href={action.href}>
                <Button variant="default">{action.label}</Button>
              </Link>
            ) : (
              <Button variant="default" onClick={action.onClick}>
                {action.label}
              </Button>
            )
          ) : (
            (action as ReactNode)
          )}
        </div>
      )}
    </div>
  );
}
