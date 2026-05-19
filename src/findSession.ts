import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");

export async function findLatestSession(cwd: string = process.cwd()): Promise<string | null> {
  const encoded = encodeCwd(cwd);
  const projectDir = join(PROJECTS_ROOT, encoded);
  const direct = await latestJsonlIn(projectDir);
  if (direct) return direct;

  return await fallbackAcrossProjects();
}

function encodeCwd(cwd: string): string {
  return cwd.replace(/[\/.]/g, "-");
}

async function latestJsonlIn(dir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  let bestPath: string | null = null;
  let bestMtime = -Infinity;
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const full = join(dir, name);
    const s = await stat(full);
    if (s.mtimeMs > bestMtime) {
      bestMtime = s.mtimeMs;
      bestPath = full;
    }
  }
  return bestPath;
}

async function fallbackAcrossProjects(): Promise<string | null> {
  let projects: string[];
  try {
    projects = await readdir(PROJECTS_ROOT);
  } catch {
    return null;
  }
  let bestPath: string | null = null;
  let bestMtime = -Infinity;
  for (const project of projects) {
    const candidate = await latestJsonlIn(join(PROJECTS_ROOT, project));
    if (!candidate) continue;
    const s = await stat(candidate);
    if (s.mtimeMs > bestMtime) {
      bestMtime = s.mtimeMs;
      bestPath = candidate;
    }
  }
  return bestPath;
}
