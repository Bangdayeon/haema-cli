import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type SkillResponse =
  | { ok: true; slug: string; name: string; contextHint: string; content: string }
  | { ok: false; error: string };

export async function handleLoadSkill(
  args: { slug: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpGet<SkillResponse>(config, `/api/skills/${args.slug}`, { projectId });
  if (!data.ok) throw new Error(data.error);
  return `# Skill: ${data.name}\n> ${data.contextHint}\n\n${data.content}`;
}
