import { execSync } from "node:child_process";

import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = { id: string; seq: number; title: string; module: string | null; priority: number };
type DoneTask = { seq: number; title: string; outcome: string | null };
type SessionLog = { summary: string; createdAt: string };
type NextTask = { title: string; reason?: string; priority: "high" | "medium" | "low" };

type Brief = {
  projectTitle: string;
  cwd: string | null;
  pendingTasks: Task[];
  inProgressTasks: Task[];
  recentlyDone: DoneTask[];
  lastSessionSummary: SessionLog | null;
  recommendedNextTasks?: NextTask[];
  briefSkillContent?: string;
};

type BriefResponse = { ok: true; brief: Brief } | { ok: false; error: string };

export async function handleBrief(projectId: string, config: McpConfig): Promise<string> {
  const data = await mcpGet<BriefResponse>(config, "/api/memory/brief", { projectId });
  if (!data.ok) throw new Error(data.error);

  const b = data.brief;
  const lines: string[] = [];

  lines.push(`# ${b.projectTitle} 현황`);

  if (b.lastSessionSummary) {
    const date = new Date(b.lastSessionSummary.createdAt).toLocaleDateString("ko-KR");
    lines.push(`이전 세션 (${date}): ${b.lastSessionSummary.summary}`);
  }

  if (b.inProgressTasks.length > 0) {
    lines.push(`\n진행 중:`);
    for (const t of b.inProgressTasks) {
      const mod = t.module ? ` [${t.module}]` : "";
      lines.push(`- #${t.seq} ${t.title}${mod}`);
    }
  }

  if (b.pendingTasks.length > 0) {
    lines.push(`\n대기 중:`);
    for (const t of b.pendingTasks) {
      const mod = t.module ? ` [${t.module}]` : "";
      lines.push(`- #${t.seq} ${t.title}${mod}${t.priority > 0 ? ` P${t.priority}` : ""}`);
    }
  }

  lines.push(`\n## 추천 작업`);

  // 1번: AI 추천 최우선 1개
  const topAi = b.recommendedNextTasks?.[0];
  if (topAi) {
    lines.push(`1. **${topAi.title}**${topAi.reason ? ` — ${topAi.reason}` : ""}`);
  }

  // 2-3번: 최근 완료 + 커밋 기반 컨텍스트 → Claude가 분석해서 제안
  const contextParts: string[] = [];

  const recentDone = b.recentlyDone.slice(0, 3);
  if (recentDone.length > 0) {
    contextParts.push("최근 완료: " + recentDone.map((t) => `#${t.seq} ${t.title}`).join(", "));
  }

  const commits = b.cwd ? getRecentCommits(b.cwd) : [];
  if (commits.length > 0) {
    contextParts.push("최근 커밋:\n" + commits.map((c) => `  ${c}`).join("\n"));
  }

  if (contextParts.length > 0) {
    lines.push(`\n위 컨텍스트를 분석해서 2번, 3번 추천 작업 2개를 한 줄씩 간결하게 제안하세요:`);
    lines.push(contextParts.join("\n"));
  } else if (!topAi) {
    lines.push("등록된 태스크나 이전 작업이 없어요. 하려는 작업을 말씀해주세요.");
  }

  if (b.briefSkillContent) {
    lines.push(`\n---\n${b.briefSkillContent}`);
  }

  return lines.join("\n");
}

function getRecentCommits(cwd: string): string[] {
  try {
    const out = execSync("git log --oneline --no-merges -5", { cwd, encoding: "utf8", timeout: 3000 });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
