import type { McpConfig } from "../mcpClient.js";
import { mcpPatch } from "../mcpClient.js";

type TaskRecord = { seq: number; title: string; status: string };
type UpdateResponse = { ok: true; task: TaskRecord } | { ok: false; error: string };

export async function handleUpdateTask(
  args: {
    taskSeq: number;
    status?: string;
    title?: string;
    description?: string;
    module?: string;
    priority?: number;
  },
  config: McpConfig,
): Promise<string> {
  const { taskSeq, ...updates } = args;
  const data = await mcpPatch<UpdateResponse>(config, `/api/memory/tasks/${taskSeq}`, updates);
  if (!data.ok) throw new Error(data.error);
  return `태스크 업데이트됨: #${data.task.seq} "${data.task.title}" → ${data.task.status}`;
}
