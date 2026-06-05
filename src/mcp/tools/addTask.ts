import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type TaskResponse =
  | { ok: true; task: { seq: number; title: string }; suggestedFolder?: { id: string; name: string } | null }
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
    tool: args.module,
    priority: args.priority,
    folderId: args.folderId,
  });
  if (!data.ok) throw new Error(data.error);
  let output = `태스크 생성됨: #${data.task.seq} "${data.task.title}"`;
  if (data.suggestedFolder) {
    output += `\n폴더 자동 분류: ${data.suggestedFolder.name}`;
  }
  return output;
}
