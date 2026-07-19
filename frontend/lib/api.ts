"use client";

import { clearToken, getToken, handleUnauthorized } from "@/lib/auth";
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
  ChatMessageRequest,
  NotebookRead,
  NotebookDetailRead,
  NotebookShareRead,
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

// Hard timeout so a hung backend can never leave the UI in a perpetual spinner.
const DEFAULT_TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Coerce FastAPI's error `detail` (string or list of {loc,msg,type}) to a string. */
function normalizeDetail(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((e) => {
        const loc = Array.isArray((e as { loc?: unknown }).loc)
          ? ((e as { loc: unknown[] }).loc).filter((p) => p !== "body").join(".")
          : "";
        const msg = (e as { msg?: string }).msg ?? "invalid";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean);
    return msgs.length ? msgs.join("; ") : fallback;
  }
  return fallback;
}

function linkSignals(timeoutMs: number, external?: AbortSignal): {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (typeof AbortSignal.any === "function") {
      return {
        signal: AbortSignal.any([external, controller.signal]),
        timedOut: () => timedOut,
        cleanup: () => clearTimeout(timer),
      };
    }
    external.addEventListener("abort", onExternalAbort);
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener("abort", onExternalAbort);
    },
  };
}

interface RequestOptions extends RequestInit {
  /** Skip the global 401 → login redirect (used by the login call itself). */
  suppressUnauthorized?: boolean;
  /** Override the default request timeout (ms). */
  timeoutMs?: number;
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { suppressUnauthorized, timeoutMs, ...rest } = init;
  const token = getToken();
  const headers = new Headers(rest.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const { signal, timedOut, cleanup } = linkSignals(
    timeoutMs ?? DEFAULT_TIMEOUT_MS,
    rest.signal ?? undefined,
  );

  try {
    const res = await fetch(`${BASE}${path}`, { ...rest, headers, signal });
    if (res.status === 401 && !suppressUnauthorized) {
      handleUnauthorized();
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = normalizeDetail(body, detail);
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(res.status, detail);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError" && timedOut()) {
      throw new ApiError(0, "Request timed out. Please try again.");
    }
    throw err;
  } finally {
    cleanup();
  }
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: "DELETE" }),
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
    const form = new URLSearchParams({ username: email, password });
    return request<Token>("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      suppressUnauthorized: true,
    });
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
    return request<DatasetRead>(`/api/v1/datasets/projects/${projectId}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
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
    const token = getToken();
    const res = await fetch(`${BASE}/api/v1/reports/${id}/export?format=markdown`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
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

export interface SSEEvent {
  event: string; // token | artifact | done | error
  data: Record<string, unknown>;
}

export const chatApi = {
  /** POST /chat/message as SSE. Calls onEvent for each server event, resolves on stream end. */
  async message(
    req: ChatMessageRequest,
    onEvent: (e: SSEEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = getToken();
    const res = await fetch(`${BASE}/api/v1/chat/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(req),
      signal,
    });
    if (res.status === 401) {
      handleUnauthorized();
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, `Chat failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        try {
          onEvent({ event, data: JSON.parse(dataLines.join("")) });
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  },
};

export const notebooksApi = {
  list(projectId: number): Promise<NotebookRead[]> {
    return request<NotebookRead[]>(`/api/v1/chat/notebooks?project_id=${projectId}`);
  },
  create(req: { scope: string; project_id: number; dataset_id?: number | null; title?: string | null }): Promise<NotebookRead> {
    return request<NotebookRead>("/api/v1/chat/notebooks", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
  get(id: number): Promise<NotebookDetailRead> {
    return request<NotebookDetailRead>(`/api/v1/chat/notebooks/${id}`);
  },
  update(id: number, body: { title?: string | null }): Promise<NotebookRead> {
    return request<NotebookRead>(`/api/v1/chat/notebooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  remove(id: number): Promise<void> {
    return request<void>(`/api/v1/chat/notebooks/${id}`, { method: "DELETE" });
  },
  share(token: string): Promise<NotebookShareRead> {
    return request<NotebookShareRead>(`/api/v1/chat/notebooks/share/${token}`);
  },
};
