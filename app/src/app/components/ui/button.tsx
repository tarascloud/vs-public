import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-white hover:bg-accent-hover active:bg-accent-active",
        destructive:
          "bg-danger text-white hover:bg-danger/90",
        outline:
          "border border-card-border bg-transparent hover:bg-card-bg hover:border-card-border-hover text-foreground",
        secondary:
          "bg-card-bg text-foreground-secondary hover:bg-card-bg-hover",
        ghost:
          "hover:bg-card-bg text-foreground-secondary",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 min-h-[44px] px-4 py-2",
        sm: "h-8 min-h-[44px] rounded-md px-3 text-xs",
        lg: "h-10 min-h-[44px] rounded-lg px-8",
        icon: "h-9 w-9 min-h-[44px] min-w-[44px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
