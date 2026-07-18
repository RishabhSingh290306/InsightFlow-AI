"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  contentClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const Dropdown = React.forwardRef<HTMLDivElement, DropdownProps>(
  (
    { trigger, children, align = "left", className, contentClassName, open, onOpenChange },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(open || false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    React.useImperativeHandle(ref, () => dropdownRef.current as HTMLDivElement);

    React.useEffect(() => {
      if (open !== undefined) {
        setIsOpen(open);
      }
    }, [open]);

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsOpen(false);
          onOpenChange?.(false);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onOpenChange]);

    const handleToggle = () => {
      const newOpen = !isOpen;
      setIsOpen(newOpen);
      onOpenChange?.(newOpen);
    };

    const alignmentClasses = {
      left: "left-0",
      right: "right-0",
      center: "left-1/2 -translate-x-1/2",
    };

    return (
      <div ref={dropdownRef} className={cn("relative inline-block", className)}>
        <div onClick={handleToggle} className="cursor-pointer">
          {trigger}
        </div>
        {isOpen && (
          <div
            className={cn(
              "absolute z-50 mt-2 min-w-[12rem] rounded-xl border border-border bg-card p-1.5 shadow-soft-lg animate-scale-in",
              alignmentClasses[align],
              contentClassName
            )}
          >
            {children}
          </div>
        )}
      </div>
    );
  }
);
Dropdown.displayName = "Dropdown";

const DropdownItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }
>(({ className, icon, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground transition-colors duration-160ms ease-in-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className
    )}
    {...props}
  >
    {icon && <span className="flex h-4 w-4 items-center justify-center">{icon}</span>}
    {children}
  </button>
));
DropdownItem.displayName = "DropdownItem";

const DropdownLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-3 py-1.5 text-2xs font-semibold uppercase tracking-widest text-muted-foreground", className)}
    {...props}
  />
));
DropdownLabel.displayName = "DropdownLabel";

const DropdownSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("my-1.5 h-px bg-border", className)}
    {...props}
  />
));
DropdownSeparator.displayName = "DropdownSeparator";

export { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator };