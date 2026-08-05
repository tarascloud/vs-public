"use client";

import {
  forwardRef,
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useCallback,
} from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Internal contexts (declared up-front)                                */
/* ------------------------------------------------------------------ */

interface DialogInnerContextValue {
  contentRef: React.RefObject<HTMLDivElement | null>;
}

const DialogInnerContext = createContext<DialogInnerContextValue | null>(null);
const DialogTitleContext = createContext<string | null>(null);

/* ------------------------------------------------------------------ */
/* Dialog root (controlled open/close)                                  */
/* ------------------------------------------------------------------ */

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Save previously focused element on open; restore on close
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    return () => {
      // Restore focus on close (component remount when open toggles)
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === "function") {
        // Defer to next tick so React has removed overlay first
        requestAnimationFrame(() => prev.focus());
      }
    };
  }, [open]);

  // Focus first focusable on open + trap focus with Tab/Shift+Tab
  useEffect(() => {
    if (!open) return;
    const node = contentRef.current;
    if (!node) return;

    const getFocusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("data-focus-trap-ignore"));

    // Focus first focusable after mount
    requestAnimationFrame(() => {
      const focusables = getFocusable();
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        // Fall back to focusing container
        node.setAttribute("tabindex", "-1");
        node.focus();
      }
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !node.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    node.addEventListener("keydown", handleKey);
    return () => node.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onOpenChange(false);
    },
    [onOpenChange]
  );

  if (!open) return null;

  // Clone the DialogContent child and inject our ref + generated title id
  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <DialogInnerContext.Provider value={{ contentRef }}>
        {children}
      </DialogInnerContext.Provider>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DialogContent                                                        */
/* ------------------------------------------------------------------ */

const DialogContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const inner = useContext(DialogInnerContext);
    const titleId = useId();

    // Merge refs
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        if (inner?.contentRef) {
          (inner.contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [inner, ref]
    );

    return (
      <DialogTitleContext.Provider value={titleId}>
        <div
          ref={setRefs}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "relative w-full max-w-lg rounded-xl border border-card-border bg-card-bg p-6 shadow-xl",
            "animate-in fade-in-0 zoom-in-95",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </DialogTitleContext.Provider>
    );
  }
);
DialogContent.displayName = "DialogContent";

/* ------------------------------------------------------------------ */
/* DialogHeader / DialogTitle / DialogDescription                        */
/* ------------------------------------------------------------------ */

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, id: idProp, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  const ctxId = useContext(DialogTitleContext);
  return (
    <h2
      id={idProp ?? ctxId ?? undefined}
      className={cn("text-lg font-semibold leading-none tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted", className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* DialogFooter                                                         */
/* ------------------------------------------------------------------ */

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
