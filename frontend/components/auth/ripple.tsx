"use client";

import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type RippleDot = { id: number; x: number; y: number; size: number };

/**
 * Material-style ripple surface. Wraps any clickable element and spawns a soft
 * expanding circle at the pointer on each press. Pure transform/opacity, so it
 * stays on the compositor; never re-renders the children. Suppressed for
 * prefers-reduced-motion. Used by the auth submit and social buttons.
 */
export function Ripple({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [ripples, setRipples] = useState<RippleDot[]>([]);
  const idRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = idRef.current++;
    setRipples((prev) => [...prev, { id, x, y, size }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 650);
  };

  return (
    <span
      className={cn("relative overflow-hidden rounded-2xl", className)}
      onPointerDown={handlePointerDown}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full bg-foreground/20 animate-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
      {children}
    </span>
  );
}
