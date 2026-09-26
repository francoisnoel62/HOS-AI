// Full-text search over the tools documentation, in the browser. The index has one entry per section of each page; a
// query matches its words, so a pasted error message finds its page even when its file names differ from the reader's.

export type SearchEntry = {
  href: string;
  page: string;
  heading?: string;
  text: string;
  // Troubleshooting sections come first when they match as well as another page.
  boost?: number;
};

export type SearchResult = SearchEntry & { score: number; snippet: string };

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "with",
]);

export function normalize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .trim();
}

export const tokenize = (text: string) =>
  normalize(text)
    .split(" ")
    .filter((word) => word.length > 1 && !stopWords.has(word));

function snippetOf(text: string, words: string[], length = 160) {
  const lower = text.toLowerCase();
  const at = words.map((word) => lower.indexOf(word)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, start + length);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

// Prepares the index once, and returns the search. Short queries must match every word, the last one as a prefix while
// it is being typed. Longer ones, such as a pasted message, need most of their words.
export function createSearch(entries: SearchEntry[]) {
  const prepared = entries.map((entry) => ({
    entry,
    fields: [
      { words: new Set(tokenize(entry.page)), weight: 2 },
      { words: new Set(tokenize(entry.heading ?? "")), weight: 3 },
      { words: new Set(tokenize(entry.text)), weight: 1 },
    ],
    content: normalize(`${entry.heading ?? ""} ${entry.text}`),
  }));

  return function search(query: string, limit = 8): SearchResult[] {
    const words = tokenize(query);
    if (words.length === 0) return [];
    const needed = words.length <= 2 ? words.length : Math.ceil(words.length * 0.6);
    const phrase = normalize(query);

    const results: SearchResult[] = [];
    for (const { entry, fields, content } of prepared) {
      let matched = 0;
      let score = 0;
      words.forEach((word, index) => {
        const last = index === words.length - 1;
        const weight = fields
          .filter((field) => field.words.has(word) || (last && [...field.words].some((candidate) => candidate.startsWith(word))))
          .reduce((sum, field) => sum + field.weight, 0);
        if (weight === 0) return;
        matched += 1;
        score += weight;
      });
      if (matched < needed) continue;
      if (phrase.length > 3 && content.includes(phrase)) score += 10;
      results.push({ ...entry, score: score * (entry.boost ?? 1), snippet: snippetOf(entry.text, words) });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  };
}
