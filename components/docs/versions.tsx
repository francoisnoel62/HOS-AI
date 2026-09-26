import { TerminalOutput } from "@/components/docs/terminal-output";
import { versionLine, versions } from "@/lib/docs/versions";

export function Versions() {
  const rows = [
    ["@hos-ai/cli", versions.cli, "The hos command"],
    ["@hos-ai/sdk", versions.sdk, "The SDK, always the same version as the command"],
    ["HOS", versions.spec, "The draft of the specification both implement"],
    ["Conformance protocol", versions.protocol, "How hos talks to the program it tests"],
    ["Node.js", `${versions.node} or later`, "What both need to run"],
  ];
  return (
    <div aria-label="Versions" className="mt-6 overflow-x-auto border border-[var(--border)]" role="region" tabIndex={0}>
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
          <tr>
            <th className="px-4 py-3 font-medium">What</th>
            <th className="px-4 py-3 font-medium">Version</th>
            <th className="px-4 py-3 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, version, note]) => (
            <tr className="border-t border-[var(--border)]" key={name}>
              <td className="px-4 py-3 font-mono text-xs">{name}</td>
              <td className="px-4 py-3 font-mono text-xs">{version}</td>
              <td className="px-4 py-3 leading-6 text-[var(--muted-foreground)]">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const VersionOutput = () => <TerminalOutput>{versionLine}</TerminalOutput>;
export const CliVersion = () => <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[0.85em]">{versions.cli}</code>;

// What npx asks the first time it runs the package.
export const NpxPrompt = () => (
  <TerminalOutput>{["Need to install the following packages:", `@hos-ai/cli@${versions.cli}`, "Ok to proceed? (y)"].join("\n")}</TerminalOutput>
);

export const SpecVersionOutput = () => <TerminalOutput>{versions.spec}</TerminalOutput>;
