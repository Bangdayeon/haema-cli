import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type CreateResponse =
  | { ok: true; command: { slug: string; name: string } }
  | { ok: false; error: string };

export async function handleCreateCommand(
  args: { name: string; description: string; folder: string; content: string },
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<CreateResponse>(config, "/api/memory/custom-commands", args);
  if (!data.ok) throw new Error(data.error);
  return `/${data.command.slug} (${data.command.name}) 커맨드가 생성됐어요. haema 커맨드 탭에서 확인할 수 있어요.`;
}
