import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  // InsightFlow is an authenticated product; only the public entry points are
  // included. Authenticated routes (/projects, /datasets, ...) are excluded on
  // purpose.
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/auth/login`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/auth/register`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
