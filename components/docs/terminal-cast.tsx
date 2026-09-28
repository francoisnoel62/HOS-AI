"use client";

import { Play } from "lucide-react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { renderOutputLine } from "@/components/docs/terminal-output";
import { Badge } from "@/components/ui/badge";

// A command and what hos printed, replayed as in a terminal: the command typed, then the output line by line. Written in
// MDX as a fenced block with the language "cast", whose first line is the command after "$ ".
//
// Everything is on the page from the start, so it reads as a transcript, prints, and needs no script; the replay only
// hides lines for a few seconds. Readers who ask for reduced motion get no replay.

const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export function TerminalCast({ text }: { text: string }) {
  const [first, ...output] = text.replace(/\s+$/, "").split(/\r?\n/);
  const command = first.replace(/^\$ /, "");
  const reducedMotion = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(motionQuery).matches,
    () => true,
  );
  // How much is shown: the characters of the command, then the lines of output. Everything by default.
  const [typed, setTyped] = useState(command.length);
  const [lines, setLines] = useState(output.length);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function replay() {
    window.clearTimeout(timer.current);
    let characters = 0;
    let shown = 0;
    setTyped(0);
    setLines(0);
    const step = () => {
      if (characters < command.length) {
        characters = Math.min(command.length, characters + 3);
        setTyped(characters);
        timer.current = window.setTimeout(step, 30);
      } else if (shown < output.length) {
        shown += 1;
        setLines(shown);
        timer.current = window.setTimeout(step, shown === 1 ? 400 : 120);
      }
    };
    timer.current = window.setTimeout(step, 200);
  }

  return (
    <figure className="my-5 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--code)] text-[var(--code-foreground)]">
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <Badge>Terminal</Badge>
        {reducedMotion ? null : (
          <button
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[0.7rem] text-[var(--code-muted)] transition-colors hover:text-[var(--code-foreground)]"
            onClick={replay}
            type="button"
          >
            <Play aria-hidden="true" size={12} />
            Replay
          </button>
        )}
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 sm:text-sm" tabIndex={0}>
        <code>
          <span className="text-[var(--code-muted)] select-none">$ </span>
          {command.slice(0, typed)}
          <span className={typed < command.length ? "invisible" : undefined}>{command.slice(typed)}</span>
          {"\n"}
          {output.map((line, index) => (
            <Fragment key={index}>
              <span className={index < lines ? undefined : "invisible"}>{renderOutputLine(line)}</span>
              {index < output.length - 1 ? "\n" : null}
            </Fragment>
          ))}
        </code>
      </pre>
    </figure>
  );
}
