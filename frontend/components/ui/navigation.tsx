"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const navVariants = cva(
  "flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-160ms ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        primary: "text-primary hover:bg-primary/10",
        pill: "bg-muted/50 hover:bg-muted/80 rounded-full",
        underline:
          "bg-transparent hover:text-foreground border-b-2 border-transparent hover:border-primary",
        active: "bg-primary text-primary-foreground shadow-soft-sm",
      },
      orientation: {
        horizontal: "flex-row",
        vertical: "flex-col w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      orientation: "horizontal",
    },
  }
);

export interface NavProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof navVariants> {}

const Nav = React.forwardRef<HTMLElement, NavProps>(
  ({ className, variant, orientation, children, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        className={cn(navVariants({ variant, orientation, className }))}
        {...props}
      >
        {children}
      </nav>
    );
  }
);
Nav.displayName = "Nav";

const NavItem = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { active?: boolean }
>(({ className, active, ...props }, ref) => {
  return (
    <a
      ref={ref}
      className={cn(
        "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-160ms ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "bg-primary text-primary-foreground shadow-soft-sm"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      data-active={active}
      {...props}
    />
  );
});
NavItem.displayName = "NavItem";

export { Nav, NavItem, navVariants };
