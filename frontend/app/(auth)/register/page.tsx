"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Sparkles } from "lucide-react";

import { authApi } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SocialButtons } from "@/components/auth/social-buttons";
import { AuthLink } from "@/components/auth/auth-link";
import { AuthVisual } from "@/components/auth/auth-visual";
import { RotatingCopy } from "@/components/auth/rotating-copy";
import { Ripple } from "@/components/auth/ripple";

const REGISTER_TITLES = [
  "Create your account",
  "Create your workspace",
  "Start turning data into decisions",
  "Upload your first dataset in under a minute",
];

const inputClass =
  "focus-visible:shadow-[0_0_20px_-6px_hsl(var(--primary)/0.4)] focus-visible:ring-2 focus-visible:ring-primary/30 !h-11";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.register({ email, password, full_name: fullName });
      const token = await authApi.login(email, password);
      setToken(token.access_token);
      setSuccess(true);
      window.setTimeout(() => router.replace("/projects"), 480);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Compact illustration — tablet/mobile only (continuity with the panel) */}
      <div className="mb-8 flex w-full max-w-md justify-center animate-fade-in [animation-delay:60ms] lg:hidden">
        <AuthVisual compact />
      </div>

      <Card size="sm" className="w-full max-w-[32rem] rounded-3xl border border-border/70 bg-card/90 shadow-soft-xl backdrop-blur-xl animate-slide-up [animation-delay:120ms]">
        <CardHeader className="gap-1">
          {/* Brand — shown on mobile where the side panel is hidden */}
          <div className="mb-2 flex items-center gap-2 text-primary lg:hidden">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-tight">
              InsightFlow
            </span>
          </div>
          <RotatingCopy
            as="h1"
            items={REGISTER_TITLES}
            className="text-2xl font-semibold tracking-tight"
          />
          <CardDescription>Start analyzing data from one workspace.</CardDescription>
        </CardHeader>

        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-3">
            <SocialButtons />

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                or continue with email
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                inputSize="lg"
                variant="outline"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ada Lovelace"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                inputSize="lg"
                variant="outline"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                inputSize="lg"
                variant="outline"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={inputClass}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="flex items-center text-muted-foreground transition-colors duration-200 hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 transition-transform duration-200" />
                    ) : (
                      <Eye className="h-4 w-4 transition-transform duration-200" />
                    )}
                  </button>
                }
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-2.5 animate-fade-in [animation-delay:280ms]">
            <Ripple className="w-full rounded-2xl">
              <Button
                type="submit"
                size="lg"
                className="w-full !h-11 transition-transform hover:-translate-y-0.5"
                disabled={loading || success}
                loading={loading}
              >
                {success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </Ripple>
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <AuthLink href="/login">Sign in</AuthLink>
            </p>
          </CardFooter>
        </form>
      </Card>
    </>
  );
}
