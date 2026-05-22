import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type RememberResponse = { ok: true; thought: { id: string } } | { ok: false; error: string };

export async function handleRemember(
  args: { content: string; tags?: string[] },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<RememberResponse>(config, "/api/memory/thoughts", {
    projectId,
    content: args.content,
    tags: args.tags ?? [],
  });
  if (!data.ok) throw new Error(data.error);
  return `기억했어요 (id: ${data.thought.id})`;
}
