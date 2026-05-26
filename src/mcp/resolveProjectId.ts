import type { McpConfig } from "./mcpClient.js";
import { mcpGet } from "./mcpClient.js";

type ResolveResponse =
  | { ok: true; projectId: string; title: string; cwd: string | null }
  | { ok: false; error: string };

// cwd로 프로젝트 조회. 없으면 null 반환 (자동 생성 없음).
export async function resolveOrInitProject(cwd: string, config: McpConfig): Promise<string | null> {
  try {
    const resolved = await mcpGet<ResolveResponse>(config, "/api/memory/resolve-project", { cwd });
    if (resolved.ok) return resolved.projectId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("HTTP 404")) throw e;
  }
  return null;
}

// tool 파라미터에서 projectId 결정: cwd 있으면 동적 resolve, 없으면 기본값 사용
export async function resolveProject(
  args: { cwd?: string; defaultProjectId: string | null },
  config: McpConfig,
): Promise<string | null> {
  if (!args.cwd) return args.defaultProjectId;
  return resolveOrInitProject(args.cwd, config);
}
