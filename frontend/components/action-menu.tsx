"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionMenuProps {
  label?: string;
  icon?: ReactNode;
  /** Which edge of the trigger the menu aligns to. Defaults to right. */
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}

interface Coords {
  top: number;
  left: number;
}

export function ActionMenu({
  label = "Actions",
  icon,
  align = "right",
  children,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Portals can only mount on the client.
  useEffect(() => setMounted(true), []);

  // Position the floating menu relative to the trigger. Recomputed on open and
  // whenever the layout shifts (scroll/resize) so it never drifts or clips.
  useEffect(() => {
    if (!open) return;

    function position() {
      const btn = triggerRef.current;
      const menu = menuRef.current;
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const menuW = menu?.offsetWidth ?? 192;
      const menuH = menu?.offsetHeight ?? 200;
      const gap = 6;

      let left =
        align === "right" ? rect.right - menuW : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));

      // Flip above the trigger when there isn't room below.
      const spaceBelow = window.innerHeight - rect.bottom;
      let top =
        spaceBelow < menuH + gap ? rect.top - menuH - gap : rect.bottom + gap;
      top = Math.max(8, top);

      setCoords({ top, left });
    }

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
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

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
      >
        {icon}
        {label}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-160ms", open && "rotate-180")}
        />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
              zIndex: 60,
            }}
            className="min-w-[12rem] rounded-md border bg-background p-1 shadow-lg animate-scale-in"
          >
            {children(close)}
          </div>,
          document.body
        )}
    </>
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
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
