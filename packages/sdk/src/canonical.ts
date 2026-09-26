// The canonical form of a JSON value, as RFC 8785 (JSON Canonicalization Scheme) defines it: no whitespace, object
// members sorted by the UTF-16 code units of their names, and numbers and strings written as ECMAScript's JSON.stringify
// writes them. Two parties that parse the same JSON get the same text, whatever its spacing and member order.

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${value} has no JSON form.`);
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    // A lone surrogate is not text: RFC 8785 accepts I-JSON only.
    if (/\p{Cs}/u.test(value)) throw new TypeError(`${JSON.stringify(value)} holds a lone surrogate.`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const members = Object.entries(value).filter(([, member]) => member !== undefined);
    // The default sort compares UTF-16 code units, as RFC 8785 requires.
    const names = members.map(([name]) => name).sort();
    const byName = new Map(members);
    return `{${names.map((name) => `${canonicalize(name)}:${canonicalize(byName.get(name))}`).join(",")}}`;
  }
  throw new TypeError(`A ${typeof value} has no JSON form.`);
}
