/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Proxy API calls to the backend during local dev so the browser hits the
  // same origin (no CORS preflight needed). Flip to direct calls by setting
  // NEXT_PUBLIC_API_BASE_URL instead.
  async rewrites() {
    const target = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    return [
      { source: "/health", destination: `${target}/health` },
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
