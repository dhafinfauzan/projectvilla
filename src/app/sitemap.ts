import type { MetadataRoute } from "next";
import { villas } from "@/lib/villas";

const BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://thetaruvillas.com"
).replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "", priority: 1.0 },
    { path: "/villas", priority: 0.9 },
    { path: "/booking", priority: 0.9 },
    { path: "/experiences", priority: 0.7 },
    { path: "/gallery", priority: 0.6 },
    { path: "/contact", priority: 0.6 },
  ].map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority,
  }));

  const villaRoutes: MetadataRoute.Sitemap = villas.map((villa) => ({
    url: `${BASE_URL}/villas/${villa.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...villaRoutes];
}
