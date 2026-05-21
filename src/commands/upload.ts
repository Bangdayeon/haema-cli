import {
  postClaudeFiles,
  readClaudeFilesConfig,
  type ClaudeFileUpload,
} from "../claudeFilesClient.js";
import { discoverClaudeFiles } from "../discoverClaudeFiles.js";
import { loadCodexSessions } from "../loadCodexSessions.js";
import { loadGeminiSessions } from "../loadGeminiSessions.js";
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
  type UploadBatch,
  type UploadConfig,
} from "../uploadClient.js";
import { loadState, saveState } from "../uploadState.js";
import { watchDirChanges } from "../watchDir.js";
import { watchFileChanges } from "../watchFile.js";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { stat } from "node:fs/promises";

const CODEX_SESSIONS_ROOT = join(homedir(), ".codex", "sessions");
const GEMINI_TMP_ROOT = join(homedir(), ".gemini", "tmp");

type UploadOptions = {
  watch?: boolean;
  project?: string | boolean;
  claudeFiles?: boolean;
};

export async function uploadCommand(file: string | undefined, options: UploadOptions): Promise<void> {
  const config = await readUploadConfig();
  const isProject = options.project !== undefined;
  const projectInput = typeof options.project === "string" ? options.project : undefined;

  console.log(`업로드 대상: ${config.url}`);
  if (config.apiKey) console.log("Authorization: Bearer ***");

  if (isProject) {
    await uploadProject(projectInput, options, config);
    return;
  }

  const source = await resolveSessionPath(file);
  const load = () => loadSessions(source);
  console.log(`소스: ${source}`);

  const sent = new Map<string, number>();
  try {
    await flushOnce(load, source, "CLAUDE", config, sent);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.watch) {
      console.error(`초기 업로드 실패: ${msg}`);
    } else {
      throw err;
    }
  }

  if (!options.watch) return;

  console.log(`\n(watch) ${source} 감지 중... Ctrl+C 로 종료`);
  watchFileChanges(source, async () => {
    const t = new Date().toLocaleTimeString();
    try {
      await flushOnce(load, source, "CLAUDE", config, sent, `[${t}] `);
    } catch (err) {
      console.error(`[${t}] 업로드 실패: ${err instanceof Error ? err.message : err}`);
    }
  });
}

async function uploadProject(
  projectInput: string | undefined,
  options: UploadOptions,
  config: UploadConfig
): Promise<void> {
  const cwd = projectInput ? resolve(projectInput) : process.cwd();

  // Claude 세션 디렉토리
  let claudeSource: string | null = null;
  let claudeLoad: (() => Promise<Session[]>) | null = null;
  let claudeFilesCwd: string | undefined;
  try {
    const resolved = await resolveProjectDir(projectInput);
    claudeSource = resolved.dir;
    claudeLoad = () => loadProjectSessions(resolved.dir, { filterCwd: resolved.filterCwd });
    if (resolved.filterCwd) {
      claudeFilesCwd = resolved.filterCwd;
      console.log(`Claude 소스: ${resolved.dir}\ncwd 필터: ${resolved.filterCwd}`);
    } else {
      console.log(`Claude 소스: ${resolved.dir}`);
    }
  } catch {
    // Claude Code 세션 없음 — Codex 가 있으면 계속
  }

  // Codex 세션 디렉토리
  let codexSource: string | null = null;
  let codexLoad: (() => Promise<Session[]>) | null = null;
  if (await isDir(CODEX_SESSIONS_ROOT)) {
    codexSource = CODEX_SESSIONS_ROOT;
    codexLoad = () => loadCodexSessions(CODEX_SESSIONS_ROOT, cwd);
    console.log(`Codex 소스: ${CODEX_SESSIONS_ROOT} (cwd 필터: ${cwd})`);
  }

  // Gemini 세션 디렉토리
  let geminiSource: string | null = null;
  let geminiLoad: (() => Promise<Session[]>) | null = null;
  if (await isDir(GEMINI_TMP_ROOT)) {
    geminiSource = GEMINI_TMP_ROOT;
    geminiLoad = () => loadGeminiSessions(cwd);
    console.log(`Gemini 소스: ${GEMINI_TMP_ROOT} (cwd 필터: ${cwd})`);
  }

  if (!claudeSource && !codexSource && !geminiSource) {
    throw new Error(
      `Claude Code, Codex CLI 또는 Gemini CLI 세션을 찾지 못했어요.\n  cwd: ${cwd}`
    );
  }

  const sentClaude = claudeSource ? await loadState(claudeSource) : new Map<string, number>();
  const sentCodex = codexSource ? await loadState(codexSource) : new Map<string, number>();
  const sentGemini = geminiSource ? await loadState(geminiSource) : new Map<string, number>();

  const flushAll = async (prefix = ""): Promise<void> => {
    if (claudeSource && claudeLoad) {
      try {
        await flushOnce(claudeLoad, claudeSource, "CLAUDE", config, sentClaude, prefix);
        await saveState(claudeSource, sentClaude);
      } catch (err) {
        console.error(`${prefix}Claude 업로드 실패: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (codexSource && codexLoad) {
      try {
        await flushOnce(codexLoad, codexSource, "CODEX", config, sentCodex, prefix);
        await saveState(codexSource, sentCodex);
      } catch (err) {
        console.error(`${prefix}Codex 업로드 실패: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (geminiSource && geminiLoad) {
      try {
        await flushOnce(geminiLoad, geminiSource, "GEMINI", config, sentGemini, prefix);
        await saveState(geminiSource, sentGemini);
      } catch (err) {
        console.error(`${prefix}Gemini 업로드 실패: ${err instanceof Error ? err.message : err}`);
      }
    }
  };

  await flushAll();

  if (options.claudeFiles !== false && claudeFilesCwd) {
    try {
      await uploadClaudeFilesOnce(claudeFilesCwd);
    } catch (err) {
      console.error(`AI 파일 업로드 실패 (세션은 OK): ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!options.watch) return;

  console.log(`\n(watch) 감지 중... Ctrl+C 로 종료`);

  const makeOnChange = (label: string) => async (): Promise<void> => {
    const t = new Date().toLocaleTimeString();
    await flushAll(`[${t}][${label}] `);
  };

  if (claudeSource) {
    watchDirChanges(claudeSource, makeOnChange("Claude"), { pattern: /\.jsonl$/ });
  }
  if (codexSource) {
    // Codex 세션은 날짜 서브디렉터리로 구성 — 상위 디렉터리의 서브디렉터리 변경을 감지
    watchDirChanges(codexSource, makeOnChange("Codex"));
  }
  if (geminiSource) {
    watchDirChanges(geminiSource, makeOnChange("Gemini"), { pattern: /\.jsonl$/ });
  }
}

async function isDir(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function flushOnce(
  load: () => Promise<Session[]>,
  source: string,
  agent: UploadBatch["agent"],
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
              { source, agent, sessions: chunk },
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
