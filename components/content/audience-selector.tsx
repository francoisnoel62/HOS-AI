"use client";

import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";

import { Card } from "@/components/ui/card";
import { audiences } from "@/lib/content/site-copy";
import { cn } from "@/lib/utils";

export function AudienceSelector() {
  const [selectedId, setSelectedId] = useState(audiences[0].id);
  const regionId = useId();
  const selected = audiences.find((audience) => audience.id === selectedId) ?? audiences[0];

  function selectAudience(id: string) {
    setSelectedId(id);
  }

  function moveSelection(currentIndex: number, direction: 1 | -1) {
    const nextIndex = (currentIndex + direction + audiences.length) % audiences.length;
    const next = audiences[nextIndex];
    selectAudience(next.id);
    document.getElementById(`audience-${next.id}`)?.focus();
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="tablist" aria-label="HOS benefits by audience">
        {audiences.map((audience) => {
          const active = selectedId === audience.id;
          return (
            <button
              aria-controls={regionId}
              aria-selected={active}
              className={cn(
                "group flex min-h-24 flex-col justify-between rounded-md border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                active
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]",
              )}
              id={`audience-${audience.id}`}
              key={audience.id}
              onClick={() => selectAudience(audience.id)}
              onKeyDown={(event) => {
                const index = audiences.findIndex((item) => item.id === audience.id);
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  moveSelection(index, 1);
                }
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveSelection(index, -1);
                }
              }}
              role="tab"
              tabIndex={active ? 0 : -1}
              type="button"
            >
              <span className="font-medium">{audience.label}</span>
              <ArrowRight aria-hidden="true" className={cn("self-end", active ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]")} size={16} />
            </button>
          );
        })}
      </div>
      <Card className="mt-4 grid gap-6 p-5 sm:grid-cols-3">
        <div>
          <p className="eyebrow">Current friction</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{selected.friction}</p>
        </div>
        <div>
          <p className="eyebrow">What HOS changes</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{selected.value}</p>
        </div>
        <div aria-labelledby={`audience-${selected.id}`} id={regionId} role="tabpanel">
          <p className="eyebrow">Concrete example</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{selected.example}</p>
        </div>
      </Card>
    </div>
  );
}
