import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

import { MAX_DEPTH, MAX_ENTRIES, SKIP_DIRS } from "./scanLimits.js";

export type ClaudeFileKind = "CLAUDE" | "AGENTS" | "SKILL";
export type ClaudeFileScope = "global" | "project-root" | "subdir";

export type DiscoveredFile = {
  absPath: string;
  displayPath: string;
  kind: ClaudeFileKind;
  scope: ClaudeFileScope;
};

const ROOT_FILE_KIND: Record<string, ClaudeFileKind> = {
  "CLAUDE.md": "CLAUDE",
  "CLAUDE.local.md": "CLAUDE",
  "AGENTS.md": "AGENTS",
};

const NESTED_FILE_KIND: Record<string, ClaudeFileKind> = {
  "CLAUDE.md": "CLAUDE",
  "CLAUDE.local.md": "CLAUDE",
  "AGENTS.md": "AGENTS",
  "SKILL.md": "SKILL",
};

export async function discoverClaudeFiles(cwd: string): Promise<DiscoveredFile[]> {
  const results: DiscoveredFile[] = [];
  await collectGlobal(results);
  await collectProjectRoot(results, cwd);
  await collectSubdir(results, cwd);
  return results;
}

async function collectGlobal(out: DiscoveredFile[]): Promise<void> {
  const home = homedir();
  await collectRootFiles(home, "~", out);

  const dotClaude = join(home, ".claude");
  await collectRootFiles(dotClaude, "~/.claude", out);

  const skillsRoot = join(dotClaude, "skills");
  await walkSkills(skillsRoot, "~/.claude/skills", out);
}

async function collectRootFiles(
  dir: string,
  displayPrefix: string,
  out: DiscoveredFile[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if ((e.isFile() || e.isSymbolicLink()) && e.name in ROOT_FILE_KIND) {
      out.push({
        absPath: join(dir, e.name),
        displayPath: `${displayPrefix}/${e.name}`,
        kind: ROOT_FILE_KIND[e.name],
        scope: "global",
      });
    }
  }
}

async function walkSkills(
  absDir: string,
  displayPrefix: string,
  out: DiscoveredFile[]
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isFile() && e.name === "SKILL.md") {
      out.push({
        absPath: join(absDir, e.name),
        displayPath: `${displayPrefix}/${e.name}`,
        kind: "SKILL",
        scope: "global",
      });
    } else if (e.isDirectory() && !e.isSymbolicLink() && !SKIP_DIRS.has(e.name)) {
      await walkSkills(join(absDir, e.name), `${displayPrefix}/${e.name}`, out);
    }
  }
}

async function collectProjectRoot(out: DiscoveredFile[], cwd: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(cwd, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if ((e.isFile() || e.isSymbolicLink()) && e.name in ROOT_FILE_KIND) {
      out.push({
        absPath: join(cwd, e.name),
        displayPath: e.name,
        kind: ROOT_FILE_KIND[e.name],
        scope: "project-root",
      });
    }
  }
}

async function collectSubdir(out: DiscoveredFile[], cwd: string): Promise<void> {
  const counter = { count: 0 };
  await walkSubdir(cwd, cwd, 0, counter, out);
}

async function walkSubdir(
  absDir: string,
  cwd: string,
  depth: number,
  counter: { count: number },
  out: DiscoveredFile[]
): Promise<void> {
  if (depth > MAX_DEPTH || counter.count > MAX_ENTRIES) return;

  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    counter.count += 1;
    if (counter.count > MAX_ENTRIES) break;
    if (e.isSymbolicLink()) continue;
    if (e.isFile()) {
      if (depth === 0) continue;
      const kind = NESTED_FILE_KIND[e.name];
      if (!kind) continue;
      const abs = join(absDir, e.name);
      out.push({
        absPath: abs,
        displayPath: relative(cwd, abs).split(sep).join("/"),
        kind,
        scope: "subdir",
      });
    } else if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walkSubdir(join(absDir, e.name), cwd, depth + 1, counter, out);
    }
  }
}
