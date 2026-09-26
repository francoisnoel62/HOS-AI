import type { MDXContent } from "mdx/types";

// The MDX text of each page, by its file in lib/docs/tools.ts. Listed one by one, so the bundler knows every file.
export const pageContent: Record<string, () => Promise<{ default: MDXContent }>> = {
  index: () => import("@/content/docs/tools/index.mdx"),
  concepts: () => import("@/content/docs/tools/concepts.mdx"),
  install: () => import("@/content/docs/tools/install.mdx"),
  quickstart: () => import("@/content/docs/tools/quickstart.mdx"),
  "read-a-report": () => import("@/content/docs/tools/read-a-report.mdx"),
  "guides/validate": () => import("@/content/docs/tools/guides/validate.mdx"),
  "guides/replay": () => import("@/content/docs/tools/guides/replay.mdx"),
  "guides/test-a-consumer": () => import("@/content/docs/tools/guides/test-a-consumer.mdx"),
  "guides/check-a-producer": () => import("@/content/docs/tools/guides/check-a-producer.mdx"),
  "guides/sign-and-publish": () => import("@/content/docs/tools/guides/sign-and-publish.mdx"),
  "guides/ci": () => import("@/content/docs/tools/guides/ci.mdx"),
  "guides/build-an-adapter": () => import("@/content/docs/tools/guides/build-an-adapter.mdx"),
  cli: () => import("@/content/docs/tools/cli.mdx"),
  sdk: () => import("@/content/docs/tools/sdk.mdx"),
  protocol: () => import("@/content/docs/tools/protocol.mdx"),
  rules: () => import("@/content/docs/tools/rules.mdx"),
  glossary: () => import("@/content/docs/tools/glossary.mdx"),
  troubleshooting: () => import("@/content/docs/tools/troubleshooting.mdx"),
  help: () => import("@/content/docs/tools/help.mdx"),
  authoring: () => import("@/content/docs/tools/authoring.mdx"),
};
