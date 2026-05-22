import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = {
  id: string;
  seq: number;
  title: string;
  status: string;
  module: string | null;
  priority: number;
  description: string | null;
};
type ListResponse = { ok: true; tasks: Task[] } | { ok: false; error: string };

const STATUS_EMOJI: Record<string, string> = {
  PENDING: "📋",
  IN_PROGRESS: "🔄",
  DONE: "✅",
  CANCELLED: "❌",
};

export async function handleListTasks(
  args: { status?: string; module?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const params: Record<string, string> = { projectId };
  if (args.status) params.status = args.status;
  if (args.module) params.module = args.module;

  const data = await mcpGet<ListResponse>(config, "/api/memory/tasks", params);
  if (!data.ok) throw new Error(data.error);

  if (data.tasks.length === 0) return "태스크가 없어요.";

  const lines = data.tasks.map((t) => {
    const emoji = STATUS_EMOJI[t.status] ?? "•";
    const mod = t.module ? ` [${t.module}]` : "";
    const desc = t.description ? `\n   ${t.description}` : "";
    return `${emoji} #${t.seq} ${t.title}${mod} (priority: ${t.priority})${desc}`;
  });

  return `태스크 목록 (${data.tasks.length}개):\n\n${lines.join("\n")}`;
}
