import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full font-medium transition-all duration-160ms ease-in-out",
  {
    variants: {
      status: {
        default: "text-muted-foreground",
        success: "text-success",
        warning: "text-warning",
        destructive: "text-destructive",
        info: "text-primary",
        lavender: "text-lavender-foreground",
        neutral: "text-muted-foreground",
      },
      size: {
        default: "text-xs gap-1.5",
        sm: "text-2xs gap-1",
        lg: "text-sm gap-2",
      },
      pulse: {
        true: "",
        false: "",
      },
      withBackground: {
        true: "px-2.5 py-0.5 rounded-full",
        false: "",
      },
    },
    compoundVariants: [
      {
        status: "success",
        withBackground: true,
        className: "bg-success/10",
      },
      {
        status: "warning",
        withBackground: true,
        className: "bg-warning/10",
      },
      {
        status: "destructive",
        withBackground: true,
        className: "bg-destructive/10",
      },
      {
        status: "info",
        withBackground: true,
        className: "bg-primary/10",
      },
      {
        status: "lavender",
        withBackground: true,
        className: "bg-lavender/10",
      },
    ],
    defaultVariants: {
      status: "default",
      size: "default",
      pulse: false,
      withBackground: false,
    },
  }
);

const dotVariants = cva("inline-block rounded-full", {
  variants: {
    status: {
      default: "bg-muted-foreground",
      success: "bg-success",
      warning: "bg-warning",
      destructive: "bg-destructive",
      info: "bg-primary",
      lavender: "bg-lavender",
      neutral: "bg-muted-foreground",
    },
    size: {
      default: "h-2 w-2",
      sm: "h-1.5 w-1.5",
      lg: "h-2.5 w-2.5",
    },
    pulse: {
      true: "animate-pulse-soft",
      false: "",
    },
  },
  defaultVariants: {
    status: "default",
    size: "default",
    pulse: false,
  },
});

export interface StatusIndicatorProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusVariants> {
  label?: string;
  showDot?: boolean;
  icon?: React.ReactNode;
}

const StatusIndicator = React.forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  (
    { className, status, size, pulse, withBackground, label, showDot = true, icon, children, ...props },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(statusVariants({ status, size, pulse, withBackground, className }))}
        {...props}
      >
        {showDot && !icon && (
          <span className={cn(dotVariants({ status, size, pulse }))} />
        )}
        {icon && <span className="flex items-center">{icon}</span>}
        {label || children}
      </span>
    );
  }
);
StatusIndicator.displayName = "StatusIndicator";

export { StatusIndicator, statusVariants };