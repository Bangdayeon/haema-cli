import { readAuth } from "../auth.js";

export type McpConfig = {
  appUrl: string;
  apiKey: string;
};

export async function readMcpConfig(): Promise<McpConfig> {
  const auth = await readAuth();
  if (!auth) throw new Error("로그인이 필요해요. `votra signin` 을 먼저 실행해주세요.");
  return { appUrl: auth.appUrl, apiKey: auth.apiKey };
}

export async function mcpPost<T>(config: McpConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.appUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
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
    headers: { authorization: `Bearer ${config.apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function mcpPatch<T>(
  config: McpConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${config.appUrl}${path}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}
