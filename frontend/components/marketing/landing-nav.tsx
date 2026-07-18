"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { scrollToSection } from "@/lib/smooth-scroll";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Workflow", href: "#workflow" },
  { label: "Capabilities", href: "#capabilities" },
];

/**
 * Landing-page primary navigation.
 *
 * - Click → smooth-scrolls to the matching section (see `scrollToSection`).
 * - Scroll → a lightweight scroll-spy highlights the section currently in view,
 *   giving the nav an "active" pill that transitions smoothly.
 * - Hover → a soft background pill with a subtle scale, animated over 200ms.
 *
 * This component is only used by the marketing landing page (`app/page.tsx`).
 */
export function LandingNav() {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const header = document.querySelector<HTMLElement>("[data-site-header]");
        const triggerLine = (header ? header.getBoundingClientRect().height : 64) + 24;

        // The active item is the last section whose top has scrolled past the
        // trigger line just below the navbar.
        let current = "";
        for (const item of NAV) {
          const el = document.querySelector<HTMLElement>(item.href);
          if (!el) continue;
          if (el.getBoundingClientRect().top - triggerLine <= 0) {
            current = item.label;
          }
        }

        // When parked at the very bottom (footer), force the last section active
        // so Capabilities never gets "stuck" as the page ends.
        const atBottom =
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 4;
        if (atBottom && NAV.length) {
          current = NAV[NAV.length - 1].label;
        }

        setActive(current);
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    const el = document.querySelector<HTMLElement>(href);
    if (el) scrollToSection(el);
  };

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
      {NAV.map((item) => {
        const isActive = active === item.label;
        return (
          <a
            key={item.label}
            href={item.href}
            aria-current={isActive ? "true" : undefined}
            onClick={(e) => handleClick(e, item.href)}
            className={cn(
              "relative rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground",
              "transition-all duration-200 ease-out-expo",
              "hover:bg-accent/70 hover:text-foreground hover:scale-[1.03]",
              isActive &&
                "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
            )}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
