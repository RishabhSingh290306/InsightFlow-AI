"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function HeroActions() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  if (authed) {
    return (
      <div className="flex gap-3">
        <Button onClick={() => router.push("/projects")}>Open workspace</Button>
        <Button variant="outline" asChild>
          <Link href="/login">Account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Button asChild>
        <Link href="/register">Get started</Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}
