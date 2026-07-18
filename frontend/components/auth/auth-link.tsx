import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Inline link with a smooth, left-anchored underline that wipes in on hover —
 * used for the auth conversion links ("Create one" / "Sign in" / "Forgot?").
 * Server-rendered (pure CSS hover), so it costs nothing at runtime.
 */
export function AuthLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative font-medium text-primary transition-colors after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-200 after:ease-out-expo hover:after:scale-x-100",
        className
      )}
    >
      {children}
    </Link>
  );
}
