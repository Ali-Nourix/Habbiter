/* ==========================================================================
   FENCE
   Finding a ```habbiter fence in a file, and writing one back.

   Two things make this more than a line number. Obsidian's section info
   points at the section the block belongs to, and inside a callout that is
   the callout — the line it names is "> [!note]", not a fence. And every
   line inside a callout or a quote carries a "> " that is part of the
   markdown, not of the block: strip it and the fence is fine, forget to put
   it back and the callout ends where the tracker starts.

   So a write locates the fence within its section, remembers the prefix
   each line came with, and hands it back.
   ========================================================================== */

import { BLOCK_LANGUAGE } from "./config";

export interface FenceSpan {
  /** Index of the opening fence line. */
  start: number;
  /** Index of the closing fence line. */
  end: number;
  /** What every line of this block is prefixed with — "", "> ", "> > ". */
  prefix: string;
  /** The fence's own body, with the prefix taken off each line. */
  body: string;
}

/** What a block knows about itself, for telling two fences apart. */
export interface FenceMatch {
  /** Exact, when the block has one: ids are unique. */
  id?: string;
  /** For a block with no id yet, the source the processor was handed. */
  source?: string;
}

const PREFIX = /^([ \t]*(?:>[ \t]?)*)/;

export function splitPrefix(line: string): { prefix: string; rest: string } {
  const prefix = PREFIX.exec(line)?.[1] ?? "";
  return { prefix, rest: line.slice(prefix.length) };
}

function openingLength(rest: string): number {
  const match = new RegExp(`^(\`{3,})\\s*${BLOCK_LANGUAGE}\\s*$`).exec(rest);
  return match ? match[1].length : 0;
}

function closes(rest: string, ticks: number): boolean {
  const match = /^(`{3,})\s*$/.exec(rest);
  return match !== null && match[1].length >= ticks;
}

/* Scans the section for the block's own fence. Callers pass the widest
   range they have; a section that turns out to hold several habbiter blocks
   is why the match matters. */
export function findFence(
  lines: string[],
  from: number,
  to: number,
  match: FenceMatch,
): FenceSpan | null {
  const first = Math.max(0, from);
  const last = Math.min(lines.length - 1, to);
  let fallback: FenceSpan | null = null;

  for (let i = first; i <= last; i++) {
    const open = splitPrefix(lines[i] ?? "");
    const ticks = openingLength(open.rest);
    if (!ticks) continue;

    let close = -1;
    for (let j = i + 1; j <= last; j++) {
      if (closes(splitPrefix(lines[j] ?? "").rest, ticks)) {
        close = j;
        break;
      }
    }
    if (close < 0) continue;

    const body = lines
      .slice(i + 1, close)
      .map((line) => splitPrefix(line).rest)
      .join("\n");
    const span: FenceSpan = { start: i, end: close, prefix: open.prefix, body };

    if (isMatch(body, match)) return span;
    /* Only a fence with no id of its own is a safe guess. One that has an
       id belongs to a tracker that is not the one asking, and writing over
       it would move somebody else's block. */
    if (!hasId(body)) fallback ??= span;
    i = close;
  }

  /* No id to go on and nothing matched by content: the first habbiter fence
     in the section is the only sensible guess, and is right whenever the
     section holds exactly one. */
  return match.id ? null : fallback;
}

function isMatch(body: string, match: FenceMatch): boolean {
  if (match.id) {
    return body
      .split("\n")
      .some((line) => new RegExp(`^\\s*-?\\s*id:\\s*["']?${escape(match.id!)}["']?\\s*$`).test(line));
  }
  if (match.source === undefined) return false;
  /* A block with no id is told apart by what it says. Two identical ones
     are interchangeable anyway: whichever is claimed first, the next render
     finds the other still unclaimed. */
  return body.trim() === match.source.trim() && !hasId(body);
}

function hasId(body: string): boolean {
  return /^\s*-?\s*id:/m.test(body);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* The fence has to outlast whatever is inside it. A tracker carrying a
   `text:` with a code block of its own would close its own fence at three
   backticks, so the fence takes one more than the longest run the body
   contains. */
export function fenceFor(body: string): string {
  let longest = 0;
  for (const line of body.split("\n")) {
    const run = /^\s*(`{3,})/.exec(line);
    if (run) longest = Math.max(longest, run[1].length);
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/** The replacement lines for a fence, carrying the prefix back in. */
export function fenceLines(body: string, prefix: string): string[] {
  const ticks = fenceFor(body);
  const lines = [`${ticks}${BLOCK_LANGUAGE}`, ...body.split("\n"), ticks];
  if (!prefix) return lines;
  /* A blank line inside a callout still needs its ">" or the callout ends
     there, but it should not be left with a trailing space either. */
  return lines.map((line) => (line ? prefix + line : prefix.trimEnd()));
}
