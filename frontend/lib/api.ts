"use client";

import { getToken } from "@/lib/auth";
import type {
  ChartSpec,
  CleaningOperation,
  CleaningPlan,
  DashboardGenerateRequest,
  DashboardPatchRequest,
  DashboardPreviewRequest,
  DashboardDetailRead,
  DashboardRead,
  DashboardView,
  DatasetRead,
  EdaAcceptRequest,
  EdaResult,
  ProjectCreate,
  ReportGenerateRequest,
  ReportRead,
  ReportShareRead,
  ReportUpdateRequest,
  ProjectRead,
  SqlGenerateRequest,
  SqlProposal,
  SqlQueryRecord,
  SqlResult,
  SqlRunRequest,
  Token,
  UserRead,
} from "@/lib/types";

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

export const cleaningApi = {
  // Catalog of available cleaning operations (owner-guarded).
  operations(datasetId: number): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>(`/api/v1/datasets/${datasetId}/cleaning/operations`);
  },
  // AI-propose a plan from the dataset's profile (falls back to rule-based).
  plan(datasetId: number): Promise<CleaningPlan> {
    return request<CleaningPlan>(`/api/v1/datasets/${datasetId}/cleaning/plan`, { method: "POST" });
  },
  // Dry-run a (possibly edited) plan; returns fresh impacts for each op.
  preview(datasetId: number, operations: CleaningOperation[]): Promise<CleaningPlan> {
    return request<CleaningPlan>(`/api/v1/datasets/${datasetId}/cleaning/preview`, {
      method: "POST",
      body: JSON.stringify({ operations }),
    });
  },
  // Execute the approved ops, writing a new immutable child version.
  apply(datasetId: number, operations: CleaningOperation[]): Promise<DatasetRead> {
    return request<DatasetRead>(`/api/v1/datasets/${datasetId}/cleaning/apply`, {
      method: "POST",
      body: JSON.stringify({ operations }),
    });
  },
};

export const edaApi = {
  // Generate (or regenerate) the EDA recommendation for a profiled dataset.
  generate(datasetId: number): Promise<EdaResult> {
    return request<EdaResult>(`/api/v1/datasets/${datasetId}/eda`, { method: "POST" });
  },
  // Fetch the stored EDA result (404 until generated).
  get(datasetId: number): Promise<EdaResult> {
    return request<EdaResult>(`/api/v1/datasets/${datasetId}/eda`);
  },
  // Persist the human's accepted chart ids.
  accept(datasetId: number, acceptedIds: string[]): Promise<EdaResult> {
    return request<EdaResult>(`/api/v1/datasets/${datasetId}/eda`, {
      method: "PATCH",
      body: JSON.stringify({ accepted_ids: acceptedIds }),
    });
  },
};

export const sqlApi = {
  generate(req: SqlGenerateRequest): Promise<SqlProposal> {
    return request<SqlProposal>("/api/v1/sql/generate", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  run(req: SqlRunRequest): Promise<SqlResult> {
    return request<SqlResult>("/api/v1/sql/run", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  history(params: { projectId: number; datasetId?: number; q?: string }): Promise<SqlQueryRecord[]> {
    const qs = new URLSearchParams({ project_id: String(params.projectId) });
    if (params.datasetId) qs.set("dataset_id", String(params.datasetId));
    if (params.q) qs.set("q", params.q);
    return request<SqlQueryRecord[]>(`/api/v1/sql/history?${qs.toString()}`);
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/sql/history/${id}`, { method: "DELETE" });
  },
};

export const reportsApi = {
  generate(req: ReportGenerateRequest): Promise<ReportRead> {
    return request<ReportRead>("/api/v1/reports/generate", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  list(projectId: number): Promise<ReportRead[]> {
    return request<ReportRead[]>(`/api/v1/reports?project_id=${projectId}`);
  },
  get(id: number): Promise<ReportRead> {
    return request<ReportRead>(`/api/v1/reports/${id}`);
  },
  update(id: number, body: ReportUpdateRequest): Promise<ReportRead> {
    return request<ReportRead>(`/api/v1/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/reports/${id}`, { method: "DELETE" });
  },
  async exportMarkdown(id: number): Promise<void> {
    const res = await fetch(`${BASE}/api/v1/reports/${id}/export?format=markdown`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    if (!res.ok) throw new ApiError(res.status, "Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report.md";
    a.click();
    URL.revokeObjectURL(url);
  },
  share(token: string): Promise<ReportShareRead> {
    return request<ReportShareRead>(`/api/v1/reports/share/${token}`);
  },
};

export const dashboardsApi = {
  // Ephemeral preview (M1/M2). Returns a resolved DashboardView.
  preview(req: DashboardPreviewRequest): Promise<DashboardView> {
    return request<DashboardView>("/api/v1/dashboards/preview", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  // Persisted CRUD (M3).
  generate(req: DashboardGenerateRequest): Promise<DashboardRead> {
    return request<DashboardRead>("/api/v1/dashboards/generate", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  list(projectId: number): Promise<DashboardRead[]> {
    return request<DashboardRead[]>(`/api/v1/dashboards/list?project_id=${projectId}`);
  },
  get(id: number): Promise<DashboardDetailRead> {
    return request<DashboardDetailRead>(`/api/v1/dashboards/${id}`);
  },
  update(id: number, body: DashboardPatchRequest): Promise<DashboardRead> {
    return request<DashboardRead>(`/api/v1/dashboards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  regenerate(id: number): Promise<DashboardRead> {
    return request<DashboardRead>(`/api/v1/dashboards/${id}/regenerate`, {
      method: "POST",
    });
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/dashboards/${id}`, { method: "DELETE" });
  },
};
