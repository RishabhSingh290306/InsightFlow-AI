/**
 * Smoothly scrolls a section into view, stopping just below the sticky header.
 *
 * Used by the landing-page navigation (`LandingNav`) and the "See how it works"
 * CTA (`ScrollLink`). It does NOT change any other page — it is only imported by
 * landing-page components.
 *
 * Design notes:
 * - Uses a custom requestAnimationFrame easing curve for a natural ~600ms glide
 *   (the feel of Stripe / Vercel / Linear), instead of the browser's
 *   variable-speed native smooth scroll.
 * - Respects `prefers-reduced-motion`: jumps instantly when the user opts out.
 * - Derives the offset from the sticky header's real height so the target
 *   heading always lands cleanly below the navbar.
 */

const SCROLL_DURATION = 600; // ms — sits in the requested 500–800ms band.

function getHeaderOffset(): number {
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  const headerHeight = header ? header.getBoundingClientRect().height : 64;
  return headerHeight + 16; // 16px of breathing room beneath the navbar.
}

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function scrollToSection(target: HTMLElement, duration = SCROLL_DURATION) {
  if (typeof window === "undefined" || !target) return;

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const top =
    target.getBoundingClientRect().top + window.scrollY - getHeaderOffset();

  if (prefersReduced) {
    window.scrollTo(0, top);
    return;
  }

  const startY = window.scrollY;
  const distance = top - startY;
  if (Math.abs(distance) < 1) return;

  const startTime = performance.now();

  const step = (now: number) => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}
