import { isPending, security } from "@/lib/legal";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-static";

// RFC 9116. Not served until a real security contact is set in lib/legal.ts: a placeholder contact would mislead reporters.
export function GET() {
  if (isPending(security.contact)) return new Response("Not found.", { status: 404 });
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + 180);
  const body = [
    `Contact: mailto:${security.contact}`,
    `Expires: ${expires.toISOString()}`,
    `Policy: ${siteConfig.githubUrl}/blob/master/SECURITY.md`,
    `Canonical: ${siteConfig.url}/.well-known/security.txt`,
    "Preferred-Languages: en, fr",
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
