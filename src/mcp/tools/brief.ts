import { execSync } from "node:child_process";

import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = { id: string; seq: number; title: string; description: string | null; module: string | null; priority: number };
type DoneTask = {
  id: string;
  seq: number;
  title: string;
  module: string | null;
  outcome: string | null;
  keyDecisions: string[];
  doneAt: string | null;
};
type SessionLog = { id: string; summary: string; aiTool: string; createdAt: string };
type NextTask = { title: string; reason?: string; priority: "high" | "medium" | "low"; agentCommand?: string };
type AiSummary = { summary: string; warnings: unknown[]; suggestions: unknown[] };

type Brief = {
  projectTitle: string;
  cwd: string | null;
  pendingTasks: Task[];
  inProgressTasks: Task[];
  recentDecisions: DoneTask[];
  recentlyDone: DoneTask[];
  rules: string[];
  lastSessionSummary: SessionLog | null;
  recommendedNextTasks?: NextTask[];
  aiSummary?: AiSummary;
  briefSkillContent?: string;
};

type BriefResponse = { ok: true; brief: Brief } | { ok: false; error: string };

export async function handleBrief(projectId: string, config: McpConfig): Promise<string> {
  const data = await mcpGet<BriefResponse>(config, "/api/memory/brief", { projectId });
  if (!data.ok) throw new Error(data.error);

  const b = data.brief;
  const lines: string[] = [];

  lines.push(`# Votra Memory — Session Brief`);
  lines.push(`\n## Project: ${b.projectTitle}${b.cwd ? ` (${b.cwd})` : ""}`);

  if (b.lastSessionSummary) {
    const date = new Date(b.lastSessionSummary.createdAt).toLocaleDateString("ko-KR");
    lines.push(`\n## 🕐 이전 세션 요약 (${date})`);
    lines.push(b.lastSessionSummary.summary);
  }

  if (b.inProgressTasks.length > 0) {
    lines.push(`\n## 🔄 진행 중 (${b.inProgressTasks.length})`);
    for (const t of b.inProgressTasks) {
      const mod = t.module ? ` [${t.module}]` : "";
      lines.push(`- #${t.seq} **${t.title}**${mod}${t.priority > 0 ? ` P${t.priority}` : ""}`);
      if (t.description) lines.push(`  ${t.description}`);
    }
  }

  if (b.pendingTasks.length > 0) {
    lines.push(`\n## 📋 대기 중 (${b.pendingTasks.length})`);
    for (const t of b.pendingTasks) {
      const mod = t.module ? ` [${t.module}]` : "";
      lines.push(`- #${t.seq} **${t.title}**${mod}${t.priority > 0 ? ` P${t.priority}` : ""}`);
      if (t.description) lines.push(`  ${t.description}`);
    }
  }

  if (b.recentlyDone.length > 0) {
    lines.push(`\n## ✅ 최근 완료`);
    for (const t of b.recentlyDone) {
      const mod = t.module ? ` [${t.module}]` : "";
      const date = t.doneAt ? ` (${new Date(t.doneAt).toLocaleDateString("ko-KR")})` : "";
      lines.push(`- #${t.seq} **${t.title}**${mod}${date}`);
      if (t.outcome) lines.push(`  → ${t.outcome}`);
      if (t.keyDecisions.length > 0) {
        for (const d of t.keyDecisions) lines.push(`  • ${d}`);
      }
    }
  }

  if (b.rules.length > 0) {
    lines.push(`\n## 📖 프로젝트 규칙 (CLAUDE.md)`);
    lines.push(b.rules.join("\n"));
  }

  if (b.recommendedNextTasks && b.recommendedNextTasks.length > 0) {
    const priorityLabel = { high: "P1", medium: "P2", low: "P3" } as const;
    lines.push(`\n## 🤖 AI 추천 태스크 (${b.recommendedNextTasks.length}개)`);
    for (const t of b.recommendedNextTasks) {
      const p = priorityLabel[t.priority] ?? "P3";
      lines.push(`- [${p}] **${t.title}**`);
      if (t.reason) lines.push(`  > ${t.reason}`);
    }
  }

  {
    lines.push(`\n## 🎯 다음 단계 제안`);
    const suggestions: string[] = [];

    if (b.inProgressTasks.length > 0) {
      for (const t of b.inProgressTasks.slice(0, 2)) {
        suggestions.push(`- #${t.seq} **${t.title}** 계속 진행하기${t.module ? ` (${t.module})` : ""}`);
      }
    }

    const pendingByPriority = [...b.pendingTasks].sort((a, bTask) => bTask.priority - a.priority);
    for (const t of pendingByPriority) {
      if (suggestions.length >= 3) break;
      if (!b.inProgressTasks.some((i) => i.id === t.id)) {
        suggestions.push(`- #${t.seq} **${t.title}** 시작하기${t.module ? ` (${t.module})` : ""}${t.priority > 0 ? ` [P${t.priority}]` : ""}`);
      }
    }

    if (suggestions.length === 0) {
      const commits = b.cwd ? getRecentCommits(b.cwd) : [];
      if (commits.length > 0) {
        lines.push("등록된 태스크가 없어요. 최근 커밋을 바탕으로 다음 작업을 추천해주세요:\n");
        lines.push("**최근 커밋 (참고용):**");
        for (const c of commits) lines.push(`  ${c}`);
        lines.push("\n위 커밋 흐름을 분석해서, 지금 시점에 가장 자연스러운 다음 작업 2-3개를 구체적으로 제안해주세요.");
      } else {
        lines.push("아직 등록된 태스크가 없어요. 지금 하려는 작업을 말씀해주시면 태스크로 등록해드릴게요.");
      }
    } else {
      lines.push(...suggestions);
    }

    lines.push("\n위 항목 중 진행할 것을 선택하거나, 추가로 원하는 기능/작업이 있으면 말씀해주세요.");
  }

  if (b.briefSkillContent) {
    lines.push(`\n---\n${b.briefSkillContent}`);
  }

  return lines.join("\n");
}

function getRecentCommits(cwd: string): string[] {
  try {
    const out = execSync("git log --oneline --no-merges -10", { cwd, encoding: "utf8", timeout: 3000 });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
