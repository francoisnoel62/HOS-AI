import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/standard", "/roadmap", "/governance", "/manifesto", "/data-cooperative", "/participate", "/demo", "/docs", "/docs/core", "/docs/events", "/changelog", "/privacy", "/legal", "/accessibility"];
  return routes.map((route) => ({ url: `${siteConfig.url}${route}`, lastModified: new Date(), changeFrequency: "monthly", priority: route === "" ? 1 : 0.7 }));
}
