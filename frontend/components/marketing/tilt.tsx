"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Subtle 3D tilt that follows the cursor over the element (max a few degrees).
 * rAF-lerped, compositor-only (perspective + rotate in a single transform),
 * suppressed for prefers-reduced-motion, and always springs back to flat on
 * leave. Gives the product-preview card a premium, tactile depth without
 * changing its size, color, or content.
 */
export function Tilt({
  children,
  className,
  max = 3,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let curRX = 0;
    let curRY = 0;
    let tgtRX = 0;
    let tgtRY = 0;
    let active = false;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      tgtRY = px * max * 2;
      tgtRX = -py * max * 2;
      if (!active) {
        active = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onLeave = () => {
      tgtRX = 0;
      tgtRY = 0;
      if (!active) {
        active = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      curRX += (tgtRX - curRX) * 0.1;
      curRY += (tgtRY - curRY) * 0.1;
      el.style.transform = `perspective(1100px) rotateX(${curRX.toFixed(2)}deg) rotateY(${curRY.toFixed(2)}deg)`;
      if (Math.abs(tgtRX - curRX) > 0.02 || Math.abs(tgtRY - curRY) > 0.02) {
        raf = requestAnimationFrame(tick);
      } else {
        active = false;
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [max]);

  return (
    <div
      ref={ref}
      className={cn(
        "will-change-transform [transform-style:preserve-3d]",
        className
      )}
    >
      {children}
    </div>
  );
}
