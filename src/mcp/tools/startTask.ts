import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type StartTaskResponse =
  | { ok: true; task: { seq: number; title: string } }
  | { ok: false; error: string };

export async function handleStartTask(
  args: { title: string; description?: string; module?: string; priority?: number; folderId?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<StartTaskResponse>(config, "/api/memory/tasks/start", {
    projectId,
    title: args.title,
    description: args.description,
    module: args.module,
    priority: args.priority,
    folderId: args.folderId,
  });
  if (!data.ok) throw new Error(data.error);
  return `태스크 시작됨: #${data.task.seq} "${data.task.title}" → IN_PROGRESS`;
}
