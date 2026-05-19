import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { buildSession } from "./buildSession.js";
import { loadSessions } from "./loadSessions.js";
import type { RawEvent, Session } from "./types.js";

export type LoadProjectOptions = {
  // 지정되면 이 cwd (또는 하위 경로) 에서 발생한 이벤트만 남기고,
  // 남은 이벤트가 0개인 세션은 드롭. cwd 가 없는 이벤트는 남은 이벤트가 있는 세션에 한해 함께 유지.
  // Claude Code 가 같은 폴더에 저장한 세션이라도 도중에 cwd 가 다른 디렉토리로 바뀐 이벤트들이
  // 섞여 있을 수 있어, 세션 단위로만 거르면 다른 프로젝트 이벤트까지 같이 올라가요.
  filterCwd?: string;
};

export async function loadProjectSessions(
  dir: string,
  options: LoadProjectOptions = {}
): Promise<Session[]> {
  const entries = await readdir(dir);
  const jsonlPaths = entries
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(dir, name));

  const all: Session[] = [];
  for (const path of jsonlPaths) {
    try {
      const sessions = await loadSessions(path);
      all.push(...sessions);
    } catch (err) {
      console.error(`스킵: ${path} (${err instanceof Error ? err.message : err})`);
    }
  }

  const filtered = options.filterCwd
    ? scopeSessionsToCwd(all, options.filterCwd)
    : all;

  filtered.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return filtered;
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
    out.push(kept.length === session.events.length ? session : buildSession(session.id, kept));
  }
  return out;
}

function eventMatchesCwd(ev: RawEvent, cwd: string, prefix: string): boolean {
  if (typeof ev.cwd !== "string") return false;
  return ev.cwd === cwd || ev.cwd.startsWith(prefix);
}
