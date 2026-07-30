import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function getOutboxDirectory() {
  return path.join(process.cwd(), "data", "outbox");
}

export async function writeLocalOutboxMessage({ type, recipient, submissionId, kind }: { type: "internal-notification" | "acknowledgement"; recipient: string; submissionId: string; kind: string }) {
  const directory = getOutboxDirectory();
  await mkdir(directory, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${type}-${submissionId}.json`;
  const message = {
    type,
    recipient,
    submissionId,
    kind,
    createdAt: new Date().toISOString(),
    subject: type === "internal-notification" ? `New HOS AI ${kind} submission` : "We received your HOS AI interest",
    text: type === "internal-notification"
      ? `A new ${kind} submission has been stored locally. Review it in the local database.`
      : "Thank you for your interest in HOS AI. We have received your submission and will review it before following up.",
  };
  await writeFile(path.join(directory, filename), `${JSON.stringify(message, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}
