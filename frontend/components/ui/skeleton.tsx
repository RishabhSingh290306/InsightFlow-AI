import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const skeletonVariants = cva(
  "shimmer rounded-md bg-muted/70 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "",
        text: "h-4 rounded-full",
        title: "h-6 rounded-lg",
        avatar: "h-10 w-10 rounded-full",
        card: "h-32 rounded-xl",
        circle: "rounded-full",
        button: "h-10 rounded-xl",
      },
      tone: {
        default: "bg-muted/70",
        primary: "bg-primary/10",
        soft: "bg-muted/50",
        card: "bg-card-muted/80",
      },
    },
    defaultVariants: {
      variant: "default",
      tone: "default",
    },
  }
);

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant, tone, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(skeletonVariants({ variant, tone, className }))}
        {...props}
      />
    );
  }
);
Skeleton.displayName = "Skeleton";

export { Skeleton, skeletonVariants };