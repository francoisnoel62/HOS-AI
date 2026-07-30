import { CircleDot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/lib/content/site-copy";

const toneByStatus: Record<DocumentStatus, "default" | "active" | "warning" | "success"> = {
  Draft: "warning",
  "In progress": "active",
  Planned: "default",
  Experimental: "warning",
  "Partner-backed": "active",
  Certified: "success",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge variant={toneByStatus[status]}><CircleDot aria-hidden="true" size={11} />{status}</Badge>;
}
