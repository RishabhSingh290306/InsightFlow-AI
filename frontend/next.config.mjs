/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Proxy API calls to the backend. The client always calls same-origin
  // (/api/...); Next proxies those requests server-side to INTERNAL_API_URL, so
  // no backend hostname ever reaches the browser and no CORS preflight is
  // needed. INTERNAL_API_URL is a *server-side* var baked into the route
  // manifest at build time — set it at build (e.g. via a Docker build arg).
  // Override the client's BASE with NEXT_PUBLIC_API_BASE_URL only when you want
  // the browser to call the backend directly (e.g. local dev without the proxy).
  async rewrites() {
    const target = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
    return [
      { source: "/health", destination: `${target}/health` },
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
  // Defensive response headers for every page/asset response. connect-src is
  // locked to 'self' because the client only ever calls same-origin /api (Next
  // proxies to the backend server-side). 'unsafe-inline' for scripts/styles is
  // required by Next's bootstrap; if you later inline-hash the framework
  // scripts you can tighten this further.
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const baseHeaders = [
      {
        key: "Content-Security-Policy",
        value:
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
      },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ];
    // HSTS only over real HTTPS in production — browsers ignore it on http.
    if (isProd) {
      baseHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [
      {
        source: "/:path*",
        headers: baseHeaders,
      },
    ];
  },
};

export default nextConfig;
