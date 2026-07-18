"use client";

import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Wraps any content and paints a soft radial highlight that follows the cursor
 * while hovered (the "spotlight" effect). Coordinates are written straight to
 * CSS vars on the node, so the component never re-renders; only the overlay's
 * opacity transitions. Adds no markup that changes layout — the existing card
 * and its styling stay exactly as they are.
 */
export function SpotlightCard({
  children,
  className,
  rounded = "rounded-2xl",
}: {
  children: ReactNode;
  className?: string;
  rounded?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className={cn("spotlight-host group", rounded, className)}
    >
      {children}
      <span aria-hidden className="spotlight" />
    </div>
  );
}
