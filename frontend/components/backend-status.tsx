"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

type Health = { status: string; service: string; environment: string };

export function BackendStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Health>("/health")
      .then(setHealth)
      .catch((e: ApiError) => setError(e.message));
  }, []);

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">Backend status</p>
        {error ? (
          <p className="mt-1 font-medium text-destructive">Unreachable — {error}</p>
        ) : health ? (
          <p className="mt-1 font-medium text-primary">
            {health.status} · {health.service} ({health.environment})
          </p>
        ) : (
          <p className="mt-1 font-medium text-muted-foreground">Checking…</p>
        )}
      </CardContent>
    </Card>
  );
}
