import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parseGeminiSession } from "./parseGeminiSession.js";
import type { Session } from "./types.js";

const GEMINI_TMP_ROOT = join(homedir(), ".gemini", "tmp");
const GEMINI_PROJECTS_JSON = join(homedir(), ".gemini", "projects.json");
const SESSION_PATTERN = /^session-[^/]+\.jsonl$/i;

export async function loadGeminiSessions(filterCwd?: string): Promise<Session[]> {
  const projectsMap = await readProjectsMap();
  const files = await findSessionFiles(GEMINI_TMP_ROOT);

  const sessions: Session[] = [];
  for (const filePath of files) {
    const projectName = extractProjectName(filePath);
    const cwd = projectName ? projectsMap.get(projectName) : undefined;
    if (filterCwd && cwd !== filterCwd) continue;
    try {
      const text = await readFile(filePath, "utf8");
      const session = parseGeminiSession(text, cwd);
      if (session) sessions.push(session);
    } catch (err) {
      console.error(`Gemini 스킵: ${filePath} (${err instanceof Error ? err.message : err})`);
    }
  }

  sessions.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return sessions;
}

// ~/.gemini/projects.json: {"projects":{"/abs/cwd":"project_name"}} → 역매핑: name → cwd
async function readProjectsMap(): Promise<Map<string, string>> {
  try {
    const text = await readFile(GEMINI_PROJECTS_JSON, "utf8");
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.projects)) return new Map();
    const out = new Map<string, string>();
    for (const [cwd, name] of Object.entries(parsed.projects)) {
      if (typeof name === "string") out.set(name, cwd);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function findSessionFiles(root: string): Promise<string[]> {
  return collectFiles(root, 0, 3);
}

async function collectFiles(dir: string, depth: number, max: number): Promise<string[]> {
  if (depth > max) return [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (SESSION_PATTERN.test(name)) {
      results.push(full);
    } else {
      try {
        const s = await stat(full);
        if (s.isDirectory()) results.push(...(await collectFiles(full, depth + 1, max)));
      } catch {
        // skip
      }
    }
  }
  return results;
}

// ~/.gemini/tmp/{project_name}/chats/session-*.jsonl 에서 project_name 추출
function extractProjectName(filePath: string): string | null {
  const chatsDir = dirname(filePath);
  const projectDir = dirname(chatsDir);
  if (dirname(projectDir) !== GEMINI_TMP_ROOT) return null;
  return basename(projectDir);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
