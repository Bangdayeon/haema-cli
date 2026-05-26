import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type LogSessionResponse = { ok: true; sessionLog: { id: string } } | { ok: false; error: string };

export async function handleLogSession(
  args: { summary: string; aiTool?: string },
  projectId: string,
  config: McpConfig,
  sessionId?: string,
): Promise<string> {
  const data = await mcpPost<LogSessionResponse>(config, "/api/memory/sessions", {
    projectId,
    summary: args.summary,
    aiTool: args.aiTool ?? "unknown",
    sessionId,
  });
  if (!data.ok) throw new Error(data.error);
  return `세션 로그 저장됐어요 (id: ${data.sessionLog.id})`;
}
