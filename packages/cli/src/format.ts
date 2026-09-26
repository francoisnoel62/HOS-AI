// Plain-text output shared by the commands.

export const plural = (count: number, noun: string) =>
  `${count} ${count === 1 ? noun : /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`}`;

// A problem on two lines: its label and message, then its rule and where it is.
export function issueLines(label: string, message: string, { rule, path }: { rule?: string; path?: string }) {
  const where = [rule && `rule ${rule}`, path && `at ${path}`].filter(Boolean).join(" · ");
  return [`  ${label.padEnd(7)} ${message}`, ...(where ? [`          ${where}`] : [])];
}
