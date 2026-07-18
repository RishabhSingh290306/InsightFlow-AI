"use client";

import { scrollToSection } from "@/lib/smooth-scroll";

/**
 * Anchor that smooth-scrolls to an in-page section instead of jumping.
 *
 * Used by the landing-page "See how it works" CTA to glide to the Workflow
 * section with the same animation as the nav. Only used by `app/page.tsx`.
 */
export function ScrollLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.querySelector<HTMLElement>(href);
    if (el) scrollToSection(el);
  };

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
