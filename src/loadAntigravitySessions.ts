import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { parseAntigravitySession } from "./parseAntigravitySession.js";
import type { Session } from "./types.js";

const ANTIGRAVITY_BRAIN_ROOT = join(homedir(), ".gemini", "antigravity-cli", "brain");
const ANTIGRAVITY_LAST_CONVS = join(
  homedir(),
  ".gemini",
  "antigravity-cli",
  "cache",
  "last_conversations.json",
);
const TRANSCRIPT_PATH = ".system_generated/logs/transcript.jsonl";

export async function loadAntigravitySessions(filterCwd?: string): Promise<Session[]> {
  const cwdBySessionId = await readLastConversations();
  const sessionDirs = await listSessionDirs(ANTIGRAVITY_BRAIN_ROOT);

  const sessions: Session[] = [];
  for (const sessionId of sessionDirs) {
    const cwd = cwdBySessionId.get(sessionId);
    if (filterCwd && cwd !== filterCwd) continue;

    const transcriptPath = join(ANTIGRAVITY_BRAIN_ROOT, sessionId, TRANSCRIPT_PATH);
    try {
      const text = await readFile(transcriptPath, "utf8");
      const session = parseAntigravitySession(text, sessionId, cwd);
      if (session) sessions.push(session);
    } catch {
      // transcript 없는 세션은 스킵
    }
  }

  sessions.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return sessions;
}

// ~/.gemini/antigravity-cli/cache/last_conversations.json: {workspace: sessionId} → sessionId → workspace
async function readLastConversations(): Promise<Map<string, string>> {
  try {
    const text = await readFile(ANTIGRAVITY_LAST_CONVS, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return new Map();
    const out = new Map<string, string>();
    for (const [workspace, sessionId] of Object.entries(parsed)) {
      if (typeof sessionId === "string") out.set(sessionId, workspace);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function listSessionDirs(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    try {
      const s = await stat(join(root, name));
      if (s.isDirectory()) ids.push(name);
    } catch {
      // skip
    }
  }
  return ids;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
