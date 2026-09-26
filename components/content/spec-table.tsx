import type { ReactNode } from "react";

// Scrollable specification table; the first cell of each row is its header. Focusable so keyboard users can scroll it.
export function SpecTable({
  label,
  columns,
  rows,
  minWidth = "32rem",
}: {
  label: string;
  columns: string[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
  minWidth?: string;
}) {
  return (
    <div aria-label={label} className="overflow-x-auto border border-[var(--border)]" role="region" tabIndex={0}>
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <caption className="sr-only">{label}</caption>
        <thead className="bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
          <tr>
            {columns.map((column) => (
              <th className="px-4 py-3 font-medium" key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cells: [first, ...rest] }) => (
            <tr className="border-t border-[var(--border)] align-top" key={key}>
              <th className="whitespace-nowrap px-4 py-3 font-mono text-xs font-normal" scope="row">
                {first}
              </th>
              {rest.map((cell, index) => (
                <td className="px-4 py-3 leading-6 text-[var(--muted-foreground)]" key={index}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
