import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractTimeline } from "../extractTimeline.js";
import { loadProjectSessions } from "../loadProjectSessions.js";
import { loadSessions } from "../loadSessions.js";
import { openBrowser } from "../openBrowser.js";
import { renderReplayHtml, type SessionTimeline } from "../renderReplay.js";
import { resolveProjectDir } from "../resolveProjectDir.js";
import { resolveSessionPath } from "../resolveSession.js";
import { serveHtml, type ServeHandle } from "../serveHtml.js";
import type { Session } from "../types.js";
import { watchDirChanges } from "../watchDir.js";
import { watchFileChanges } from "../watchFile.js";

type ReplayOptions = {
  out?: string;
  watch?: boolean;
  project?: string | boolean;
  serve?: number | boolean;
  open?: boolean;
};

export async function replayCommand(file: string | undefined, options: ReplayOptions): Promise<void> {
  const isProject = options.project !== undefined;
  const projectInput = typeof options.project === "string" ? options.project : undefined;
  const wantsServe = options.serve !== undefined;
  const port = typeof options.serve === "number" ? options.serve : 5179;
  const watch = !!options.watch || wantsServe;
  const outPath = options.out
    ? resolve(options.out)
    : wantsServe
      ? null
      : resolve("replay.html");

  let source: string;
  let load: () => Promise<Session[]>;
  if (isProject) {
    const resolved = await resolveProjectDir(projectInput);
    source = resolved.dir;
    load = () => loadProjectSessions(resolved.dir, { filterCwd: resolved.filterCwd });
  } else {
    source = await resolveSessionPath(file);
    load = () => loadSessions(source);
  }

  let serveHandle: ServeHandle | null = null;
  if (wantsServe) {
    serveHandle = await serveHtml("<!doctype html><body>loading...</body>", port);
    console.log(`로컬 서버: ${serveHandle.url}`);
    if (options.open !== false) openBrowser(serveHandle.url);
  }

  await render(load, source, outPath, serveHandle);

  if (!watch) return;

  const label = isProject ? `${source} 디렉토리` : source;
  console.log(`\n(watch) ${label} 감지 중... Ctrl+C 로 종료`);

  const onChange = async (): Promise<void> => {
    const t = new Date().toLocaleTimeString();
    try {
      await render(load, source, outPath, serveHandle, `[${t}] `);
    } catch (err) {
      console.error(`[${t}] 재생성 실패: ${err instanceof Error ? err.message : err}`);
    }
  };

  if (isProject) {
    watchDirChanges(source, onChange, { pattern: /\.jsonl$/ });
  } else {
    watchFileChanges(source, onChange);
  }
}

async function render(
  load: () => Promise<Session[]>,
  source: string,
  outPath: string | null,
  serveHandle: ServeHandle | null,
  prefix = ""
): Promise<void> {
  const sessions = await load();
  if (sessions.length === 0) {
    console.error(`${prefix}세션이 없어요: ${source}`);
    return;
  }

  const sessionTimelines: SessionTimeline[] = sessions.map((session) => ({
    session,
    timeline: extractTimeline(session),
  }));

  const html = renderReplayHtml(sessionTimelines, source);
  if (outPath) await writeFile(outPath, html, "utf8");
  if (serveHandle) serveHandle.update(html);

  const totalItems = sessionTimelines.reduce((n, s) => n + s.timeline.length, 0);
  const target = outPath ?? serveHandle?.url ?? "(메모리)";
  console.log(`${prefix}${target} · 세션 ${sessions.length}개 · 이벤트 ${totalItems}개`);
}
