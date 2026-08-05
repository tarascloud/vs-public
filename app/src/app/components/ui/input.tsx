import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // h-9 min-h-[44px] py-2.5 — visual height stays 36px on dense desktop forms,
        // but touch target meets WCAG 2.5.5 / Apple HIG 44px minimum (REV-2026-06-01).
        "flex h-9 min-h-[44px] w-full rounded-lg border border-card-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
