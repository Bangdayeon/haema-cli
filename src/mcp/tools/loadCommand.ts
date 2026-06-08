import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type CommandResponse =
  | { ok: true; slug: string; name: string; description: string; content: string }
  | { ok: false; error: string };

export async function handleLoadCommand(
  args: { slug: string },
  config: McpConfig,
): Promise<string> {
  const data = await mcpGet<CommandResponse>(config, `/api/memory/commands/${args.slug}`, {});
  if (!data.ok) throw new Error(data.error);
  return `# /${data.slug} — ${data.name}\n\n${data.content}`;
}
