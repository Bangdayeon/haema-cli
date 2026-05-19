import { readAuth } from "./auth.js";
import type { ClaudeFileKind, ClaudeFileScope } from "./discoverClaudeFiles.js";
import { postWithRetry } from "./uploadClient.js";

const SESSIONS_DEFAULT = "https://votra.jocodingax.ai/api/sessions/ingest";
const CLAUDE_FILES_DEFAULT = "https://votra.jocodingax.ai/api/claude-files/ingest";

export type ClaudeFileUpload = {
  kind: ClaudeFileKind;
  scope: ClaudeFileScope;
  absPath: string;
  displayPath: string;
  content: string;
  mtime: number;
};

export type ClaudeFilesBatch = {
  source: string;
  files: ClaudeFileUpload[];
};

export type ClaudeFilesConfig = {
  url: string;
  apiKey?: string;
};

export async function readClaudeFilesConfig(): Promise<ClaudeFilesConfig> {
  // 우선순위: VOTRA_CLAUDE_FILES_URL > VOTRA_API_URL (env) > ~/.votra/auth.json > 기본값.
  const explicit = process.env.VOTRA_CLAUDE_FILES_URL;
  if (explicit) return { url: explicit, apiKey: process.env.VOTRA_API_KEY };

  const envSessions = process.env.VOTRA_API_URL;
  if (envSessions || process.env.VOTRA_API_KEY) {
    const sessions = envSessions ?? SESSIONS_DEFAULT;
    const url = sessions.endsWith("/api/sessions/ingest")
      ? sessions.replace(/\/api\/sessions\/ingest$/, "/api/claude-files/ingest")
      : CLAUDE_FILES_DEFAULT;
    return { url, apiKey: process.env.VOTRA_API_KEY };
  }

  const auth = await readAuth();
  if (auth) {
    return { url: `${auth.appUrl}/api/claude-files/ingest`, apiKey: auth.apiKey };
  }
  return { url: CLAUDE_FILES_DEFAULT };
}

export async function postClaudeFiles(
  config: ClaudeFilesConfig,
  batch: ClaudeFilesBatch
): Promise<void> {
  await postWithRetry(config.url, config.apiKey, JSON.stringify(batch));
}
