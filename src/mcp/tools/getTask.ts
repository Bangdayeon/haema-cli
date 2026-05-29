import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = {
  seq: number;
  title: string;
  status: string;
  module: string | null;
  priority: number;
  description: string | null;
  outcome: string | null;
  keyDecisions: string[];
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
};
type GetResponse = { ok: true; task: Task } | { ok: false; error: string };

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
  CANCELLED: "취소됨",
};

export async function handleGetTask(
  args: { taskSeq: number },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpGet<GetResponse>(config, `/api/memory/tasks/${args.taskSeq}`, { projectId });
  if (!data.ok) throw new Error(data.error);

  const t = data.task;
  const lines: string[] = [
    `#${t.seq} ${t.title}`,
    `상태: ${STATUS_LABEL[t.status] ?? t.status}`,
  ];
  if (t.module) lines.push(`모듈: ${t.module}`);
  if (t.priority) lines.push(`우선순위: ${t.priority}`);
  if (t.description) lines.push(`\n설명:\n${t.description}`);
  if (t.outcome) lines.push(`\n결과:\n${t.outcome}`);
  if (t.keyDecisions.length > 0) lines.push(`\n핵심 결정:\n${t.keyDecisions.map((d) => `- ${d}`).join("\n")}`);

  return lines.join("\n");
}
