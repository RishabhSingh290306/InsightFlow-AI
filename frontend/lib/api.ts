"use client";

import { getToken } from "@/lib/auth";
import type { DatasetRead, ProjectCreate, ProjectRead, Token, UserRead } from "@/lib/types";

/**
 * Thin fetch wrapper for the InsightFlow backend.
 *
 * In dev, Next.js rewrites `/api/*` to the backend (see next.config.mjs), so we
 * call same-origin paths. If `NEXT_PUBLIC_API_BASE_URL` is set to an absolute
 * URL, requests go there directly instead.
 *
 * Routes are versioned under `/api/v1`.
 */
const BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * Auth endpoints. `register` is JSON and returns the created user (no token),
 * so callers typically log in immediately after. `login` must be form-encoded
 * because the backend validates it with `OAuth2PasswordRequestForm` (field is
 * `username`, not `email`).
 */
export const authApi = {
  async register(body: { email: string; password: string; full_name?: string }): Promise<UserRead> {
    return request<UserRead>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async login(email: string, password: string): Promise<Token> {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? detail;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, detail);
    }
    return res.json() as Promise<Token>;
  },
  me(): Promise<UserRead> {
    return request<UserRead>("/api/v1/auth/me");
  },
};

export const projectsApi = {
  list(): Promise<ProjectRead[]> {
    return request<ProjectRead[]>("/api/v1/projects");
  },
  get(id: number): Promise<ProjectRead> {
    return request<ProjectRead>(`/api/v1/projects/${id}`);
  },
  create(body: ProjectCreate): Promise<ProjectRead> {
    return request<ProjectRead>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/projects/${id}`, { method: "DELETE" });
  },
};

export const datasetsApi = {
  list(projectId: number): Promise<DatasetRead[]> {
    return request<DatasetRead[]>(`/api/v1/datasets/projects/${projectId}`);
  },
  // Upload is multipart/form-data, so it can't use the JSON `request` helper.
  async upload(projectId: number, file: File): Promise<DatasetRead> {
    const token = getToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/v1/datasets/projects/${projectId}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? detail;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, detail);
    }
    return res.json() as Promise<DatasetRead>;
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/datasets/${id}`, { method: "DELETE" });
  },
  analyze(id: number): Promise<DatasetRead> {
    return request<DatasetRead>(`/api/v1/datasets/${id}/understand`, { method: "POST" });
  },
  // Version chain (shared root_id) for the dataset's lineage, ordered by version.
  lineage(id: number): Promise<DatasetRead[]> {
    return request<DatasetRead[]>(`/api/v1/datasets/${id}/lineage`);
  },
};
