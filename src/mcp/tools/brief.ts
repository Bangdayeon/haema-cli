import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = { id: string; seq: number; title: string; module: string | null; priority: number };
type Thought = { id: string; content: string; tags: string[]; createdAt: string };
type DoneTask = { id: string; seq: number; title: string; doneAt: string | null };

type Brief = {
  projectTitle: string;
  cwd: string | null;
  pendingTasks: Task[];
  inProgressTasks: Task[];
  recentDecisions: Thought[];
  recentlyDone: DoneTask[];
  rules: string[];
};

type BriefResponse = { ok: true; brief: Brief } | { ok: false; error: string };

export async function handleBrief(projectId: string, config: McpConfig): Promise<string> {
  const data = await mcpGet<BriefResponse>(config, "/api/memory/brief", { projectId });
  if (!data.ok) throw new Error(data.error);

  const b = data.brief;
  const lines: string[] = [];

  lines.push(`# Votra Memory — Session Brief`);
  lines.push(`\n## Project: ${b.projectTitle}${b.cwd ? ` (${b.cwd})` : ""}`);

  if (b.inProgressTasks.length > 0) {
    lines.push(`\n## 🔄 진행 중 (${b.inProgressTasks.length})`);
    for (const t of b.inProgressTasks) {
      const mod = t.module ? ` [module: ${t.module}]` : "";
      lines.push(`- #${t.seq} ${t.title}${mod} (priority: ${t.priority})`);
    }
  }

  if (b.pendingTasks.length > 0) {
    lines.push(`\n## 📋 대기 중 (${b.pendingTasks.length})`);
    for (const t of b.pendingTasks) {
      const mod = t.module ? ` [module: ${t.module}]` : "";
      lines.push(`- #${t.seq} ${t.title}${mod} (priority: ${t.priority})`);
    }
  }

  if (b.recentDecisions.length > 0) {
    lines.push(`\n## 💡 최근 결정/메모 (${b.recentDecisions.length}개)`);
    for (const d of b.recentDecisions) {
      const date = new Date(d.createdAt).toLocaleDateString("ko-KR");
      const tags = d.tags.length > 0 ? ` [${d.tags.join(", ")}]` : "";
      lines.push(`${d.content} (${date})${tags}`);
    }
  }

  if (b.recentlyDone.length > 0) {
    lines.push(`\n## ✅ 최근 완료`);
    for (const t of b.recentlyDone) {
      lines.push(`- #${t.seq} ${t.title}`);
    }
  }

  if (b.rules.length > 0) {
    lines.push(`\n## 📖 프로젝트 규칙 (CLAUDE.md)`);
    lines.push(b.rules.join("\n"));
  }

  if (
    b.pendingTasks.length === 0 &&
    b.inProgressTasks.length === 0 &&
    b.recentDecisions.length === 0
  ) {
    lines.push("\n저장된 태스크나 메모가 없어요. `add_task` 나 `remember` 로 시작해보세요.");
  }

  return lines.join("\n");
}
