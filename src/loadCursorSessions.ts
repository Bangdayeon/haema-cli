import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseCursorSession } from "./parseCursorSession.js";
import type { Session } from "./types.js";

const CURSOR_PROJECTS_ROOT = join(homedir(), ".cursor", "projects");
const TRANSCRIPT_PATTERN = /^[0-9a-f-]{36}\.jsonl$/i;

export async function loadCursorSessions(filterCwd?: string): Promise<Session[]> {
  const searchRoot = filterCwd
    ? join(CURSOR_PROJECTS_ROOT, encodeCwd(filterCwd), "agent-transcripts")
    : CURSOR_PROJECTS_ROOT;

  const maxDepth = filterCwd ? 2 : 4;
  const files = await findTranscriptFiles(searchRoot, 0, maxDepth);
  const sessions: Session[] = [];

  for (const filePath of files) {
    const sessionId = basename(filePath, ".jsonl");
    try {
      const text = await readFile(filePath, "utf8");
      const session = parseCursorSession(text, sessionId, filterCwd);
      if (session) sessions.push(session);
    } catch (err) {
      console.error(`Cursor 스킵: ${filePath} (${err instanceof Error ? err.message : err})`);
    }
  }

  sessions.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return sessions;
}

// ~/.cursor/projects/{encoded} 형식: /Users/bibi/votra → Users-bibi-votra
function encodeCwd(cwd: string): string {
  return cwd.replace(/^\//, "").replace(/\//g, "-");
}

async function findTranscriptFiles(dir: string, depth: number, max: number): Promise<string[]> {
  if (depth > max) return [];
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
    if (TRANSCRIPT_PATTERN.test(name)) {
      files.push(full);
    } else {
      try {
        const s = await stat(full);
        if (s.isDirectory()) files.push(...(await findTranscriptFiles(full, depth + 1, max)));
      } catch {
        // skip
      }
    }
  }
  return files;
}
