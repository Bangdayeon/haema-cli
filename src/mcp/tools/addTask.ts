import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type TaskResponse =
  | { ok: true; task: { seq: number; title: string } }
  | { ok: false; error: string };

export async function handleAddTask(
  args: { title: string; description?: string; module?: string; priority?: number; folderId?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<TaskResponse>(config, "/api/memory/tasks", {
    projectId,
    title: args.title,
    description: args.description,
    module: args.module,
    priority: args.priority,
    folderId: args.folderId,
  });
  if (!data.ok) throw new Error(data.error);
  return `태스크 생성됨: #${data.task.seq} "${data.task.title}"`;
}
