import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type ThoughtResult = { id: string; content: string; tags: string[]; createdAt: string; similarity: number };
type RecallResponse = { ok: true; results: ThoughtResult[] } | { ok: false; error: string };

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

  const lines = data.results.map(
    (r) =>
      `[${new Date(r.createdAt).toLocaleDateString("ko-KR")}] ${r.content}` +
      (r.tags.length > 0 ? ` [${r.tags.join(", ")}]` : "") +
      ` (유사도: ${(r.similarity * 100).toFixed(0)}%)`,
  );
  return `검색 결과 (${data.results.length}개):\n\n${lines.join("\n")}`;
}
