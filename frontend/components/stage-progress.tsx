"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Advances an index 0..steps-1 on an interval while `running` is true.
 * Resets to 0 when not running. Used to give long operations a living,
 * progressive feel even when the backend takes the same amount of time.
 */
export function useCycle(steps: number, ms: number, running: boolean): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!running || steps <= 1) {
      setI(0);
      return;
    }
    setI(0);
    const id = setInterval(() => setI((p) => Math.min(p + 1, steps - 1)), ms);
    return () => clearInterval(id);
  }, [running, steps, ms]);
  return i;
}

export function StageProgress({
  stages,
  activeIndex,
  className,
}: {
  stages: string[];
  activeIndex: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-col gap-2.5", className)}>
      {stages.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="h-3 w-3" />
              ) : active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>
            <span
              className={cn(
                "transition-colors duration-200",
                active ? "font-medium text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground",
              )}
            >
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Centered, non-blocking overlay shown while a long operation runs. */
export function GeneratingOverlay({
  title,
  description,
  stages,
  activeIndex,
}: {
  title: string;
  description?: string;
  stages: string[];
  activeIndex: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overlay-enter fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
    >
      <div className="dialog-enter w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-5">
          <StageProgress stages={stages} activeIndex={activeIndex} />
        </div>
      </div>
    </div>
  );
}
