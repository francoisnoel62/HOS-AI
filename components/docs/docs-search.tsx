"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import { createSearch, type SearchResult } from "@/lib/docs/search";

type Searcher = ReturnType<typeof createSearch>;

// The index is built at build time from the MDX sources, and fetched the first time a reader uses the search.
let searcher: Promise<Searcher> | undefined;
function loadSearcher() {
  searcher ??= fetch("/docs/tools/search-index.json")
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    })
    .then(createSearch)
    .catch((error) => {
      searcher = undefined;
      throw error;
    });
  return searcher;
}

// Searches the tools documentation. A pasted error message finds its page too: the search matches most of its words.
export function DocsSearch({ onNavigate }: { onNavigate?: () => void }) {
  const inputId = useId();
  const resultsId = useId();
  const latest = useRef("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [failed, setFailed] = useState(false);

  async function update(value: string) {
    setQuery(value);
    latest.current = value;
    try {
      const search = await loadSearcher();
      if (latest.current === value) setResults(search(value));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  const status = !query.trim()
    ? ""
    : failed
      ? "The search is unavailable. Browse the pages instead."
      : results.length === 0
        ? "No result. Try fewer words, or the words of the error message."
        : `${results.length} result${results.length > 1 ? "s" : ""}`;

  return (
    <div role="search">
      <label className="sr-only" htmlFor={inputId}>
        Search the tools documentation
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
          size={15}
        />
        <input
          aria-controls={resultsId}
          autoComplete="off"
          className="h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--card)] pl-8 pr-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          data-docs-search
          id={inputId}
          onChange={(event) => update(event.target.value)}
          onFocus={() => void loadSearcher().catch(() => setFailed(true))}
          onKeyDown={(event) => {
            if (event.key === "Escape") void update("");
          }}
          placeholder="Search or paste an error"
          type="search"
          value={query}
        />
      </div>
      <p className="sr-only" role="status">
        {status}
      </p>
      <div id={resultsId}>
        {query.trim() ? (
          <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--card)]">
            {results.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {results.map((result) => (
                  <li key={result.href}>
                    <Link
                      className="block px-3 py-2.5 hover:bg-[var(--muted)]"
                      href={result.href}
                      onClick={() => {
                        void update("");
                        onNavigate?.();
                      }}
                    >
                      <span className="block text-sm font-medium">{result.heading ?? result.page}</span>
                      {result.heading ? <span className="block text-xs text-[var(--muted-foreground)]">{result.page}</span> : null}
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[var(--muted-foreground)]">{result.snippet}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-2.5 text-sm text-[var(--muted-foreground)]">{status}</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
