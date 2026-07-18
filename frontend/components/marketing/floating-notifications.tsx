"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ambient glass notification cards that make the hero feel alive without any
 * user interaction. One cycles through calm product events on a timer (slide in
 * from the right, pause, fade out); a second gently bobs on the left as a
 * "live" presence card. Both are pointer-events-none and sit in the hero's
 * side margins, so they never disturb the centered content or layout. All
 * motion is suppressed for prefers-reduced-motion.
 */
const NOTES = [
  { icon: Sparkles, title: "Insight found", body: "Revenue up 18% QoQ" },
  { icon: CheckCircle2, title: "Cleaning approved", body: "1,204 rows fixed" },
  { icon: UploadCloud, title: "Dataset ready", body: "Q3_sales.csv profiled" },
  { icon: Bell, title: "Report shared", body: "Sent to 6 teammates" },
];

export function FloatingNotifications({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(false);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        i = (i + 1) % NOTES.length;
        setIndex(i);
        setVisible(true);
      }, 520);
    }, 4400);
    return () => clearInterval(id);
  }, []);

  const note = NOTES[index];

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 hidden lg:block",
        className
      )}
    >
      {/* Cycling event notification — right margin */}
      <div className="absolute right-1 top-[34%]">
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card/70 px-3.5 py-2.5 shadow-soft-lg backdrop-blur-md transition-all duration-500 ease-out-expo",
            visible
              ? "translate-x-0 opacity-100"
              : "pointer-events-none translate-x-8 opacity-0"
          )}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <note.icon className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-xs font-semibold">{note.title}</p>
            <p className="text-2xs text-muted-foreground">{note.body}</p>
          </div>
        </div>
      </div>

      {/* Live presence card — left margin, gently bobbing */}
      <div className="absolute left-1 top-[40%] animate-float-soft">
        <div className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card/70 px-3.5 py-2.5 shadow-soft-lg backdrop-blur-md">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lavender/15 text-lavender-foreground">
            <Users className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              Live
            </p>
            <p className="text-2xs text-muted-foreground">3 analysts online</p>
          </div>
        </div>
      </div>
    </div>
  );
}
