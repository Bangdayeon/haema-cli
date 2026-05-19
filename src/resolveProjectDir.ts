import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");

export type ResolvedProject = {
  // 실제 jsonl 들이 있는 디렉토리 (예: ~/.claude/projects/-Users-bibi-votra)
  dir: string;
  // 필터링에 쓸 원본 cwd (예: /Users/bibi/votra). 인코딩 폴더가 아닌 경우 undefined → 필터 없음.
  filterCwd?: string;
};

export async function resolveProjectDir(input?: string): Promise<ResolvedProject> {
  const cwd = input ? resolve(input) : process.cwd();

  if (cwd.startsWith(PROJECTS_ROOT + "/") && (await hasJsonl(cwd))) {
    // 사용자가 이미 인코딩된 projects 디렉토리를 직접 지정 → 전체 사용, 필터 없음.
    return { dir: cwd };
  }

  const encoded = join(PROJECTS_ROOT, encodeCwd(cwd));
  if (await hasJsonl(encoded)) {
    if (!input) console.error(`(프로젝트 자동 탐색) ${encoded}`);
    return { dir: encoded, filterCwd: cwd };
  }

  if (await isDir(cwd)) {
    if (await hasJsonl(cwd)) return { dir: cwd };
  }

  throw new Error(
    `프로젝트의 세션을 찾지 못했어요.\n` +
      `  cwd: ${cwd}\n` +
      `  찾아본 곳: ${encoded}\n` +
      `이 cwd 에서 Claude Code 를 한 번이라도 실행했나요?`
  );
}

function encodeCwd(cwd: string): string {
  return cwd.replace(/[\/.]/g, "-");
}

async function isDir(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function hasJsonl(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.some((name) => name.endsWith(".jsonl"));
  } catch {
    return false;
  }
}
