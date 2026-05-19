import { readAuth } from "./auth.js";
import type { RawEvent, Session } from "./types.js";

const DEFAULT_URL = "https://votra.jocodingax.ai/api/sessions/ingest";

// 한 POST 의 대략적 최대 byte 크기. nginx 기본 body limit (1MB) / Next.js bodyParser 한도를
// 안전하게 밑돌도록 800KB 로 설정. 이 값을 넘기면 chunkPayloads 가 분할해서 보내요.
const MAX_POST_BYTES = 800_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
// 500 은 보통 서버 코드 버그이지만 첫 일괄 업로드에서 nginx 가 upstream 일시 죽음/응답 누락을
// 그대로 500 으로 내보내는 케이스가 있어요. 그래서 backoff 안에서 재시도.
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
// 첫 일괄 업로드 시 서버 누적 부하로 5xx 가 길게 이어질 수 있어 총 6번 (최대 ~1분) 재시도.
const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export type PostProgress = {
  // chunk 라인의 좌측 들여쓰기 prefix. flushOnce 의 진행 라인과 통일.
  retryLog: (msg: string) => void;
};

export async function postWithRetry(
  url: string,
  apiKey: string | undefined,
  body: string,
  onProgress?: PostProgress
): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const timeoutMs = readTimeoutMs();

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body,
        redirect: "manual",
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      // 네트워크 에러/타임아웃 모두 일시 오류로 간주, budget 안에서 재시도.
      if (attempt < RETRY_BACKOFF_MS.length) {
        const wait = RETRY_BACKOFF_MS[attempt];
        const reason = isAbort
          ? `타임아웃 ${formatMs(timeoutMs)}`
          : `네트워크 오류 (${err instanceof Error ? err.message : err})`;
        onProgress?.retryLog(`일시 오류 (${reason}) — ${formatMs(wait)} 후 재시도 (${attempt + 1}/${RETRY_BACKOFF_MS.length})`);
        await sleep(wait);
        continue;
      }
      if (isAbort) {
        throw new Error(`요청이 ${formatMs(timeoutMs)} 내에 응답하지 않았어요. 서버 상태 또는 네트워크 확인 필요.`);
      }
      throw err;
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "(no location)";
      throw new Error(
        `예상치 못한 리다이렉트 (HTTP ${res.status}) → ${loc}\n` +
          `  ingest 엔드포인트가 SSO/게이트웨이에 막혀 있어요. ` +
          `Bearer 토큰이 route 에 도달하지 못해요. axhub 설정에서 /api/* 를 public 으로 풀어야 해요.`
      );
    }

    if (RETRYABLE_STATUS.has(res.status) && attempt < RETRY_BACKOFF_MS.length) {
      const wait = RETRY_BACKOFF_MS[attempt];
      onProgress?.retryLog(`일시 오류 (HTTP ${res.status}) — ${formatMs(wait)} 후 재시도 (${attempt + 1}/${RETRY_BACKOFF_MS.length})`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
    }
    return;
  }
}

function readTimeoutMs(): number {
  const raw = process.env.VOTRA_REQUEST_TIMEOUT_MS;
  if (!raw) return DEFAULT_REQUEST_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REQUEST_TIMEOUT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatMs(ms: number): string {
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`;
}

export type UploadBatch = {
  source: string;
  sessions: SessionPayload[];
};

export type SessionPayload = {
  id: string;
  title: string;
  startedAt?: string;
  endedAt?: string;
  events: RawEvent[];
};

export type UploadConfig = {
  url: string;
  apiKey?: string;
};

export async function readUploadConfig(): Promise<UploadConfig> {
  const envUrl = process.env.VOTRA_API_URL;
  const envKey = process.env.VOTRA_API_KEY;
  if (envUrl || envKey) {
    return { url: envUrl ?? DEFAULT_URL, apiKey: envKey };
  }
  const auth = await readAuth();
  if (auth) {
    return { url: `${auth.appUrl}/api/sessions/ingest`, apiKey: auth.apiKey };
  }
  return { url: DEFAULT_URL };
}

export async function postBatch(
  config: UploadConfig,
  batch: UploadBatch,
  onProgress?: PostProgress
): Promise<void> {
  await postWithRetry(config.url, config.apiKey, JSON.stringify(batch), onProgress);
}

export function diffSessions(
  current: Session[],
  sent: Map<string, number>
): SessionPayload[] {
  const out: SessionPayload[] = [];
  for (const session of current) {
    const sentCount = sent.get(session.id) ?? 0;
    if (session.events.length <= sentCount) continue;
    out.push({
      id: session.id,
      title: session.title,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      events: session.events.slice(sentCount),
    });
  }
  return out;
}

export function commitSent(sent: Map<string, number>, current: Session[]): void {
  for (const session of current) {
    sent.set(session.id, session.events.length);
  }
}

// SessionPayload[] 를 MAX_POST_BYTES 안에 들어가는 chunk 들로 분할.
// 한 세션의 events 가 단독으로 한도를 넘으면 그 세션도 여러 chunk 로 쪼개요 (같은 session id 로 partial 전송 → 서버가 append).
export function chunkPayloads(
  sessions: SessionPayload[],
  maxBytes: number = MAX_POST_BYTES
): SessionPayload[][] {
  const chunks: SessionPayload[][] = [];
  let current: SessionPayload[] = [];
  let currentBytes = WRAPPER_OVERHEAD;

  for (const session of sessions) {
    const headerBytes = sessionHeaderBytes(session);
    let i = 0;
    while (i < session.events.length) {
      // 이 chunk 에 추가할 수 있는 만큼의 event 를 골라 partial 만들기
      let runBytes = headerBytes;
      let j = i;
      while (j < session.events.length) {
        const eventBytes = estimateEventBytes(session.events[j]);
        // 새 chunk 가 비어있지 않은 상태에서 한도를 넘으면 break
        if (currentBytes + runBytes + eventBytes > maxBytes && (current.length > 0 || j > i)) {
          break;
        }
        runBytes += eventBytes;
        j++;
      }
      // j > i 보장: 단일 event 가 한도를 넘으면 그래도 1개는 넣고 보냄 (서버가 414/413 내면 그건 별개 이슈)
      if (j === i) j = i + 1;

      const partial: SessionPayload = {
        id: session.id,
        title: session.title,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        events: session.events.slice(i, j),
      };

      if (currentBytes + runBytes > maxBytes && current.length > 0) {
        chunks.push(current);
        current = [];
        currentBytes = WRAPPER_OVERHEAD;
      }
      current.push(partial);
      currentBytes += runBytes;
      i = j;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

const WRAPPER_OVERHEAD = 200; // {"source":"...","sessions":[]} 등 wrapper 여유

function sessionHeaderBytes(s: SessionPayload): number {
  return JSON.stringify({ ...s, events: [] }).length;
}

function estimateEventBytes(e: RawEvent): number {
  return JSON.stringify(e).length + 1; // +1 for comma
}
