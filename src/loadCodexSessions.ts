import { readFile, readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { buildSession } from "./buildSession.js";
import { parseCodexRollout } from "./parseCodexRollout.js";
import type { RawEvent, Session } from "./types.js";

const ROLLOUT_PATTERN = /^rollout-[^/]+\.jsonl$/i;
const MAX_DEPTH = 4; // sessions/YYYY/MM/DD/rollout-*.jsonl

export async function loadCodexSessions(
  dir: string,
  filterCwd?: string
): Promise<Session[]> {
  const files = await findRolloutFiles(dir, 0);
  const sessions: Session[] = [];
  for (const path of files) {
    try {
      const text = await readFile(path, "utf8");
      const session = parseCodexRollout(text);
      if (session) sessions.push(session);
    } catch (err) {
      console.error(`스킵: ${path} (${err instanceof Error ? err.message : err})`);
    }
  }

  const filtered = filterCwd
    ? scopeSessionsToCwd(sessions, filterCwd)
    : sessions;

  filtered.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return filtered;
}

async function findRolloutFiles(dir: string, depth: number): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (ROLLOUT_PATTERN.test(name)) {
      files.push(full);
    } else {
      try {
        const s = await stat(full);
        if (s.isDirectory()) {
          const sub = await findRolloutFiles(full, depth + 1);
          files.push(...sub);
        }
      } catch {
        // skip
      }
    }
  }
  return files;
}

function scopeSessionsToCwd(sessions: Session[], cwd: string): Session[] {
  const prefix = cwd + sep;
  const out: Session[] = [];
  for (const session of sessions) {
    const hasMatch = session.events.some((ev) => eventMatchesCwd(ev, cwd, prefix));
    if (!hasMatch) continue;
    const kept = session.events.filter(
      (ev) => typeof ev.cwd !== "string" || eventMatchesCwd(ev, cwd, prefix)
    );
    if (kept.length === 0) continue;
    out.push(
      kept.length === session.events.length ? session : buildSession(session.id, kept)
    );
  }
  return out;
}

function eventMatchesCwd(ev: RawEvent, cwd: string, prefix: string): boolean {
  if (typeof ev.cwd !== "string") return false;
  return ev.cwd === cwd || ev.cwd.startsWith(prefix);
}
