import Link from "next/link";
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

import { ProductPreview } from "@/components/marketing/product-preview";
import HeroActions from "@/components/hero-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FEATURES = [
  {
    icon: Database,
    title: "Dataset overview",
    desc: "Auto-detect column types, quality issues, and likely targets the moment you upload.",
  },
  {
    icon: Wand2,
    title: "Human-in-the-loop cleaning",
    desc: "Review, approve, or tweak each cleaning step before it ever touches your data.",
  },
  {
    icon: BarChart3,
    title: "EDA & visualizations",
    desc: "Summaries, distributions, and chart recommendations tailored to your dataset.",
  },
  {
    icon: MessageSquareText,
    title: "Ask in plain language",
    desc: "Explore data conversationally — get SQL, charts, and clear answers in return.",
  },
  {
    icon: Table2,
    title: "SQL workspace",
    desc: "Generate, review, and run SQL you can read and edit. Follow-ups continue the thread.",
  },
  {
    icon: Sparkles,
    title: "Dashboards & reports",
    desc: "Turn analysis into shareable dashboards and reports your whole team can use.",
  },
];

const WORKFLOW = [
  {
    icon: Upload,
    step: "01",
    title: "Upload",
    desc: "Bring any CSV or Excel file into a workspace in seconds.",
  },
  {
    icon: MessageSquareText,
    step: "02",
    title: "Explore",
    desc: "Ask questions in plain language and get SQL, charts, and answers.",
  },
  {
    icon: Sparkles,
    step: "03",
    title: "Deliver",
    desc: "Build dashboards and reports to share with your team.",
  },
];

export default function HomePage() {
  return (
    <main className="bg-canvas relative flex min-h-screen flex-col overflow-hidden">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            InsightFlow
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {["Product", "Workflow", "Capabilities"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-160ms hover:bg-accent hover:text-accent-foreground"
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container flex flex-col items-center gap-7 px-6 pb-8 pt-16 text-center sm:pt-24">
        <span className="animate-fade-in inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          A modern data analysis workspace
        </span>

        <h1 className="animate-slide-up max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
          The fastest way to understand, analyze, and{" "}
          <span className="text-primary">visualize</span> your data.
        </h1>

        <p className="animate-slide-up max-w-2xl text-balance text-lg text-muted-foreground [animation-delay:80ms]">
          Upload a dataset, explore it with natural language, generate SQL, build
          dashboards, clean data, and create reports — all from one calm, focused
          workspace.
        </p>

        <div className="animate-slide-up flex flex-col items-center gap-3 [animation-delay:160ms] sm:flex-row">
          <HeroActions />
        </div>
      </section>

      {/* Product preview */}
      <section className="container px-6 pb-20 pt-4">
        <div className="animate-scale-in">
          <ProductPreview />
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="container px-6 pb-16">
        <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-2 text-center">
          <span className="text-2xs font-semibold uppercase tracking-widest text-primary">
            Workflow
          </span>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            From raw file to shared insight
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {WORKFLOW.map(({ icon: Icon, step, title, desc }, i) => (
            <div
              key={title}
              className="card-hover group flex animate-stagger flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-soft-sm"
              style={{ animationDelay: `${i * 80}ms` } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-220ms group-hover:bg-primary/15">
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
      <section id="capabilities" className="container flex flex-col gap-10 px-6 pb-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
          <span className="text-2xs font-semibold uppercase tracking-widest text-primary">
            Capabilities
          </span>
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
              className="card-hover group animate-stagger border bg-card shadow-soft-sm"
              style={{ animationDelay: `${i * 60}ms` } as React.CSSProperties}
            >
              <CardHeader>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-220ms group-hover:bg-primary/15">
                  <Icon className="h-5 w-5" />
                </span>
                <CardTitle className="pt-1 text-lg">{title}</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-10 text-center shadow-soft-lg sm:p-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 gradient-mesh opacity-60"
          />
          <h2 className="mx-auto max-w-xl text-balance text-3xl font-bold tracking-tight">
            Ready to explore your first dataset?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Create a workspace, upload a file, and let InsightFlow do the heavy lifting.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <HeroActions primaryLabel="Get started free" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            InsightFlow
          </div>
          <p>© {new Date().getFullYear()} InsightFlow. Built for people who work with data.</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
