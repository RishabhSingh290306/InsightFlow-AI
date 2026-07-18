"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sparkline that draws its stroke on once it scrolls into view (stroke-dash
 * technique) and fades its area fill in alongside it — a subtle "live chart"
 * reveal. Falls back to fully drawn state for prefers-reduced-motion. Keeps
 * the exact same geometry and colors as the static mock.
 */
export function AnimatedSparkline({ points }: { points: number[] }) {
  const polyRef = useRef<SVGPolylineElement>(null);
  const [len, setLen] = useState(0);
  const [drawn, setDrawn] = useState(false);

  const coords = points.map(
    (v, i) => `${(i / (points.length - 1)) * 120},${60 - v}`
  );
  const line = coords.join(" ");
  const area = `0,60 ${line} 120,60`;

  useEffect(() => {
    const poly = polyRef.current;
    if (!poly) return;
    const l = poly.getTotalLength();
    setLen(l);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDrawn(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(poly);
    return () => io.disconnect();
  }, []);

  return (
    <svg viewBox="0 0 120 60" className="h-28 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--lavender))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--lavender))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={area}
        fill="url(#spark)"
        style={{
          opacity: drawn ? 1 : 0,
          transition: "opacity 900ms ease 300ms",
        }}
      />
      <polyline
        ref={polyRef}
        points={line}
        fill="none"
        stroke="hsl(var(--lavender))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: len || undefined,
          strokeDashoffset: drawn ? 0 : len,
          transition: "stroke-dashoffset 1100ms cubic-bezier(0.16,1,0.3,1)",
        }}
      />
    </svg>
  );
}
