import Link from "next/link";
import { BarChart3, Database, MessageSquareText, Sparkles } from "lucide-react";

import { AuthVisual } from "@/components/auth/auth-visual";

const HIGHLIGHTS = [
  {
    icon: Database,
    label: "Upload anything",
    desc: "CSV & Excel become explorable workspaces instantly.",
  },
  {
    icon: MessageSquareText,
    label: "Ask in plain language",
    desc: "Get SQL, charts, and answers without writing a query.",
  },
  {
    icon: BarChart3,
    label: "Share the outcome",
    desc: "Turn analysis into dashboards and reports your team uses.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative bg-canvas lg:grid lg:h-screen lg:grid-cols-2 lg:overflow-hidden">
      {/* Ambient background — layered radial gradients, mesh, blurred blobs,
          a glass light ray, and a faint film grain. Same palette as the
          landing page so the auth pages feel like a continuation of the product. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 gradient-mesh opacity-40 animate-mesh-drift blur-2xl" />
        <div className="absolute -left-[10%] -top-[12%] h-[34rem] w-[34rem] rounded-full bg-primary/18 blur-3xl animate-blob" />
        <div className="absolute -right-[8%] top-[10%] h-[30rem] w-[30rem] rounded-full bg-lavender/18 blur-3xl animate-blob [animation-delay:-8s]" />
        <div className="absolute bottom-[5%] left-[15%] h-[24rem] w-[24rem] rounded-full bg-secondary/22 blur-3xl animate-blob [animation-delay:-15s]" />
        {/* Glass light ray */}
        <div className="absolute -left-1/4 top-1/3 h-px w-[60%] -rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        {/* Subtle film grain */}
        <div className="auth-noise absolute inset-0" />
      </div>

      {/* Brand panel — single vertical flow with an 8px spacing system:
          logo → badge → heading → description → illustration. The middle is
          flex-1 + min-h-0 so the illustration can shrink to fit the viewport;
          the heading group is shrink-0 so it never overlaps the logo. */}
      <aside className="relative hidden flex-col overflow-hidden border-r border-border/60 bg-canvas lg:flex lg:h-screen lg:p-8 xl:p-10">
        {/* Logo — pinned to the top, fades in first. */}
        <div className="flex shrink-0 animate-fade-in items-center gap-2 text-sm font-semibold tracking-tight [animation-delay:0ms]">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          InsightFlow
        </div>

        {/* Middle — heading group + enlarged illustration, centered as one unit.
            gap-5 keeps the illustration tucked just under the copy (no dead
            space), and the three feature pills are pulled up to straddle the
            dashboard's bottom edge instead of sitting in a separate row. */}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 py-6">
          {/* Heading group — staggered entrance: badge → heading → description. */}
          <div className="flex shrink-0 flex-col items-start gap-4">
            <span className="animate-fade-in inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-2.5 py-1 text-2xs font-medium text-muted-foreground shadow-soft-sm backdrop-blur [animation-delay:120ms]">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Your calm data workspace
            </span>
            <h2 className="animate-fade-in max-w-[18rem] text-3xl font-bold leading-[1.15] tracking-tight xl:text-4xl [animation-delay:200ms]">
              Your data, understood.
            </h2>
            <p className="animate-fade-in max-w-md text-sm leading-relaxed text-muted-foreground [animation-delay:280ms]">
              A calm, focused workspace for profiling, exploring, cleaning, and
              delivering insights — with humans approving every step.
            </p>
          </div>

          {/* Illustration — larger, sits just below the copy. The feature
              pills are pulled up (-mt-12) so they overlap the dashboard's
              lower edge; z-30 keeps them above the floating cards. */}
          <div className="relative min-h-0 animate-fade-in [animation-delay:400ms]">
            <div className="-mt-2">
              <AuthVisual />
            </div>
            <div className="relative z-30 mx-auto -mt-12 grid w-[92%] grid-cols-3 gap-2.5">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="lift rounded-2xl border border-border/60 bg-card/80 px-2.5 py-2.5 text-center shadow-soft-md backdrop-blur-md"
                >
                  <span className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="text-2xs font-semibold leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Form panel — faint ambient bleed-through for continuity. On small
          screens it scrolls if needed; on lg+ it is locked to one viewport.
          The decorative depth layer + floating accents keep the right half from
          feeling empty and balance it against the illustration. */}
      <div className="relative flex min-h-screen items-center justify-center bg-background/40 px-6 py-8 backdrop-blur-sm lg:min-h-0 lg:h-screen lg:overflow-hidden lg:px-10 lg:py-10">
        {/* Depth layer — radial glow, faint grid, glass circles, abstract
            shapes, thin connecting lines and floating dots. Kept extremely
            subtle so it adds atmosphere without distracting from the form. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* Soft green glow behind the card — slow drift. */}
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/12 blur-3xl animate-blob" />
          {/* Connecting light beam — a faint gradient flowing from the
              dashboard (center) toward the login card, tying the two
              halves into one cohesive scene. Breathes very gently. */}
          <div className="absolute left-0 top-1/2 h-[3px] w-[55%] -translate-y-1/2 rotate-[14deg] rounded-full bg-gradient-to-r from-primary/15 via-primary/8 to-transparent blur-[3px] animate-pulse-soft" />
          <div className="absolute left-0 top-1/2 h-72 w-72 -translate-x-1/3 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl animate-pulse-soft" />
          {/* Blurred green glow, offset — slow drift. */}
          <div className="absolute right-[12%] top-[18%] h-72 w-72 rounded-full bg-primary/[0.08] blur-3xl animate-blob [animation-delay:-10s]" />
          {/* Glassmorphism circles */}
          <div className="absolute -right-16 top-12 h-72 w-72 rounded-full border border-primary/10 bg-primary/[0.04] backdrop-blur-md" />
          <div className="absolute -left-10 bottom-16 h-56 w-56 rounded-full border border-lavender/10 bg-lavender/[0.05] backdrop-blur-md" />
          {/* Abstract geometric shape — a thin rotated ring outline */}
          <div className="absolute left-[14%] top-[22%] h-40 w-40 rounded-[2rem] border border-border/60 [transform:rotate(18deg)]" />
          {/* Thin connecting lines */}
          <div className="absolute left-[18%] top-[30%] h-px w-24 rotate-[28deg] bg-gradient-to-r from-primary/15 to-transparent" />
          <div className="absolute right-[20%] bottom-[26%] h-px w-28 -rotate-[22deg] bg-gradient-to-r from-lavender/15 to-transparent" />
          {/* Faint structural grid */}
          <div className="bg-grid absolute inset-0 opacity-[0.06]" />
          {/* Floating particles / dots — gentle independent drift. */}
          <div className="absolute right-24 top-24 h-1.5 w-1.5 rounded-full bg-primary/40 animate-float-tiny [animation-delay:-2s]" />
          <div className="absolute left-28 bottom-24 h-1 w-1 rounded-full bg-lavender/50 animate-float-tiny [animation-delay:-4s]" />
          <div className="absolute right-[30%] bottom-20 h-1 w-1 rounded-full bg-success/40 animate-float-tiny [animation-delay:-6s]" />
          <div className="absolute left-[22%] top-[18%] h-1 w-1 rounded-full bg-primary/30 animate-float-tiny [animation-delay:-3s]" />
        </div>

        {/* Subtle floating status accents on the form side. Smaller and slower
            than the illustration cards; placed in the free top/bottom bands so
            they never cover the form fields. Staggered entrance (logo → … →
            login card) with a gentle independent drift + tiny rotation. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          <div
            className="absolute left-8 top-8 z-10 animate-fade-in"
            style={{ transform: "rotate(-1.5deg)", animationDelay: "320ms" }}
          >
            <div className="animate-float-tiny rounded-full border border-border/70 bg-card/85 px-3 py-1.5 text-2xs font-medium text-muted-foreground shadow-soft-lg backdrop-blur-md [animation-delay:-2s]">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success" />
              Workspace secured
            </div>
          </div>
          <div
            className="absolute right-8 top-12 z-10 animate-fade-in"
            style={{ transform: "rotate(1deg)", animationDelay: "520ms" }}
          >
            <div className="animate-float-tiny rounded-full border border-border/70 bg-card/85 px-3 py-1.5 text-2xs font-medium text-muted-foreground shadow-soft-lg backdrop-blur-md [animation-delay:-5s]">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Encrypted
            </div>
          </div>
          <div
            className="absolute left-8 bottom-10 z-10 animate-fade-in"
            style={{ transform: "rotate(1.5deg)", animationDelay: "720ms" }}
          >
            <div className="animate-float-tiny rounded-full border border-border/70 bg-card/85 px-3 py-1.5 text-2xs font-medium text-muted-foreground shadow-soft-lg backdrop-blur-md [animation-delay:-8s]">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lavender" />
              Human review enabled
            </div>
          </div>
        </div>

        {/* Copyright — pinned bottom-right, visible under the login card. */}
        <p className="absolute bottom-6 right-8 z-10 text-2xs text-muted-foreground">
          © {new Date().getFullYear()} InsightFlow. Built for people who work
          with data.
        </p>

        <div className="relative z-10 flex w-full justify-center">{children}</div>
      </div>
    </main>
  );
}
