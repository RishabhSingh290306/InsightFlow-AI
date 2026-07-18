"use client";

const TOKEN_KEY = "insightflow_token";
// Non-HttpOnly marker cookie. Middleware can't read localStorage, so this lets
// middleware gate protected routes on *presence* of a session. It holds no token
// value (the real JWT stays in localStorage), so it's not a credential leak.
const SESSION_COOKIE = "insightflow_session";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  // Mark the session for middleware gating (presence only).
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=2592000; SameSite=Lax`;
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  // Clear the middleware session marker.
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

/** Centralized handler for an expired/invalid auth token. */
export function handleUnauthorized(): void {
  clearToken();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.replace("/login");
  }
}
