import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type TaskResult = {
  id: string;
  seq: number;
  title: string;
  module: string | null;
  keyDecisions: string[];
  doneAt: string | null;
  createdAt: string;
};
type RecallResponse = { ok: true; results: TaskResult[] } | { ok: false; error: string };

export async function handleRecall(
  args: { query: string; limit?: number },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<RecallResponse>(config, "/api/memory/thoughts/search", {
    projectId,
    query: args.query,
    limit: args.limit ?? 10,
  });
  if (!data.ok) throw new Error(data.error);
  if (data.results.length === 0) return "관련된 기억을 찾지 못했어요.";

  const lines = data.results.map((r) => {
    const date = new Date(r.doneAt ?? r.createdAt).toLocaleDateString("ko-KR");
    const moduleTag = r.module ? ` [${r.module}]` : "";
    const header = `#${r.seq} ${r.title}${moduleTag} (${date})`;
    if (r.keyDecisions.length === 0) return header;
    const decisions = r.keyDecisions.map((d) => `  • ${d}`).join("\n");
    return `${header}\n${decisions}`;
  });

  return `검색 결과 (${data.results.length}개):\n\n${lines.join("\n\n")}`;
}
