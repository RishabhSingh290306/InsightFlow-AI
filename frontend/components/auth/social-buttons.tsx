"use client";

import { useState } from "react";
import { Github, Loader2 } from "lucide-react";

import { Ripple } from "@/components/auth/ripple";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

const buttonClass =
  "group relative inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-border/80 bg-background/60 text-sm font-medium text-foreground transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-soft-md active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

function Spinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}

/**
 * Social sign-in entries. These are polished UI mockups only — no OAuth is
 * wired up yet. Clicking shows a tasteful "coming soon" notice and a brief
 * loading state, then settles. Both providers disable while one is in flight.
 */
export function SocialButtons() {
  const [loadingProvider, setLoadingProvider] = useState<
    null | "google" | "github"
  >(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handle(provider: "google" | "github") {
    if (loadingProvider) return;
    setNotice(null);
    setLoadingProvider(provider);
    window.setTimeout(() => {
      setLoadingProvider(null);
      setNotice(
        provider === "google"
          ? "Google sign-in will be added in the final production release."
          : "GitHub sign-in will be added in the final production release."
      );
    }, 900);
  }

  const busy = loadingProvider !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <Ripple className={busy ? "rounded-xl pointer-events-none" : "rounded-xl"}>
          <button
            type="button"
            onClick={() => handle("google")}
            disabled={busy}
            className={buttonClass}
          >
            {loadingProvider === "google" ? (
              <Spinner />
            ) : (
              <span className="transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6">
                <GoogleIcon />
              </span>
            )}
            <span className="transition-transform duration-200 group-hover:scale-[1.03]">
              Google
            </span>
          </button>
        </Ripple>

        <Ripple className={busy ? "rounded-xl pointer-events-none" : "rounded-xl"}>
          <button
            type="button"
            onClick={() => handle("github")}
            disabled={busy}
            className={buttonClass}
          >
            {loadingProvider === "github" ? (
              <Spinner />
            ) : (
              <Github className="h-4 w-4 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6" />
            )}
            <span className="transition-transform duration-200 group-hover:scale-[1.03]">
              GitHub
            </span>
          </button>
        </Ripple>
      </div>

      <p
        className={
          "min-h-[1rem] text-center text-2xs text-muted-foreground transition-all duration-300 ease-out-expo " +
          (notice ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")
        }
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
    </div>
  );
}
