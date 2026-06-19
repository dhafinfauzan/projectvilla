import type { MetadataRoute } from "next";

const BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://thetaruvillas.com"
).replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { path: "", priority: 1.0 },
    { path: "/rooms", priority: 0.9 },
    { path: "/experiences", priority: 0.7 },
    { path: "/gallery", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
  ].map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority,
  }));
}
