"use client";

import { Lightbulb } from "lucide-react";

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
    <section className="overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-soft-sm glow-accent">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Lightbulb className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold tracking-tight">Today&apos;s AI Tip</h2>
      </div>
      <RotatingCopy
        as="p"
        items={TIPS}
        className="min-h-[3.5rem] text-sm leading-relaxed text-muted-foreground"
      />
    </section>
  );
}
