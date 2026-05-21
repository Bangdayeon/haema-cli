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
  // last_conversations.json은 workspace당 마지막 세션만 추적 — hint 용도로만 사용
  const cwdBySessionId = await readLastConversations();
  const sessionDirs = await listSessionDirs(ANTIGRAVITY_BRAIN_ROOT);

  const sessions: Session[] = [];
  for (const sessionId of sessionDirs) {
    const hintCwd = cwdBySessionId.get(sessionId);
    const transcriptPath = join(ANTIGRAVITY_BRAIN_ROOT, sessionId, TRANSCRIPT_PATH);
    let text: string;
    try {
      text = await readFile(transcriptPath, "utf8");
    } catch {
      continue;
    }

    // last_conversations.json 힌트 우선, 없으면 transcript에서 직접 추출
    const session = parseAntigravitySession(text, sessionId, hintCwd);
    if (!session) continue;

    // cwd 필터 적용 (session_meta 이벤트의 cwd 기준)
    if (filterCwd) {
      const resolvedCwd = session.events.find((e) => e.cwd)?.cwd;
      if (resolvedCwd !== filterCwd) continue;
    }

    sessions.push(session);
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
