import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // InsightFlow is an authenticated product. Disallow every app route so
      // crawlers never index private data; only the public marketing shell is
      // allowed (everything not matched below).
      disallow: ["/auth/", "/projects/", "/datasets/", "/dashboards/", "/reports/", "/notebooks/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
