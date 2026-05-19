import {
  postClaudeFiles,
  readClaudeFilesConfig,
  type ClaudeFileUpload,
} from "../claudeFilesClient.js";
import { discoverClaudeFiles } from "../discoverClaudeFiles.js";
import { loadProjectSessions } from "../loadProjectSessions.js";
import { loadSessions } from "../loadSessions.js";
import { readClaudeFile } from "../readClaudeFile.js";
import { resolveProjectDir } from "../resolveProjectDir.js";
import { resolveSessionPath } from "../resolveSession.js";
import type { Session } from "../types.js";
import {
  chunkPayloads,
  diffSessions,
  postBatch,
  readUploadConfig,
  type SessionPayload,
  type UploadConfig,
} from "../uploadClient.js";
import { watchDirChanges } from "../watchDir.js";
import { watchFileChanges } from "../watchFile.js";

type UploadOptions = {
  watch?: boolean;
  project?: string | boolean;
  claudeFiles?: boolean;
};

export async function uploadCommand(file: string | undefined, options: UploadOptions): Promise<void> {
  const config = await readUploadConfig();
  const isProject = options.project !== undefined;
  const projectInput = typeof options.project === "string" ? options.project : undefined;

  let source: string;
  let load: () => Promise<Session[]>;
  let filterLabel = "";
  let claudeFilesCwd: string | undefined;
  if (isProject) {
    const resolved = await resolveProjectDir(projectInput);
    source = resolved.dir;
    load = () => loadProjectSessions(resolved.dir, { filterCwd: resolved.filterCwd });
    if (resolved.filterCwd) {
      filterLabel = `\ncwd 필터: ${resolved.filterCwd} (이 cwd 의 이벤트가 있는 세션만 업로드)`;
      claudeFilesCwd = resolved.filterCwd;
    }
  } else {
    source = await resolveSessionPath(file);
    load = () => loadSessions(source);
  }

  console.log(`업로드 대상: ${config.url}`);
  if (config.apiKey) console.log("Authorization: Bearer ***");
  console.log(`소스: ${source}${filterLabel}`);

  const sent = new Map<string, number>();
  const enableClaudeFiles = options.claudeFiles !== false && !!claudeFilesCwd;

  try {
    await flushOnce(load, source, config, sent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.watch) {
      console.error(`초기 업로드 실패: ${msg}`);
    } else {
      throw err;
    }
  }

  if (enableClaudeFiles && claudeFilesCwd) {
    try {
      await uploadClaudeFilesOnce(claudeFilesCwd);
    } catch (err) {
      // claude-files 실패해도 세션 업로드는 이미 완료. warning 만.
      console.error(`AI 파일 업로드 실패 (세션은 OK): ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!options.watch) return;

  const label = isProject ? `${source} 디렉토리` : source;
  console.log(`\n(watch) ${label} 감지 중... Ctrl+C 로 종료`);

  const onChange = async (): Promise<void> => {
    const t = new Date().toLocaleTimeString();
    try {
      await flushOnce(load, source, config, sent, `[${t}] `);
    } catch (err) {
      console.error(`[${t}] 업로드 실패: ${err instanceof Error ? err.message : err}`);
    }
  };

  if (isProject) {
    watchDirChanges(source, onChange, { pattern: /\.jsonl$/ });
  } else {
    watchFileChanges(source, onChange);
  }
}

async function flushOnce(
  load: () => Promise<Session[]>,
  source: string,
  config: UploadConfig,
  sent: Map<string, number>,
  prefix = ""
): Promise<void> {
  const sessions = await load();
  if (sessions.length === 0) {
    console.error(`${prefix}세션이 없어요: ${source}`);
    return;
  }
  const diff = diffSessions(sessions, sent);
  if (diff.length === 0) {
    console.log(`${prefix}변경 없음 (세션 ${sessions.length}개 동기화 됨)`);
    return;
  }
  const totalNew = diff.reduce((n, s) => n + s.events.length, 0);
  const chunks = chunkPayloads(diff);
  const multi = chunks.length > 1;
  const totalStart = Date.now();
  const concurrency = Math.min(readConcurrency(), chunks.length);

  if (multi) {
    console.log(
      `${prefix}업로드 시작 · 세션 ${diff.length}개 / 이벤트 ${fmt(totalNew)}개 · ${chunks.length} chunks · 동시성 ${concurrency}`
    );
  }

  const indexWidth = String(chunks.length).length;
  let cursor = 0;
  let firstError: Error | null = null;
  let completed = 0;
  let sentEvents = 0;

  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        while (firstError === null) {
          const idx = cursor++;
          if (idx >= chunks.length) return;
          const chunk = chunks[idx];
          const chunkEvents = chunk.reduce((n, s) => n + s.events.length, 0);
          const tag = `[${String(idx + 1).padStart(indexWidth, " ")}/${chunks.length}]`;
          const chunkStart = Date.now();
          try {
            await postBatch(
              config,
              { source, sessions: chunk },
              multi ? { retryLog: (msg) => console.error(`  ${tag} ${msg}`) } : undefined
            );
          } catch (err) {
            if (firstError === null) {
              const at = ` (chunk ${idx + 1}/${chunks.length}, ${fmt(sentEvents)}/${fmt(totalNew)} 이벤트 전송 후)`;
              firstError = new Error(
                `POST 실패 (${config.url})${at}: ${err instanceof Error ? err.message : err}`
              );
            }
            return;
          }
          commitChunk(sent, chunk);
          sentEvents += chunkEvents;
          completed++;
          if (multi) {
            console.log(
              `  ${tag} 세션 ${chunk.length}개 · 이벤트 ${fmt(chunkEvents)}개 · ${fmtMs(Date.now() - chunkStart)} · (${completed}/${chunks.length})`
            );
          }
        }
      })()
    );
  }
  await Promise.all(workers);
  if (firstError) throw firstError;

  const suffix = multi ? ` (${chunks.length} chunks · ${fmtMs(Date.now() - totalStart)})` : "";
  console.log(`${prefix}업로드 OK · 세션 ${diff.length}개 / 새 이벤트 ${fmt(totalNew)}개${suffix}`);
}

function readConcurrency(): number {
  // 기본 2 — 서버 부하로 503 이 자주 나는 환경에서 안전. 빠른 환경이면 VOTRA_CONCURRENCY=4+ 로 늘림.
  const raw = process.env.VOTRA_CONCURRENCY;
  if (!raw) return 2;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
}

async function uploadClaudeFilesOnce(cwd: string): Promise<void> {
  const config = await readClaudeFilesConfig();
  const start = Date.now();
  const discovered = await discoverClaudeFiles(cwd);
  if (discovered.length === 0) {
    console.log(`AI 파일 스캔 결과 없음 — skip (cwd: ${cwd})`);
    return;
  }
  const files: ClaudeFileUpload[] = [];
  for (const d of discovered) {
    const file = await readClaudeFile(d.absPath);
    if (!file) continue;
    files.push({
      kind: d.kind,
      scope: d.scope,
      absPath: d.absPath,
      displayPath: d.displayPath,
      content: file.content,
      mtime: file.mtime,
    });
  }
  if (files.length === 0) {
    console.log(`AI 파일 스캔 결과 없음 — skip (cwd: ${cwd})`);
    return;
  }
  await postClaudeFiles(config, { source: cwd, files });
  const by = {
    global: files.filter((f) => f.scope === "global").length,
    "project-root": files.filter((f) => f.scope === "project-root").length,
    subdir: files.filter((f) => f.scope === "subdir").length,
  };
  console.log(
    `AI 파일 업로드 OK · ${files.length}개 ` +
      `(global ${by.global} / project-root ${by["project-root"]} / subdir ${by.subdir}) · ${fmtMs(Date.now() - start)}`
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtMs(ms: number): string {
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${ms}ms`;
}

function commitChunk(sent: Map<string, number>, chunk: SessionPayload[]): void {
  for (const s of chunk) {
    const prev = sent.get(s.id) ?? 0;
    sent.set(s.id, prev + s.events.length);
  }
}
