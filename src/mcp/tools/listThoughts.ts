import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Thought = { id: string; content: string; tags: string[]; createdAt: string };
type ListResponse = { ok: true; thoughts: Thought[] } | { ok: false; error: string };

export async function handleListThoughts(
  args: { limit?: number },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpGet<ListResponse>(config, "/api/memory/thoughts", {
    projectId,
    limit: String(args.limit ?? 20),
  });
  if (!data.ok) throw new Error(data.error);

  if (data.thoughts.length === 0) return "저장된 생각이 없어요.";

  const lines = data.thoughts.map(
    (t) =>
      `[${new Date(t.createdAt).toLocaleDateString("ko-KR")}] ${t.content}` +
      (t.tags.length > 0 ? ` [${t.tags.join(", ")}]` : ""),
  );
  return `최근 생각 (${data.thoughts.length}개):\n\n${lines.join("\n")}`;
}
