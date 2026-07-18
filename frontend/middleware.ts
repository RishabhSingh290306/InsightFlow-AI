import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require an authenticated session. API routes and auth pages
// handle their own auth (the API returns 401 → client redirects), so they
// are intentionally excluded here.
const PROTECTED_PREFIXES = ["/projects", "/dashboards", "/reports", "/notebooks"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }
  // Middleware can't read localStorage, so it gates on the presence of the
  // non-HttpOnly session marker cookie set on login (see lib/auth.ts).
  const hasSession = request.cookies.has("insightflow_session");
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/projects/:path*", "/dashboards/:path*", "/reports/:path*", "/notebooks/:path*"],
};
