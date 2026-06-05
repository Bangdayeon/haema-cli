import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type ToolResponse =
  | { ok: true; slug: string; name: string; contextHint: string; content: string }
  | { ok: false; error: string };

export async function handleLoadTool(
  args: { slug: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpGet<ToolResponse>(config, `/api/tools/${args.slug}`, { projectId });
  if (!data.ok) throw new Error(data.error);
  return `# Tool: ${data.name}\n> ${data.contextHint}\n\n${data.content}`;
}
