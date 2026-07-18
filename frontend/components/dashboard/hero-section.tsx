"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

function greetingParts() {
  const hour = new Date().getHours();
  if (hour < 12) {
    return {
      greeting: "Good Morning",
      line: "Let's turn today's data into decisions.",
    };
  }
  if (hour < 18) {
    return {
      greeting: "Good Afternoon",
      line: "Hope your analysis is going well.",
    };
  }
  return {
    greeting: "Good Evening",
    line: "Let's discover something valuable tonight.",
  };
}

export function HeroSection({
  userName,
  onNewProject,
  lastProject,
}: {
  userName: string;
  onNewProject: () => void;
  lastProject: { id: number; name: string } | null;
}) {
  const { greeting, line } = greetingParts();
  const displayName = userName && userName !== "there" ? userName : "there";

  return (
    <section className="flex animate-fade-in flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {greeting}, {displayName}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Welcome back to InsightFlow. Ready to uncover insights from your data
          today?
        </p>
        <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-sm font-medium text-primary-foreground/90">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {line}
        </p>
      </div>

      <div className="flex shrink-0 animate-slide-up flex-col gap-3 sm:flex-row [animation-delay:120ms]">
        <Button size="lg" className="sheen hover:-translate-y-0.5" onClick={onNewProject}>
          New Project
        </Button>
        {lastProject ? (
          <Button
            asChild
            size="lg"
            variant="outline"
            className="hover:-translate-y-0.5"
          >
            <Link href={`/projects/${lastProject.id}`}>
              Continue Last Project
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button size="lg" variant="outline" disabled className="cursor-not-allowed">
            Continue Last Project
          </Button>
        )}
      </div>
    </section>
  );
}
