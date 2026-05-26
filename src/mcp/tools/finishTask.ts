import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type FinishTaskResponse =
  | { ok: true; task: { seq: number; title: string }; sessionLog: { id: string } }
  | { ok: false; error: string };

export async function handleFinishTask(
  args: { taskSeq: number; summary: string; aiTool?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<FinishTaskResponse>(config, `/api/memory/tasks/${args.taskSeq}/finish`, {
    projectId,
    summary: args.summary,
    aiTool: args.aiTool,
  });
  if (!data.ok) throw new Error(data.error);
  return `태스크 완료: #${data.task.seq} "${data.task.title}" → DONE\n세션 로그 저장됨.`;
}
