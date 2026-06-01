import type { McpConfig } from "./mcpClient.js";
import { mcpPost } from "./mcpClient.js";

type InitResponse =
  | { ok: true; projectId: string; title: string; cwd: string | null }
  | { ok: false; error: string };

// cwd로 프로젝트 조회 또는 자동 생성 (upsert).
export async function resolveOrInitProject(cwd: string, config: McpConfig): Promise<string | null> {
  try {
    const res = await mcpPost<InitResponse>(config, "/api/memory/init-project", { cwd });
    if (res.ok) return res.projectId;
    console.error(`[votra-memory] 프로젝트 초기화 실패: ${res.error}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("로그인")) {
      console.error("[votra-memory] 인증 오류 — `signin` 툴로 로그인해주세요.");
    } else {
      console.error(`[votra-memory] 프로젝트 연결 실패: ${msg}`);
    }
  }
  return null;
}

// tool 파라미터에서 projectId 결정: cwd 있으면 동적 resolve/init, 없으면 기본값 사용
export async function resolveProject(
  args: { cwd?: string; defaultProjectId: string | null },
  config: McpConfig,
): Promise<string | null> {
  if (!args.cwd) return args.defaultProjectId;
  return resolveOrInitProject(args.cwd, config);
}
