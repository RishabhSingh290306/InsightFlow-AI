"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Subtle mouse parallax: translates its children a few pixels toward/away from
 * the cursor based on pointer position in the viewport. rAF-lerped so motion
 * is smooth and compositor-only (translate3d). Suppressed for
 * prefers-reduced-motion. Used for the floating status cards so the preview
 * feels alive as the cursor moves.
 */
export function Parallax({
  children,
  className,
  strength = 12,
  axis = "both",
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  axis?: "both" | "x" | "y";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let curX = 0;
    let curY = 0;
    let tgtX = 0;
    let tgtY = 0;
    let active = false;

    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      tgtX = axis === "y" ? 0 : nx * strength;
      tgtY = axis === "x" ? 0 : ny * strength;
      if (!active) {
        active = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      curX += (tgtX - curX) * 0.08;
      curY += (tgtY - curY) * 0.08;
      el.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
      if (Math.abs(tgtX - curX) > 0.05 || Math.abs(tgtY - curY) > 0.05) {
        raf = requestAnimationFrame(tick);
      } else {
        active = false;
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [strength, axis]);

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
