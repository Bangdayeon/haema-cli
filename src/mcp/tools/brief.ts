import { execSync } from "node:child_process";

import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = { id: string; seq: number; title: string; module: string | null; priority: number; folderId: string | null };
type DoneTask = { seq: number; title: string; outcome: string | null };
type SessionLog = { summary: string; createdAt: string };
type NextTask = { title: string; reason?: string; priority: "high" | "medium" | "low" };
type Folder = { id: string; name: string; taskCount: number };
type Skill = { slug: string; name: string; contextHint: string; category: string };

type RecentTask = { seq: number; title: string; status: string; updatedAt: string };

type Brief = {
  projectTitle: string;
  cwd: string | null;
  pendingTasks: Task[];
  inProgressTasks: Task[];
  recentlyDone: DoneTask[];
  recentlyModified?: RecentTask[];
  folders: Folder[];
  availableSkills?: Skill[];
  lastSessionSummary: SessionLog | null;
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

  // 폴더 id → name 맵 (태스크 출력 시 참조)
  const folderMap = new Map((b.folders ?? []).map((f) => [f.id, f.name]));

  // 최근 작업 흐름: 커밋 + 세션 요약 → Claude가 한 줄로 합성
  const flowContext: string[] = [];
  if (b.lastSessionSummary) {
    const date = new Date(b.lastSessionSummary.createdAt).toLocaleDateString("ko-KR");
    flowContext.push(`이전 세션 (${date}): ${b.lastSessionSummary.summary}`);
  }
  if (commits.length > 0) {
    flowContext.push("최근 커밋: " + commits.map((c) => c.replace(/^[a-f0-9]+ /, "")).join(" / "));
  }
  if (flowContext.length > 0) {
    lines.push(`[다음 정보를 바탕으로 "최근 작업 흐름: ..." 한 줄 서술을 작성하세요]`);
    lines.push(...flowContext);
    lines.push("");
  }

  if (b.inProgressTasks.length > 0) {
    lines.push(`진행 중:`);
    for (const t of b.inProgressTasks) {
      const mod = t.module ? ` [${t.module}]` : "";
      const folder = t.folderId ? ` 📁${folderMap.get(t.folderId) ?? ""}` : "";
      lines.push(`- #${t.seq} ${t.title}${mod}${folder}`);
    }
    lines.push("");
  }

  if (b.pendingTasks.length > 0) {
    lines.push(`대기 중:`);
    for (const t of b.pendingTasks) {
      const mod = t.module ? ` [${t.module}]` : "";
      const folder = t.folderId ? ` 📁${folderMap.get(t.folderId) ?? ""}` : "";
      lines.push(`- #${t.seq} ${t.title}${mod}${folder}${t.priority > 0 ? ` P${t.priority}` : ""}`);
    }
    lines.push("");
  }

  // 최근 수정 태스크 (수정일순 10개)
  if (b.recentlyModified && b.recentlyModified.length > 0) {
    const STATUS_LABEL: Record<string, string> = {
      PENDING: "대기",
      IN_PROGRESS: "진행중",
      DONE: "완료",
      CANCELLED: "취소",
    };
    lines.push(`최근 태스크 (수정일순):`);
    for (const t of b.recentlyModified) {
      const date = new Date(t.updatedAt).toLocaleDateString("ko-KR");
      const status = STATUS_LABEL[t.status] ?? t.status;
      lines.push(`- #${t.seq} [${status}] ${t.title} (${date})`);
    }
    lines.push("");
  }

  // 폴더 목록 (태스크가 있는 폴더만 표시, add_task 시 folderId 참조용)
  const activeFolders = (b.folders ?? []).filter((f) => f.taskCount > 0);
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

  const recentDone = b.recentlyDone.slice(0, 3);
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
