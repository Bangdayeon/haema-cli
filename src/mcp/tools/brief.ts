import { execSync } from "node:child_process";

import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = { id: string; seq: number; title: string; module: string | null; priority: number };
type Thought = { id: string; content: string; tags: string[]; createdAt: string };
type DoneTask = { id: string; seq: number; title: string; doneAt: string | null };
type SessionLog = { id: string; summary: string; aiTool: string; createdAt: string };

type Brief = {
  projectTitle: string;
  cwd: string | null;
  pendingTasks: Task[];
  inProgressTasks: Task[];
  recentDecisions: Thought[];
  recentlyDone: DoneTask[];
  rules: string[];
  lastSessionSummary: SessionLog | null;
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

  // 다음 단계 제안 섹션
  lines.push(`\n## 🎯 다음 단계 제안`);

  const suggestions: string[] = [];

  if (b.inProgressTasks.length > 0) {
    for (const t of b.inProgressTasks.slice(0, 2)) {
      suggestions.push(`- #${t.seq} **${t.title}** 계속 진행하기${t.module ? ` (${t.module})` : ""}`);
    }
  }

  const bugThoughts = b.recentDecisions.filter((d) => d.tags.includes("bug"));
  if (bugThoughts.length > 0 && suggestions.length < 3) {
    suggestions.push(`- 최근 기록된 버그 수정: "${bugThoughts[0].content.slice(0, 60)}${bugThoughts[0].content.length > 60 ? "…" : ""}"`);
  }

  const pendingByPriority = [...b.pendingTasks].sort((a, b) => b.priority - a.priority);
  for (const t of pendingByPriority) {
    if (suggestions.length >= 3) break;
    const alreadyIn = b.inProgressTasks.some((i) => i.id === t.id);
    if (!alreadyIn) {
      suggestions.push(`- #${t.seq} **${t.title}** 시작하기${t.module ? ` (${t.module})` : ""}${t.priority > 0 ? ` [P${t.priority}]` : ""}`);
    }
  }

  const decisionThoughts = b.recentDecisions.filter(
    (d) => d.tags.includes("decision") || d.tags.includes("architecture"),
  );
  if (decisionThoughts.length > 0 && suggestions.length < 3) {
    suggestions.push(`- 최근 결정 사항 구현: "${decisionThoughts[0].content.slice(0, 60)}${decisionThoughts[0].content.length > 60 ? "…" : ""}"`);
  }

  if (suggestions.length === 0) {
    const commits = b.cwd ? getRecentCommits(b.cwd) : [];
    if (commits.length > 0) {
      lines.push("등록된 태스크나 메모가 없어요. 최근 커밋을 바탕으로 다음 작업을 추천해주세요:\n");
      lines.push("**최근 커밋 (참고용):**");
      for (const c of commits) lines.push(`  ${c}`);
      lines.push(
        "\n위 커밋 흐름을 분석해서, 지금 시점에 가장 자연스러운 다음 작업 2-3개를 구체적으로 제안해주세요. 유저가 선택하면 `add_task`로 바로 등록해드릴게요.",
      );
    } else {
      lines.push(
        "아직 등록된 태스크나 메모가 없어요. 지금 하려는 작업을 말씀해주시면 태스크로 등록해드릴게요.",
      );
    }
  } else {
    lines.push(...suggestions);
  }

  lines.push(
    "\n위 항목 중 진행할 것을 선택하거나, 추가로 원하는 기능/작업이 있으면 말씀해주세요. `add_task`로 바로 등록해드릴게요.",
  );

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
