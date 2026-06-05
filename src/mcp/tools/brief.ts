import { execSync } from "node:child_process";

import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type Task = { id: string; seq: number; title: string; tool: string | null; priority: number; folderId: string | null };
type DoneTask = { seq: number; title: string; outcome: string | null; keyDecisions: string[] };
type NextTask = { title: string; reason?: string; priority: "high" | "medium" | "low" };
type Folder = { id: string; name: string; taskCount: number };
type ProjectTool = { slug: string; name: string; folder: string; contextHint: string };
type ToolSuggestion = { name: string; description: string; folder: string; content: string; patternSummary: string };

type RecentTask = { seq: number; title: string; status: string; updatedAt: string };
type AiSummary = { summary: string; warnings: string[]; suggestions: string[] };
type LongTermTask = { seq: number; title: string; lastAccessedAt: string | null };
type ReflectionInsight = { type: string; text: string };
type LatestReflection = { contextSummary: string | null; insights: ReflectionInsight[] };

type Brief = {
  projectTitle: string;
  cwd: string | null;
  pendingTasks: Task[];
  inProgressTasks: Task[];
  recentlyDone: DoneTask[];
  recentlyModified?: RecentTask[];
  folders: Folder[];
  tools?: ProjectTool[];
  toolSuggestions?: ToolSuggestion[];
  aiSummary?: AiSummary;
  recommendedNextTasks?: NextTask[];
  longTermTasks?: LongTermTask[];
  latestReflection?: LatestReflection;
  memoryContext?: string | null;
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

  // 최근 작업 흐름: AI 요약 + 완료 태스크 + 커밋 → Claude가 bullet 3개로 합성
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
    lines.push(`[다음 정보를 바탕으로 "최근 작업 흐름:" bullet 3개를 작성하세요]`);
    lines.push(...flowContext);
    lines.push("");
  }

  // 프로젝트 상태 요약
  const statusCtx: string[] = [];
  const recentDone = b.recentlyDone.slice(0, 3);
  if (recentDone.length > 0) {
    statusCtx.push(`최근 완료: ${recentDone.map((t) => t.title).join(", ")}`);
    const withDecisions = recentDone.filter((t) => t.keyDecisions.length > 0);
    for (const t of withDecisions) {
      statusCtx.push(`  #${t.seq} 핵심 결정: ${t.keyDecisions.join(" / ")}`);
    }
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

  // 진행 중·대기 태스크 목록 (에이전트가 현재 상태 파악용)
  if (b.inProgressTasks.length > 0) {
    lines.push(`진행 중인 태스크:`);
    for (const t of b.inProgressTasks) {
      const folder = t.folderId ? folderMap.get(t.folderId) : null;
      lines.push(`- #${t.seq} ${t.title}${t.tool ? ` [${t.tool}]` : ""}${folder ? ` (${folder})` : ""}`);
    }
    lines.push("");
  }
  if (b.pendingTasks.length > 0) {
    lines.push(`대기 중인 태스크:`);
    for (const t of b.pendingTasks) {
      const folder = t.folderId ? folderMap.get(t.folderId) : null;
      lines.push(`- #${t.seq} ${t.title}${t.tool ? ` [${t.tool}]` : ""}${folder ? ` (${folder})` : ""}`);
    }
    lines.push("");
  }

  // 폴더 목록 (add_task 시 folderId 참조용)
  if (activeFolders.length > 0) {
    lines.push(`폴더 목록 (add_task 시 folderId 사용):`);
    for (const f of activeFolders) {
      lines.push(`- ${f.name} (id: ${f.id}, 태스크 ${f.taskCount}개)`);
    }
    lines.push("");
  }

  lines.push(`추천 태스크:`);

  // DB AI 추천 최대 3개 먼저 출력
  const aiRecs = b.recommendedNextTasks ?? [];
  let recNum = 1;
  for (const rec of aiRecs.slice(0, 3)) {
    lines.push(`${recNum}) ${rec.title}${rec.reason ? ` — ${rec.reason}` : ""}`);
    recNum++;
  }

  // DB 추천이 3개 미만이면 대기 태스크·커밋 컨텍스트로 나머지 채우도록 지시
  if (recNum <= 3) {
    const recContext: string[] = [];
    if (b.pendingTasks.length > 0) {
      recContext.push("대기 중인 태스크: " + b.pendingTasks.slice(0, 5).map((t) => `#${t.seq} ${t.title}`).join(", "));
    }
    if (recentDone.length > 0) {
      recContext.push("최근 완료 태스크: " + recentDone.map((t) => t.title).join(", "));
    }
    if (commits.length > 0) {
      recContext.push("최근 커밋: " + commits.map((c) => c.replace(/^[a-f0-9]+ /, "")).join(" / "));
    }
    if (recContext.length > 0) {
      lines.push(`[위 정보를 바탕으로 ${recNum})~3) 추천 태스크를 "N) 태스크명" 형식으로 각 한 줄씩 추가하세요]`);
      lines.push(...recContext);
    } else if (recNum === 1) {
      lines.push("등록된 태스크나 이전 작업이 없어요. 하려는 작업을 말씀해주세요.");
    }
  }

  // AI 프로젝트 맥락 (성장형 plain text 기억)
  if (b.memoryContext) {
    lines.push(`\nAI 프로젝트 맥락 (자기학습 기억):\n${b.memoryContext}`);
  }

  // 장기 기억 (LONG_TERM) 태스크
  if (b.longTermTasks && b.longTermTasks.length > 0) {
    lines.push(`\n장기 기억 (영구 보존):`);
    for (const t of b.longTermTasks) {
      const ago = t.lastAccessedAt ? daysAgo(t.lastAccessedAt) : null;
      lines.push(`- #${t.seq} ${t.title}${ago !== null ? ` [${ago}일 전 접근]` : ""}`);
    }
  }

  // 최근 AI 메모리 인사이트
  if (b.latestReflection) {
    const r = b.latestReflection;
    if (r.contextSummary || (r.insights && r.insights.length > 0)) {
      lines.push(`\nAI 메모리 분석:`);
      if (r.contextSummary) lines.push(`프로젝트 맥락: ${r.contextSummary}`);
      for (const ins of (r.insights ?? []).slice(0, 3)) {
        const label = ins.type === "pattern" ? "패턴" : ins.type === "risk" ? "위험" : "인사이트";
        lines.push(`- [${label}] ${ins.text}`);
      }
    }
  }

  // 프로젝트 툴 (folder별 그룹핑)
  if (b.tools && b.tools.length > 0) {
    const byFolder = new Map<string, ProjectTool[]>();
    for (const t of b.tools) {
      const arr = byFolder.get(t.folder) ?? [];
      arr.push(t);
      byFolder.set(t.folder, arr);
    }
    lines.push(`\n프로젝트 툴 (load_tool로 로드):`);
    for (const [folder, tools] of byFolder) {
      lines.push(`[${folder}]`);
      for (const t of tools) {
        lines.push(`- ${t.slug}: ${t.name} — ${t.contextHint}`);
      }
    }
  }

  // 툴 제안 (패턴 감지됨)
  if (b.toolSuggestions && b.toolSuggestions.length > 0) {
    lines.push(`\n💡 툴 제안 (반복 패턴 감지됨):`);
    for (const s of b.toolSuggestions) {
      lines.push(`- "${s.name}": ${s.description} [폴더: ${s.folder}]`);
      lines.push(`  근거: ${s.patternSummary}`);
      lines.push(`  → propose_tool(name="${s.name}", folder="${s.folder}", ...)로 등록하세요.`);
    }
  }

  return lines.join("\n");
}

function daysAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

function getRecentCommits(cwd: string): string[] {
  try {
    const out = execSync("git log --oneline --no-merges -10", { cwd, encoding: "utf8", timeout: 3000 });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
