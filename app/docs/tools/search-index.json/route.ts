import { buildSearchIndex } from "@/lib/docs/content";

// The search index of the tools documentation, written once at build time.
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildSearchIndex());
}
