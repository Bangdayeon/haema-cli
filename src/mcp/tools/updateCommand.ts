import type { McpConfig } from "../mcpClient.js";
import { mcpPatch } from "../mcpClient.js";

type UpdateResponse =
  | { ok: true; slug: string; name: string; content: string }
  | { ok: false; error: string };

export async function handleUpdateCommand(
  args: { slug: string; content: string },
  config: McpConfig,
): Promise<string> {
  const data = await mcpPatch<UpdateResponse>(config, `/api/memory/commands/${args.slug}`, { content: args.content });
  if (!data.ok) throw new Error(data.error);
  return `/${data.slug} (${data.name}) 커맨드가 업데이트됐어요.`;
}
