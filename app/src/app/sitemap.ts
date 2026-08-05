import type { MetadataRoute } from "next";

const BASE_URL = "https://vibe-studio.example.com";

// SMM-20260601-0012: static dates for rarely-changing pages — stop using new Date()
// which changes on every request and defeats lastmod freshness signal for Googlebot.
const STATIC_LASTMOD = "2026-06-01";

const PROJECT_SLUGS = ["pd", "jf", "vs", "status", "website", "trade"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/portfolio`, lastModified: STATIC_LASTMOD, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/privacy`, lastModified: STATIC_LASTMOD, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: STATIC_LASTMOD, changeFrequency: "yearly", priority: 0.3 },
  ];

  // TODO: generate dynamic slugs from DB (initiatives, proposals, etc.)
  const timelinePages: MetadataRoute.Sitemap = PROJECT_SLUGS.map((slug) => ({
    url: `${BASE_URL}/portfolio/${slug}/timeline`,
    lastModified: STATIC_LASTMOD,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...timelinePages];
}
