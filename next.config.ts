import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

// The pages of /docs/tools are written in MDX, under content/docs/tools. Turbopack takes the plugins by name.
const withMDX = createMDX({ options: { remarkPlugins: [["remark-gfm", {}]] } });

export default withMDX(nextConfig);
