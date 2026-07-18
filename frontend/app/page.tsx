import Link from "next/link";
import {
  ArrowDown,
  BarChart3,
  Database,
  Github,
  Linkedin,
  Mail,
  MessageSquareText,
  Sparkles,
  Table2,
  Upload,
  Wand2,
} from "lucide-react";

import { ProductPreview } from "@/components/marketing/product-preview";
import { HeroBackground } from "@/components/marketing/hero-background";
import { Reveal } from "@/components/marketing/reveal";
import { SpotlightCard } from "@/components/marketing/spotlight-card";
import { FloatingNotifications } from "@/components/marketing/floating-notifications";
import { LandingNav } from "@/components/marketing/landing-nav";
import { ScrollLink } from "@/components/marketing/scroll-link";
import HeroActions from "@/components/hero-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "InsightFlow — Your calm data workspace",
  description:
    "Upload data, understand it, and build reports your team can trust. InsightFlow turns every dataset into clear analysis and shareable reports — with you approving each step.",
};

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
    title: "Visual exploration",
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
      <header
        data-site-header
        className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-md"
      >
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            InsightFlow
          </Link>
          <LandingNav />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button variant="cta" size="sm" asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative container flex flex-col items-center gap-7 px-6 pb-10 pt-16 text-center sm:pt-24">
        <HeroBackground />
        <FloatingNotifications />

        <span className="animate-fade-in inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Your calm data workspace
        </span>

        <h1 className="animate-slide-up max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
          Upload your data. Understand it.{" "}
          <span className="text-primary">Build reports.</span>
        </h1>

        <p className="animate-slide-up max-w-2xl text-balance text-lg text-muted-foreground [animation-delay:80ms]">
          InsightFlow turns every dataset into clear analysis and reports your
          team can trust — with you approving each step along the way.
        </p>

        <div className="animate-slide-up flex flex-col items-center gap-3 [animation-delay:160ms] sm:flex-row">
          <HeroActions />
        </div>

        <ScrollLink
          href="#workflow"
          className="animate-fade-in group mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-160ms hover:text-foreground [animation-delay:240ms]"
        >
          See how it works
          <ArrowDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
        </ScrollLink>
      </section>

      {/* Product preview */}
      <section id="product" className="container scroll-mt-20 px-6 pb-20 pt-4">
        <Reveal>
          <ProductPreview />
        </Reveal>
      </section>

      {/* Workflow */}
      <section id="workflow" className="container scroll-mt-20 px-6 pb-16">
        <Reveal className="mx-auto mb-10 flex max-w-2xl flex-col items-center gap-2 text-center">
          <span className="text-2xs font-semibold uppercase tracking-widest text-primary">
            Workflow
          </span>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            From raw file to shared insight
          </h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {WORKFLOW.map(({ icon: Icon, step, title, desc }, i) => (
            <Reveal
              key={title}
              delay={i * 90}
              className="h-full"
            >
              <SpotlightCard className="h-full">
                <div className="card-hover group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-soft-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-[background-color,transform] duration-220ms group-hover:scale-105 group-hover:bg-primary/15">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-semibold tracking-widest text-muted-foreground">
                      {step}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="capabilities" className="container scroll-mt-20 flex flex-col gap-10 px-6 pb-24">
        <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
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
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={(i % 3) * 80} className="h-full">
              <SpotlightCard className="h-full">
                <Card className="card-hover group flex h-full flex-col border bg-card shadow-soft-sm">
                  <CardHeader className="flex-1">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-[background-color,transform] duration-220ms group-hover:scale-105 group-hover:bg-primary/15">
                      <Icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="pt-1 text-lg">{title}</CardTitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
                  </CardHeader>
                </Card>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container px-6 pb-24">
        <Reveal className="relative overflow-hidden rounded-3xl border border-border bg-card p-10 text-center shadow-soft-lg sm:p-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 gradient-mesh opacity-60"
          />
          <h2 className="mx-auto max-w-xl text-balance text-3xl font-bold tracking-tight">
            Ready to explore your first dataset?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Create a workspace, upload a file, and let InsightFlow handle the
            heavy lifting.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <HeroActions primaryLabel="Get started free" />
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60">
        <div className="container grid gap-10 px-6 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              InsightFlow
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              The calm workspace where every dataset becomes clear analysis and
              reports your team can trust.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              Product
            </p>
            <Link href="#product" className="text-sm text-muted-foreground transition-colors duration-160ms hover:text-foreground">
              Overview
            </Link>
            <Link href="#workflow" className="text-sm text-muted-foreground transition-colors duration-160ms hover:text-foreground">
              Workflow
            </Link>
            <Link href="#capabilities" className="text-sm text-muted-foreground transition-colors duration-160ms hover:text-foreground">
              Capabilities
            </Link>
            <Link href="/register" className="text-sm text-muted-foreground transition-colors duration-160ms hover:text-foreground">
              Get started
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              Connect
            </p>
            <a
              href="https://github.com/RishabhSingh290306"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-160ms hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/rishabhsingh290306/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-160ms hover:text-foreground"
            >
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </a>
            <a
              href="mailto:rs290306@gmail.com"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-160ms hover:text-foreground"
            >
              <Mail className="h-4 w-4" />
              Email
            </a>
          </div>
        </div>

        <div className="border-t border-border/60">
          <div className="container flex flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} InsightFlow. All rights reserved.</p>
            <p>Designed &amp; Developed by Rishabh Singh</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
