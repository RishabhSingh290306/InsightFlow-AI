import type { CSSProperties } from "react";

import {
  ArrowRight,
  BarChart3,
  Database,
  MessageSquareText,
  Sparkles,
  Table2,
  Upload,
  Wand2,
} from "lucide-react";

import HeroActions from "@/components/hero-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Database,
    title: "Dataset Overview",
    desc: "Auto-detect column types, quality issues, and likely targets the moment you upload.",
  },
  {
    icon: Wand2,
    title: "Human-in-the-Loop Cleaning",
    desc: "Review, approve, or tweak each cleaning step before it ever touches your data.",
  },
  {
    icon: BarChart3,
    title: "EDA & Visualizations",
    desc: "Summaries, distributions, and chart recommendations tailored to your dataset.",
  },
  {
    icon: MessageSquareText,
    title: "Ask in Plain Language",
    desc: "Explore data conversationally — get SQL, charts, and clear answers in return.",
  },
  {
    icon: Table2,
    title: "SQL Workspace",
    desc: "Generate, review, and run SQL you can read and edit. Follow-ups continue the thread.",
  },
  {
    icon: Sparkles,
    title: "Dashboards & Reports",
    desc: "Turn analysis into shareable dashboards and reports your whole team can use.",
  },
];

const WORKFLOW = [
  { icon: Upload, step: "01", title: "Upload", desc: "Bring any CSV or Excel file into a workspace." },
  { icon: MessageSquareText, step: "02", title: "Explore", desc: "Ask questions in plain language and get SQL, charts, and answers." },
  { icon: Sparkles, step: "03", title: "Deliver", desc: "Build dashboards and reports to share with your team." },
];

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Ambient premium background — subtle, non-distracting. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.10),transparent_70%)]"
      />

      {/* Hero */}
      <section className="container flex flex-col items-center gap-6 px-6 pb-12 pt-20 text-center sm:pt-28">
        <span className="animate-fade-in inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          A modern data analysis workspace
        </span>

        <h1 className="animate-slide-up max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
          The fastest way to understand, analyze, and{" "}
          <span className="text-primary">visualize</span> your data.
        </h1>

        <p className="animate-slide-up max-w-2xl text-balance text-lg text-muted-foreground [animation-delay:80ms]">
          Upload a dataset, explore it with natural language, generate SQL, build
          dashboards, clean data, and create reports — all from one place.
        </p>

        <div className="animate-slide-up flex flex-col items-center gap-3 [animation-delay:160ms] sm:flex-row">
          <HeroActions />
        </div>
      </section>

      {/* Workflow */}
      <section className="container px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {WORKFLOW.map(({ icon: Icon, step, title, desc }) => (
            <div
              key={title}
              className="animate-stagger flex flex-col gap-3 rounded-xl border bg-card/60 p-5 text-left shadow-sm"
              style={{ ["--delay" as string]: "0ms" } as CSSProperties}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold tracking-widest text-muted-foreground">
                  {step}
                </span>
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container flex flex-col gap-8 px-6 pb-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Everything you need to go from raw data to insight
          </h2>
          <p className="text-muted-foreground">
            One workspace for profiling, exploration, cleaning, and delivery — with
            humans approving every step.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <Card
              key={title}
              className="card-hover group animate-stagger border bg-card/60 shadow-sm"
              style={{ ["--delay" as string]: `${i * 60}ms` } as CSSProperties}
            >
              <CardHeader>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <Icon className="h-5 w-5" />
                </span>
                <CardTitle className="pt-1 text-lg">{title}</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="mx-auto flex flex-col items-center gap-2 pt-2 text-center">
          <p className="text-sm text-muted-foreground">
            Ready to explore your first dataset?
          </p>
          <HeroActions primaryLabel="Get started free" />
        </div>
      </section>
    </main>
  );
}
