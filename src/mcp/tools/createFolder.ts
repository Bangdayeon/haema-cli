import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type CreateFolderResponse =
  | { ok: true; folder: { id: string; name: string } }
  | { ok: false; error: string };

export async function handleCreateFolder(
  args: { name: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<CreateFolderResponse>(config, "/api/memory/folders", {
    projectId,
    name: args.name,
  });
  if (!data.ok) throw new Error(data.error);
  return `폴더 생성됨: "${data.folder.name}" (id: ${data.folder.id})`;
}
