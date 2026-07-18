"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient hero backdrop: soft blurred color blobs that drift slowly, plus a
 * light that follows the cursor. Coordinates are written straight to CSS vars
 * on the node (rAF-throttled, lerped) so the component never re-renders and
 * the browser only composites transforms. All motion is GPU-friendly and is
 * suppressed for users who prefer reduced motion.
 */
export function HeroBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const light = lightRef.current;
    if (!root || !light) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Pointer light — skip entirely when reduced motion is requested.
    if (!reduce) {
      let raf = 0;
      let curX = 50;
      let curY = 28;
      let tgtX = 50;
      let tgtY = 28;
      let active = false;

      const onMove = (e: PointerEvent) => {
        const rect = root.getBoundingClientRect();
        tgtX = ((e.clientX - rect.left) / rect.width) * 100;
        tgtY = ((e.clientY - rect.top) / rect.height) * 100;
        if (!active) {
          active = true;
          raf = requestAnimationFrame(tick);
        }
      };

      const tick = () => {
        curX += (tgtX - curX) * 0.12;
        curY += (tgtY - curY) * 0.12;
        light.style.setProperty("--mx", `${curX}%`);
        light.style.setProperty("--my", `${curY}%`);
        if (Math.abs(tgtX - curX) > 0.1 || Math.abs(tgtY - curY) > 0.1) {
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
    }
  }, []);

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Slow-drifting gradient mesh — calm, ambient color motion */}
      <div className="absolute inset-0 animate-mesh-drift opacity-70 gradient-mesh [will-change:transform]" />

      {/* Drifting color blobs */}
      <div className="absolute -left-[12%] -top-[18%] h-[42rem] w-[42rem] rounded-full bg-primary/20 blur-3xl animate-blob [will-change:transform]" />
      <div className="absolute -right-[10%] top-[6%] h-[38rem] w-[38rem] rounded-full bg-lavender/20 blur-3xl animate-blob [animation-delay:-8s] [will-change:transform]" />
      <div className="absolute left-[20%] top-[40%] h-[30rem] w-[30rem] rounded-full bg-secondary/25 blur-3xl animate-blob [animation-delay:-15s] [will-change:transform]" />

      {/* Cursor-following light */}
      <div ref={lightRef} className="hero-light absolute inset-0" />
    </div>
  );
}
