"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Database,
  FileText,
  Sparkles,
  Table2,
  TrendingUp,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

import { AnimatedSparkline } from "@/components/marketing/animated-sparkline";
import { CountUp } from "@/components/marketing/count-up";
import { Parallax } from "@/components/marketing/parallax";
import { Tilt } from "@/components/marketing/tilt";

/**
 * Animated "zoomed-in workspace" used on the auth pages — a simplified, living
 * echo of the landing-page ProductPreview so a user never feels they left the
 * product. Pure CSS/SVG motion (drifting mesh, floating glass status cards,
 * bar-rise chart, drawn sparkline, count-up KPIs, cursor parallax + tilt) with
 * a compact variant for tablet/mobile. A gentle ~2.6s loop keeps the panel
 * feeling alive (a KPI ticks up, the chart + sparkline redraw, an insight
 * badge pulses). All ambient motion is suppressed under prefers-reduced-motion.
 */

const bars = [44, 66, 40, 80, 56, 90, 64, 98, 74];
const spark = [10, 16, 13, 24, 20, 32, 28, 42, 36, 50, 46, 62];

const KPIS = [
  { label: "Rows analyzed", value: 1.2, decimals: 1, suffix: "M", delta: "+12%" },
  { label: "Queries run", value: 348, delta: "+8%" },
  { label: "Reports shared", value: 27, delta: "+4%" },
];

type Floater = {
  icon: LucideIcon;
  title: string;
  sub: string;
  tint: string;
  cls: string;
  delay: string;
  duration: string;
  rotate: string;
  enter: string;
  strength: number;
};

/* Positions are inset from the illustration edges (never the page edge),
   distributed around the preview like a product shot. Each drifts on its own
   duration with a tiny rotation so the composition feels hand-placed. */
const FLOATERS: Floater[] = [
  {
    icon: UploadCloud,
    title: "Dataset uploaded",
    sub: "Q3_sales.csv",
    tint: "bg-primary/10 text-primary",
    cls: "right-3 top-1",
    delay: "[animation-delay:-1s]",
    duration: "6.5s",
    rotate: "-1.5deg",
    enter: "320ms",
    strength: 12,
  },
  {
    icon: Table2,
    title: "SQL ready",
    sub: "Reviewed by you",
    tint: "bg-lavender/15 text-lavender-foreground",
    cls: "left-3 top-1/3",
    delay: "[animation-delay:-4s]",
    duration: "7.2s",
    rotate: "1deg",
    enter: "440ms",
    strength: -16,
  },
  {
    icon: Sparkles,
    title: "Insight found",
    sub: "Revenue +18% QoQ",
    tint: "bg-primary/10 text-primary",
    cls: "right-5 bottom-20",
    delay: "[animation-delay:-7s]",
    duration: "6s",
    rotate: "1.5deg",
    enter: "560ms",
    strength: 10,
  },
  {
    icon: FileText,
    title: "Report generated",
    sub: "Shared with 6",
    tint: "bg-secondary/40 text-secondary-foreground",
    cls: "left-3 bottom-24",
    delay: "[animation-delay:-3s]",
    duration: "7.6s",
    rotate: "-1deg",
    enter: "680ms",
    strength: -12,
  },
  {
    icon: TrendingUp,
    title: "3 queries run",
    sub: "Revenue trend found",
    tint: "bg-success/15 text-success",
    cls: "right-10 top-1/2",
    delay: "[animation-delay:-5s]",
    duration: "8s",
    rotate: "0.5deg",
    enter: "800ms",
    strength: 14,
  },
];

function WorkspaceCard({ beat, extra }: { beat: number; extra: number }) {
  const kpis = KPIS.map((k, i) =>
    i === KPIS.length - 1 ? { ...k, value: k.value + extra } : k
  );

  return (
    <Tilt className="rounded-3xl">
      <div className="glow-accent overflow-hidden rounded-3xl border border-border/80 bg-card/95 shadow-[0_28px_70px_-22px_rgba(20,40,25,0.22)] backdrop-blur-md">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-destructive/40" />
          <span className="h-3 w-3 rounded-full bg-warning/40" />
          <span className="h-3 w-3 rounded-full bg-success/40" />
          <div className="ml-3 flex h-6 flex-1 items-center rounded-md bg-background px-3 text-2xs text-muted-foreground">
            insightflow.ai/workspace/q3-sales
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {/* KPI tiles */}
          <div className="grid grid-cols-3 gap-2.5">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-border bg-background p-2.5 transition-shadow duration-220 hover:shadow-soft-md"
              >
                <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                  <CountUp
                    value={kpi.value}
                    decimals={kpi.decimals ?? 0}
                    suffix={kpi.suffix ?? ""}
                  />
                </p>
                <p className="text-2xs font-medium text-success">{kpi.delta}</p>
              </div>
            ))}
          </div>

          {/* Chart + sparkline */}
          <div className="grid grid-cols-[1.4fr_1fr] gap-2.5 max-sm:grid-cols-1">
            <div className="relative overflow-hidden rounded-xl border border-border bg-background p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-sm font-medium">Revenue by region</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  Live
                </span>
              </div>
              <div key={`bars-${beat}`} className="flex h-24 items-end gap-1.5">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 origin-bottom rounded-t-md bg-gradient-to-t from-primary/70 to-primary animate-bars-rise"
                    style={{
                      height: `${h}%`,
                      transformOrigin: "bottom",
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                ))}
              </div>
              <div
                aria-hidden
                className="shimmer pointer-events-none absolute inset-0 rounded-xl opacity-60"
              />
              {/* Looping "new insight" badge — appears and fades on a gentle cycle. */}
              <div className="animate-insight-pulse absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary opacity-100 shadow-soft-sm">
                <Sparkles className="h-3 w-3" />
                New insight
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3.5">
              <p className="mb-2.5 text-sm font-medium">Growth trend</p>
              <AnimatedSparkline key={`spark-${beat}`} points={spark} />
            </div>
          </div>

          {/* SQL preview */}
          <div className="rounded-xl border border-border bg-background p-3 font-mono text-2xs leading-relaxed text-muted-foreground">
            <span className="text-primary">SELECT</span> region,{" "}
            <span className="text-primary">SUM</span>(revenue)
            <br />
            <span className="text-primary">FROM</span> q3_sales{" "}
            <span className="text-primary">GROUP BY</span> region
          </div>

          {/* Recent dataset */}
          <div className="rounded-xl border border-border bg-background p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Database className="h-4 w-4 text-primary" />
              Recent dataset
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-sm">
              <span className="font-medium">Q3_sales.csv</span>
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-2xs font-medium text-success">
                Ready
              </span>
            </div>
          </div>
        </div>
      </div>
    </Tilt>
  );
}

function FullVisual({ beat, extra }: { beat: number; extra: number }) {
  return (
    <div className="relative mx-auto w-full max-w-[42rem]">
      {/* Localized ambient glow behind the preview */}
      <div
        aria-hidden
        className="absolute -inset-x-8 -top-8 bottom-0 -z-10 animate-mesh-drift rounded-[2.5rem] gradient-mesh opacity-70 blur-2xl"
      />

      {/* Floating glass status cards — gentle independent drift + parallax +
          tiny rotation + staggered entrance. */}
      {FLOATERS.map((f) => (
        <div
          key={f.title}
          className={`absolute z-20 ${f.cls} animate-fade-in`}
          style={{ transform: f.rotate, animationDelay: f.enter }}
        >
          <Parallax strength={f.strength}>
            <div
              className={`float-card rounded-2xl border border-border/60 bg-card/80 px-3 py-2 shadow-[0_20px_44px_-16px_rgba(20,40,25,0.30)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 animate-float-tiny ${f.delay}`}
              style={{ animationDuration: f.duration }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${f.tint}`}
                >
                  <f.icon className="h-4 w-4" />
                </span>
                <div className="leading-tight">
                  <p className="text-xs font-semibold">{f.title}</p>
                  <p className="text-2xs text-muted-foreground">{f.sub}</p>
                </div>
              </div>
            </div>
          </Parallax>
        </div>
      ))}

      <WorkspaceCard beat={beat} extra={extra} />
    </div>
  );
}

function CompactVisual() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        aria-hidden
        className="absolute -inset-x-6 -top-6 bottom-0 -z-10 animate-mesh-drift rounded-[2rem] gradient-mesh opacity-60 blur-2xl"
      />

      <div className="animate-fade-in [animation-delay:80ms]">
        <div className="float-card rounded-2xl border border-border/70 bg-card/90 px-3.5 py-2.5 shadow-soft-lg backdrop-blur-sm animate-float [animation-delay:-2s]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Insight found</p>
              <p className="text-2xs text-muted-foreground">Revenue up 18% QoQ</p>
            </div>
            <span className="text-lg font-semibold text-primary">+18%</span>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border/70 bg-card/90 p-3 shadow-soft-md backdrop-blur-sm">
        <AnimatedSparkline points={spark} />
      </div>

      {/* Floating chips — entrance + independent drift */}
      <div className="absolute -right-1 -top-4 z-20 animate-fade-in [animation-delay:-1s]">
        <div className="float-card rounded-xl border border-border/70 bg-card/90 px-3 py-2 shadow-soft-lg backdrop-blur-sm animate-float [animation-delay:-3s]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-lavender/15 text-lavender-foreground">
              <Table2 className="h-3.5 w-3.5" />
            </span>
            <p className="text-2xs font-semibold">SQL ready</p>
          </div>
        </div>
      </div>
      <div className="absolute -left-1 -bottom-4 z-20 animate-fade-in [animation-delay:-2s]">
        <div className="float-card rounded-xl border border-border/70 bg-card/90 px-3 py-2 shadow-soft-lg backdrop-blur-sm animate-float [animation-delay:-5s]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UploadCloud className="h-3.5 w-3.5" />
            </span>
            <p className="text-2xs font-semibold">Dataset uploaded</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthVisual({ compact = false }: { compact?: boolean }) {
  // Gentle ~2.6s heartbeat that keeps the illustration feeling alive without
  // distracting from the form. `beat` re-draws the chart/sparkline and `extra`
  // ticks one KPI upward.
  const [beat, setBeat] = useState(0);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setBeat((b) => b + 1);
      setExtra((e) => e + 1);
    }, 2600);
    return () => window.clearInterval(id);
  }, []);

  return compact ? (
    <CompactVisual />
  ) : (
    <FullVisual beat={beat} extra={extra} />
  );
}
