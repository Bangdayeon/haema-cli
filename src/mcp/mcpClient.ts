import { readAuth } from "../auth.js";

export type McpConfig = {
  appUrl: string;
  apiKey: string;
};

export async function readMcpConfig(): Promise<McpConfig> {
  const auth = await readAuth();
  if (!auth) throw new Error("로그인이 필요해요. `haema signin` 을 먼저 실행해주세요.");
  return { appUrl: auth.appUrl, apiKey: auth.apiKey };
}

const TIMEOUT_MS = 10_000;

function withTimeout(signal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("요청 시간이 초과됐어요 (10초)")), TIMEOUT_MS);
  signal?.addEventListener("abort", () => { clearTimeout(timer); controller.abort(signal.reason); });
  return controller.signal;
}

function authHeaders(config: McpConfig): Record<string, string> {
  return { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` };
}

async function checkResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
}

export async function mcpPost<T>(config: McpConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.appUrl}${path}`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify(body),
    signal: withTimeout(),
  });
  await checkResponse(res);
  return res.json() as Promise<T>;
}

export async function mcpGet<T>(
  config: McpConfig,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${config.appUrl}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: authHeaders(config),
    signal: withTimeout(),
  });
  await checkResponse(res);
  return res.json() as Promise<T>;
}

export async function mcpPatch<T>(
  config: McpConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${config.appUrl}${path}`, {
    method: "PATCH",
    headers: authHeaders(config),
    body: JSON.stringify(body),
    signal: withTimeout(),
  });
  await checkResponse(res);
  return res.json() as Promise<T>;
}
