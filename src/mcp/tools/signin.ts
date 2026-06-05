import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

import { authFilePath, writeAuth } from "../../auth.js";
import { openBrowser } from "../../openBrowser.js";

const DEFAULT_APP_URL = "https://haema.jocodingax.ai";
const PORT_RANGE_START = 5180;
const PORT_RANGE_END = 5189;
const TIMEOUT_MS = 120_000;

type CallbackResult = { token: string; email?: string };

export async function handleSignin(args: { appUrl?: string }): Promise<string> {
  const appUrl = stripTrailingSlash(args.appUrl ?? process.env.HAEMA_APP_URL ?? DEFAULT_APP_URL);

  if (process.env.MOCK_AUTH === "true") {
    await writeAuth({
      appUrl,
      apiKey: `haema_mock_${randomBytes(16).toString("hex")}`,
      email: "dev@mock.local",
      signedInAt: new Date().toISOString(),
    });
    return `🛠 Mock 로그인 완료 (MOCK_AUTH=true)\n자격증명 저장: ${authFilePath()}`;
  }

  const state = randomBytes(16).toString("hex");

  const { port, server, resultPromise } = await startCallbackServer(state);
  const callback = `http://127.0.0.1:${port}/callback`;
  const signinUrl = `${appUrl}/cli/signin?callback=${encodeURIComponent(callback)}&state=${state}`;

  openBrowser(signinUrl);

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS),
  );

  let result: CallbackResult;
  try {
    result = await Promise.race([resultPromise, timeoutPromise]);
  } catch (e) {
    server.close();
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "TIMEOUT") {
      return `로그인 대기 시간이 초과됐어요. 아래 URL을 직접 브라우저에서 열고 다시 시도해주세요:\n${signinUrl}`;
    }
    throw e;
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
  return `로그인 성공${who}\n자격증명 저장: ${authFilePath()}`;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

async function startCallbackServer(
  expectedState: string,
): Promise<{ port: number; server: Server; resultPromise: Promise<CallbackResult> }> {
  let resolveResult!: (r: CallbackResult) => void;
  let rejectResult!: (e: Error) => void;
  const resultPromise = new Promise<CallbackResult>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  const server = createServer((req, res) => {
    if (!req.url) { res.statusCode = 400; res.end(); return; }
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.pathname !== "/callback") { res.statusCode = 404; res.end(); return; }

    const token = u.searchParams.get("token");
    const state = u.searchParams.get("state");
    const email = u.searchParams.get("email") ?? undefined;

    if (!token || state !== expectedState) {
      res.statusCode = 400;
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(htmlPage("로그인 실패", "유효하지 않은 응답이에요. 다시 시도해주세요."));
      rejectResult(new Error("invalid callback"));
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(htmlPage("로그인 완료", "이 창은 닫아도 돼요."));
    resolveResult({ token, email });
  });

  const port = await listenFirstAvailable(server);
  return { port, server, resultPromise };
}

async function listenFirstAvailable(server: Server): Promise<number> {
  let lastErr: Error | undefined;
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", (e) => { server.removeAllListeners("listening"); reject(e); });
        server.once("listening", () => { server.removeAllListeners("error"); resolve(); });
        server.listen(p, "127.0.0.1");
      });
      return p;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`사용 가능한 포트가 없어요 (${PORT_RANGE_START}-${PORT_RANGE_END}): ${lastErr?.message ?? ""}`);
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}div{text-align:center;max-width:420px;padding:24px}h1{margin:0 0 12px;font-weight:500;font-size:22px}p{color:#888;line-height:1.5;margin:0}</style>
</head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`;
}
