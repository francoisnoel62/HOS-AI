// On Vercel, fall back to the deployment's own host when no public site URL is configured.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

// `||` rather than `??`: a blank env var (e.g. an empty value in the Vercel dashboard) must also fall back.
export const siteConfig = {
  name: "HOS AI",
  title: "HOS AI — Hospitality operations for the agentic era",
  description:
    "An open operational specification for hospitality systems that need interoperable facts, trustworthy control and agent-ready operations.",
  url: process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : "http://localhost:3000"),
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/francoisnoel62/HOS-AI",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@hos.ai",
} as const;

export const navigation = [
  { href: "/standard", label: "The Standard" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/governance", label: "Governance" },
  { href: "/data-cooperative", label: "Data Cooperative" },
] as const;
