// Comparing JSON values, internal to the SDK.

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// A JSON text with sorted keys, so that two equal values give the same text.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

// What differs between two deliveries of one source and id. hosrecordedat is left out: an adapter that records the
// same fact again publishes the same event.
export function differences(first: Record<string, unknown>, second: Record<string, unknown>): string[] {
  const keys = [...new Set([...Object.keys(first), ...Object.keys(second)])].filter((key) => key !== "hosrecordedat");
  return keys.flatMap((key) => {
    if (canonical(first[key]) === canonical(second[key])) return [];
    if (key === "data" && isObject(first.data) && isObject(second.data)) return differences(first.data, second.data).map((member) => `data.${member}`);
    return [key];
  });
}
