import { execSync } from "node:child_process";

import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = { id: string; seq: number; title: string; module: string | null; priority: number; folderId: string | null };
type DoneTask = { seq: number; title: string; outcome: string | null };
type NextTask = { title: string; reason?: string; priority: "high" | "medium" | "low" };
type Folder = { id: string; name: string; taskCount: number };
type Skill = { slug: string; name: string; contextHint: string; category: string };

type RecentTask = { seq: number; title: string; status: string; updatedAt: string };
type AiSummary = { summary: string; warnings: string[]; suggestions: string[] };

type Brief = {
  projectTitle: string;
  cwd: string | null;
  pendingTasks: Task[];
  inProgressTasks: Task[];
  recentlyDone: DoneTask[];
  recentlyModified?: RecentTask[];
  folders: Folder[];
  availableSkills?: Skill[];
  aiSummary?: AiSummary;
  recommendedNextTasks?: NextTask[];
  briefSkillContent?: string;
};

type BriefResponse = { ok: true; brief: Brief } | { ok: false; error: string };

export async function handleBrief(projectId: string, config: McpConfig): Promise<string> {
  const data = await mcpGet<BriefResponse>(config, "/api/memory/brief", { projectId });
  if (!data.ok) throw new Error(data.error);

  const b = data.brief;
  const commits = b.cwd ? getRecentCommits(b.cwd) : [];
  const lines: string[] = [];

  // 폴더 id → name 맵 (add_task 시 참조용)
  const folderMap = new Map((b.folders ?? []).map((f) => [f.id, f.name]));

  // 최근 작업 흐름: AI 요약 + 완료 태스크 + 커밋 → Claude가 1-2줄로 합성
  const flowContext: string[] = [];
  if (b.aiSummary?.summary) {
    flowContext.push(`프로젝트 AI 요약: ${b.aiSummary.summary}`);
  }
  const recentDoneForFlow = b.recentlyDone.slice(0, 3);
  if (recentDoneForFlow.length > 0) {
    flowContext.push("최근 완료 태스크: " + recentDoneForFlow.map((t) => t.title).join(", "));
  }
  if (commits.length > 0) {
    flowContext.push("최근 커밋: " + commits.map((c) => c.replace(/^[a-f0-9]+ /, "")).join(" / "));
  }
  if (flowContext.length > 0) {
    lines.push(`[다음 정보를 바탕으로 "최근 작업 흐름:" 1-2줄 흐름을 작성하세요 (없으면 생략)]`);
    lines.push(...flowContext);
    lines.push("");
  }

  // 진행 중 태스크 (있을 때만)
  if (b.inProgressTasks.length > 0) {
    lines.push(`진행 중:`);
    for (const t of b.inProgressTasks) {
      const mod = t.module ? ` [${t.module}]` : "";
      const folder = t.folderId ? ` 📁${folderMap.get(t.folderId) ?? ""}` : "";
      lines.push(`- #${t.seq} ${t.title}${mod}${folder}`);
    }
    lines.push("");
  }

  // 프로젝트 상태 요약: 태스크 통계 → Claude가 2~3줄 bullet으로 합성
  const statusCtx: string[] = [];
  statusCtx.push(`진행 중: ${b.inProgressTasks.length}개 (${b.inProgressTasks.map((t) => t.title).join(", ") || "없음"})`);
  statusCtx.push(`대기 중: ${b.pendingTasks.length}개 (우선순위순: ${b.pendingTasks.slice(0, 3).map((t) => t.title).join(", ") || "없음"})`);
  const recentDone = b.recentlyDone.slice(0, 3);
  if (recentDone.length > 0) {
    statusCtx.push(`최근 완료: ${recentDone.map((t) => t.title).join(", ")}`);
  }
  if (b.aiSummary?.warnings?.length) {
    statusCtx.push(`주의: ${b.aiSummary.warnings.join(", ")}`);
  }
  const activeFolders = (b.folders ?? []).filter((f) => f.taskCount > 0);
  if (activeFolders.length > 0) {
    statusCtx.push(`폴더: ${activeFolders.map((f) => `${f.name}(${f.taskCount}개)`).join(", ")}`);
  }
  lines.push(`[아래 태스크 정보를 바탕으로 현재 프로젝트 상태를 2~3줄 bullet으로 요약하세요 (각 줄 "- " 로 시작)]`);
  lines.push(...statusCtx);
  lines.push("");

  // 폴더 목록 (add_task 시 folderId 참조용)
  if (activeFolders.length > 0) {
    lines.push(`폴더 목록 (add_task 시 folderId 사용):`);
    for (const f of activeFolders) {
      lines.push(`- ${f.name} (id: ${f.id}, 태스크 ${f.taskCount}개)`);
    }
    lines.push("");
  }

  lines.push(`추천 태스크:`);

  // 1번: AI 추천 최우선 1개
  const topAi = b.recommendedNextTasks?.[0];
  if (topAi) {
    lines.push(`1) ${topAi.title}${topAi.reason ? ` — ${topAi.reason}` : ""}`);
  }

  // 2-3번: 대기 태스크 + 완료 태스크 + 커밋 기반 컨텍스트 → Claude가 채움
  const recContext: string[] = [];
  if (recentDone.length > 0) {
    recContext.push("최근 완료 태스크: " + recentDone.map((t) => t.title).join(", "));
  }
  if (b.pendingTasks.length > 0) {
    recContext.push("대기 태스크: " + b.pendingTasks.map((t) => t.title).join(", "));
  }
  if (commits.length > 0) {
    recContext.push("최근 커밋: " + commits.map((c) => c.replace(/^[a-f0-9]+ /, "")).join(" / "));
  }

  if (recContext.length > 0) {
    lines.push(`[아래 컨텍스트 분석 후 2), 3) 추천 태스크를 "N) 태스크명" 형식으로 각 한 줄씩 추가하세요]`);
    lines.push(...recContext);
  } else if (!topAi) {
    lines.push("등록된 태스크나 이전 작업이 없어요. 하려는 작업을 말씀해주세요.");
  }

  // 사용 가능한 스킬 목록
  if (b.availableSkills && b.availableSkills.length > 0) {
    lines.push(`\n사용 가능한 스킬 (load_skill로 로드):`);
    for (const s of b.availableSkills) {
      lines.push(`- ${s.slug}: ${s.name} — ${s.contextHint}`);
    }
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
