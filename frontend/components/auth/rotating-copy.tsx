"use client";

import { useEffect, useState } from "react";

/**
 * Cycles through a list of short phrases (e.g. rotating micro-copy for the
 * auth heading) with a calm fade/slide between each. Snaps to the first line
 * and never animates for users who prefer reduced motion. The first phrase is
 * the server-rendered default, so there is no layout shift or hydration flash.
 */
export function RotatingCopy({
  items,
  className,
  as: Tag = "h1",
}: {
  items: string[];
  className?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % items.length);
        setVisible(true);
      }, 360);
    }, 3600);
    return () => window.clearInterval(interval);
  }, [items]);

  const TagEl = Tag as React.ElementType;

  return (
    <TagEl className={className} aria-live="polite">
      <span
        className={
          "inline-block transition-all duration-300 ease-out-expo " +
          (visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0")
        }
      >
        {items[index]}
      </span>
    </TagEl>
  );
}
