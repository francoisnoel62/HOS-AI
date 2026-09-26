import type { ReactNode } from "react";

import { DocsNav } from "@/components/docs/docs-nav";

export default function ToolsDocumentationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-5 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 lg:px-8">
      <DocsNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
