import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type MatchedSkill = { slug: string; name: string; contextHint: string };

type StartTaskResponse =
  | { ok: true; task: { seq: number; title: string }; matchedSkills: MatchedSkill[] }
  | { ok: false; error: string };

export async function handleStartTask(
  args: { title: string; description?: string; module?: string; priority?: number; folderId?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<StartTaskResponse>(config, "/api/memory/tasks/start", {
    projectId,
    title: args.title,
    description: args.description,
    module: args.module,
    priority: args.priority,
    folderId: args.folderId,
  });
  if (!data.ok) throw new Error(data.error);

  let output = `태스크 시작됨: #${data.task.seq} "${data.task.title}" → IN_PROGRESS`;
  if (data.matchedSkills && data.matchedSkills.length > 0) {
    const skillLines = data.matchedSkills.map((s) => `- ${s.slug}: ${s.name} — ${s.contextHint}`).join("\n");
    output += `\n\n이 작업과 관련된 스킬이 있어요. load_skill(slug)로 로드하세요:\n${skillLines}`;
  }
  return output;
}
