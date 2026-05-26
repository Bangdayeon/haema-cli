import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

import { authFilePath, writeAuth } from "../auth.js";
import { openBrowser } from "../openBrowser.js";

const DEFAULT_APP_URL = "https://votra.jocodingax.ai";
const PORT_RANGE_START = 5180;
const PORT_RANGE_END = 5189;

type SigninOptions = {
  port?: number;
  noOpen?: boolean;
};

export async function signinCommand(
  urlArg: string | undefined,
  options: SigninOptions
): Promise<void> {
  const appUrl = stripTrailingSlash(urlArg ?? process.env.VOTRA_APP_URL ?? DEFAULT_APP_URL);
  const state = randomBytes(16).toString("hex");

  const { port, server, resultPromise } = await startCallbackServer(state, options.port);

  const callback = `http://127.0.0.1:${port}/callback`;
  const signinUrl = `${appUrl}/cli/signin?callback=${encodeURIComponent(callback)}&state=${state}`;

  console.log(`votra 로그인 (${appUrl})`);
  console.log("브라우저가 자동으로 열려요. 안 열리면 아래 URL 을 직접 열어주세요:");
  console.log(`  ${signinUrl}\n`);
  console.log(`콜백 대기 중: ${callback}  (Ctrl+C 로 취소)`);

  if (!options.noOpen) openBrowser(signinUrl);

  let result: CallbackResult;
  try {
    result = await resultPromise;
  } finally {
    server.close();
  }

  await writeAuth({
    appUrl,
    apiKey: result.token,
    email: result.email,
    signedInAt: new Date().toISOString(),
  });

  const who = result.email ? ` (${result.email})` : "";
  console.log(`\n로그인 성공${who}`);
  console.log(`자격증명 저장: ${authFilePath()}`);
  console.log("\n☝️  프로젝트 루트 폴더에서 votra upload --project 를 실행해서 업로드하세요.");
  console.log("✌️  AI 도구 창을 열어 brief 을 실행하도록 한 후, 태스크를 생성해보세요.");
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

type CallbackResult = { token: string; email?: string };

async function startCallbackServer(
  expectedState: string,
  preferredPort: number | undefined
): Promise<{ port: number; server: Server; resultPromise: Promise<CallbackResult> }> {
  let resolveResult!: (r: CallbackResult) => void;
  let rejectResult!: (e: Error) => void;
  const resultPromise = new Promise<CallbackResult>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  const server = createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/callback") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const token = u.searchParams.get("token");
    const state = u.searchParams.get("state");
    const email = u.searchParams.get("email") ?? undefined;

    if (!token || state !== expectedState) {
      res.statusCode = 400;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(htmlPage("로그인 실패", "유효하지 않은 응답이에요. CLI 를 다시 실행해 주세요."));
      rejectResult(new Error("invalid callback: token 누락 또는 state 불일치"));
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(htmlPage("로그인 완료", "이 창은 닫아도 돼요. CLI 로 돌아가 주세요."));
    resolveResult({ token, email });
  });

  const port = await listenFirstAvailable(server, preferredPort);
  return { port, server, resultPromise };
}

async function listenFirstAvailable(server: Server, preferred: number | undefined): Promise<number> {
  const start = preferred ?? PORT_RANGE_START;
  const end = preferred ?? PORT_RANGE_END;
  let lastErr: Error | undefined;
  for (let p = start; p <= end; p++) {
    try {
      await listenOn(server, p);
      return p;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`사용 가능한 포트를 찾지 못했어요 (${start}-${end}): ${lastErr?.message ?? ""}`);
}

function listenOn(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error): void => {
      server.removeListener("listening", onListening);
      reject(e);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}
  div{text-align:center;max-width:420px;padding:24px}
  h1{margin:0 0 12px;font-weight:500;font-size:22px}
  p{color:#888;line-height:1.5;margin:0}
</style></head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`;
}
