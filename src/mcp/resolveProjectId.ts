import type { McpConfig } from "./mcpClient.js";
import { mcpGet, mcpPost } from "./mcpClient.js";

type ResolveResponse =
  | { ok: true; projectId: string; title: string; cwd: string | null }
  | { ok: false; error: string };

type InitResponse =
  | { ok: true; projectId: string; title: string; cwd: string | null }
  | { ok: false; error: string };

// cwd로 프로젝트 조회. 없으면 자동 생성(빈 프로젝트).
export async function resolveOrInitProject(cwd: string, config: McpConfig): Promise<string> {
  try {
    const resolved = await mcpGet<ResolveResponse>(config, "/api/memory/resolve-project", { cwd });
    if (resolved.ok) return resolved.projectId;
  } catch (e) {
    // 404 = 프로젝트 없음 → 아래에서 생성. 그 외 에러는 재throw.
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("HTTP 404")) throw e;
  }

  // 없으면 빈 프로젝트 자동 생성
  const created = await mcpPost<InitResponse>(config, "/api/memory/init-project", { cwd });
  if (!created.ok) {
    throw new Error(`프로젝트 초기화에 실패했어요: ${created.error}`);
  }
  return created.projectId;
}

// tool 파라미터에서 projectId 결정: cwd 있으면 동적 resolve, 없으면 기본값 사용
export async function resolveProject(
  args: { cwd?: string; defaultProjectId: string },
  config: McpConfig,
): Promise<string> {
  if (!args.cwd) return args.defaultProjectId;
  return resolveOrInitProject(args.cwd, config);
}
