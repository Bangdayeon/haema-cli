import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type MatchedSkill = { slug: string; name: string; contextHint: string };

type StartTaskResponse =
  | { ok: true; task: { seq: number; title: string }; matchedSkills: MatchedSkill[];
      suggestedFolder?: { id: string; name: string } | null }
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
    tool: args.module,
    priority: args.priority,
    folderId: args.folderId,
  });
  if (!data.ok) throw new Error(data.error);

  let output = `태스크 시작됨: #${data.task.seq} "${data.task.title}" → IN_PROGRESS`;
  if (data.suggestedFolder) {
    output += `\n폴더 자동 분류: ${data.suggestedFolder.name}`;
  }
  if (data.matchedSkills && data.matchedSkills.length > 0) {
    const skillLines = data.matchedSkills.map((s) => `- ${s.slug}: ${s.name} — ${s.contextHint}`).join("\n");
    output += `\n\n[필수] 매칭된 툴이 있어요. 구현 전 반드시 load_tool(slug)를 호출하세요:\n${skillLines}`;
  }
  output += `\n\n다음 단계: recall("${data.task.title}")로 관련 과거 결정을 검색하세요.`;
  return output;
}
