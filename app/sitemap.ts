import type { MetadataRoute } from "next";

import { toolsPages } from "@/lib/docs/tools";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "",
    "/standard",
    "/standard/htng-opentravel",
    "/roadmap",
    "/governance",
    "/manifesto",
    "/data-cooperative",
    "/participate",
    "/demo",
    "/demo/room-out-of-order",
    "/demo/late-checkout",
    "/demo/mews",
    "/demo/apaleo",
    "/demo/cloudbeds",
    "/docs",
    "/docs/core",
    "/docs/events",
    // The tools documentation enters the sitemap page by page, once each is written.
    ...toolsPages.filter((item) => item.written).map((item) => item.href),
    "/changelog",
    "/privacy",
    "/terms",
    "/legal",
    "/accessibility",
  ];
  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
