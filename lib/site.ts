// On Vercel, fall back to the deployment's own host when no public site URL is configured.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

// `||` rather than `??`: a blank env var (e.g. an empty value in the Vercel dashboard) must also fall back.
export const siteConfig = {
  name: "HOS AI",
  title: "HOS AI — An open standard for hotel operations",
  description:
    "An open standard that lets hotel systems share one picture of operations, so teams see problems before guests do and AI tools work under their rules.",
  url: process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : "http://localhost:3000"),
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/francoisnoel62/HOS-AI",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@hos.ai",
} as const;

export const navigation = [
  { href: "/standard", label: "The Standard" },
  { href: "/demo", label: "Live demo" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/governance", label: "Governance" },
  { href: "/data-cooperative", label: "Data Cooperative" },
] as const;
