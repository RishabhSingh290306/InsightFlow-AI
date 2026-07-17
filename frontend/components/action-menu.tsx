"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface ActionMenuProps {
  label?: string;
  icon?: ReactNode;
  children: (close: () => void) => ReactNode;
}

export function ActionMenu({ label = "Actions", icon, children }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
      >
        {icon}
        {label}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[12rem] rounded-md border bg-background p-1 shadow-lg"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  children: ReactNode;
}

export function MenuItem({ onSelect, icon, destructive = false, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
