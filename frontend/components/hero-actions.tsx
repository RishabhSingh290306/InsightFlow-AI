"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function HeroActions({
  primaryLabel = "Get started",
}: {
  primaryLabel?: string;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  if (authed) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => router.push("/projects")} size="lg">
          Open workspace
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/login">Account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button asChild size="lg">
        <Link href="/register">{primaryLabel}</Link>
      </Button>
      <Button variant="outline" size="lg" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}
