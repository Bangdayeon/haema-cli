import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type FinishTaskResponse =
  | { ok: true; task: { seq: number; title: string }; sessionLog: { id: string } }
  | { ok: false; error: string };

export async function handleFinishTask(
  args: { taskSeq: number; summary: string; aiTool?: string; keyDecisions?: string[]; outcome?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<FinishTaskResponse>(config, `/api/memory/tasks/${args.taskSeq}/finish`, {
    projectId,
    summary: args.summary,
    aiTool: args.aiTool,
    keyDecisions: args.keyDecisions,
    outcome: args.outcome,
  });
  if (!data.ok) throw new Error(data.error);
  const decisionsNote = args.keyDecisions?.length ? ` 결정 ${args.keyDecisions.length}개` : "";
  const outcomeNote = args.outcome ? " outcome 저장됨." : "";
  return `태스크 완료: #${data.task.seq} "${data.task.title}" → DONE\n세션 로그 저장됨.${decisionsNote}${outcomeNote}`;
}
