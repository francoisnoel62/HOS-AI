import { useSyncExternalStore } from "react";

// The reader's shell, shared by every command on the page and remembered in this browser. Storage can be missing or
// refuse access (private windows, blocked site data): the choice then lasts until the page closes.

export const shells = [
  { id: "powershell", label: "PowerShell" },
  { id: "cmd", label: "Command Prompt" },
  { id: "bash", label: "macOS / Linux" },
] as const;

export type Shell = (typeof shells)[number]["id"];

const storageKey = "hos-docs-shell";
const changeEvent = "hos-docs-shell-change";
let memory: Shell | undefined;

const isShell = (value: unknown): value is Shell => shells.some((shell) => shell.id === value);

function read(): Shell {
  if (memory) return memory;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (isShell(stored)) return stored;
  } catch {
    // Storage unavailable: fall back to the system.
  }
  return /Windows/i.test(window.navigator.userAgent) ? "powershell" : "bash";
}

export function chooseShell(shell: Shell) {
  memory = shell;
  try {
    window.localStorage.setItem(storageKey, shell);
  } catch {
    // Kept in memory only.
  }
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    memory = undefined;
    notify();
  };
  window.addEventListener(changeEvent, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, notify);
    window.removeEventListener("storage", onStorage);
  };
}

export const useShell = () => useSyncExternalStore(subscribe, read, () => "bash" as Shell);
