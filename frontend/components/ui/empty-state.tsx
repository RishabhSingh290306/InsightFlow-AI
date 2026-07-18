import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const emptyStateVariants = cva(
  "flex flex-col items-center justify-center text-center transition-all duration-220ms ease-in-out",
  {
    variants: {
      variant: {
        default: "py-16",
        compact: "py-8",
        card: "rounded-2xl border border-dashed border-border bg-card/50 p-12",
        sheet: "rounded-xl border border-border bg-card p-8",
      },
      size: {
        default: "",
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

const iconContainerVariants = cva(
  "flex items-center justify-center rounded-2xl transition-transform duration-220ms ease-out-expo group-hover:scale-105",
  {
    variants: {
      size: {
        default: "h-16 w-16",
        sm: "h-12 w-12",
        lg: "h-20 w-20",
      },
      tone: {
        primary: "bg-primary/10 text-primary",
        secondary: "bg-secondary/20 text-secondary-foreground",
        lavender: "bg-lavender/20 text-lavender-foreground",
        muted: "bg-muted/60 text-muted-foreground",
        accent: "bg-accent/20 text-accent-foreground",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "primary",
    },
  }
);

export interface EmptyStateProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  iconTone?: VariantProps<typeof iconContainerVariants>["tone"];
  iconSize?: VariantProps<typeof iconContainerVariants>["size"];
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      variant,
      size,
      icon,
      iconTone,
      iconSize,
      title,
      description,
      action,
      secondaryAction,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(emptyStateVariants({ variant, size, className }))}
        {...props}
      >
        {icon && (
          <div className={cn(iconContainerVariants({ tone: iconTone, size: iconSize }))}>
            <span className="h-7 w-7">{icon}</span>
          </div>
        )}
        <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
        {children}
        {(action || secondaryAction) && (
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row">
            {action}
            {secondaryAction}
          </div>
        )}
      </div>
    );
  }
);
EmptyState.displayName = "EmptyState";

export { EmptyState, emptyStateVariants };