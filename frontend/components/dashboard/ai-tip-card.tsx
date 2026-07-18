"use client";

import { Lightbulb, Sparkles } from "lucide-react";

import { RotatingCopy } from "@/components/auth/rotating-copy";

const TIPS = [
  "Good dashboards answer one question, not ten.",
  "Use filters before building charts.",
  "Correlation does not imply causation.",
  "Start every analysis by profiling your data first.",
  "A clear chart beats a clever one — keep it simple.",
];

export function AITipCard() {
  return (
    <section className="card-hover group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-soft-sm">
      {/* Decorative gradient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.05] to-transparent"
      />

      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-deep text-primary-foreground shadow-soft-sm">
            <Lightbulb className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-2xs font-semibold uppercase tracking-widest text-primary">
              Tip of the day
            </span>
            <h2 className="text-sm font-semibold tracking-tight">Today&apos;s Insight</h2>
          </div>
          <Sparkles
            className="ml-auto h-4 w-4 text-primary/40 transition-transform duration-300 group-hover:rotate-12"
            aria-hidden
          />
        </div>

        <div className="relative mt-4">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-1 -top-2 text-3xl leading-none text-primary/15"
          >
            &ldquo;
          </span>
          <RotatingCopy
            as="p"
            items={TIPS}
            className="relative min-h-[4.5rem] pl-4 text-sm leading-relaxed text-foreground/90"
          />
        </div>
      </div>
    </section>
  );
}
