import http from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import type { McpConfig } from "./mcpClient.js";
import { resolveOrInitProject, resolveProject } from "./resolveProjectId.js";
import { handleAddTask } from "./tools/addTask.js";
import { handleBrief } from "./tools/brief.js";
import { handleCreateFolder } from "./tools/createFolder.js";
import { handleGetTask } from "./tools/getTask.js";
import { handleFinishTask } from "./tools/finishTask.js";
import { handleListTasks } from "./tools/listTasks.js";
import { handleLoadSkill } from "./tools/loadSkill.js";
import { handleRecall } from "./tools/recall.js";
import { handleSignin } from "./tools/signin.js";
import { handleSignout } from "./tools/signout.js";
import { handleStartTask } from "./tools/startTask.js";
import { handleUpdateTask } from "./tools/updateTask.js";
import { handleUploadPrompt } from "./tools/uploadPrompt.js";
import { handleWhoami } from "./tools/whoami.js";

// 모든 일반 tool에 공통으로 붙는 optional cwd 파라미터
const cwdParam = {
  cwd: z
    .string()
    .optional()
    .describe(
      "프로젝트 절대경로 (생략 시 서버 시작 디렉토리의 프로젝트 사용). " +
        "여러 프로젝트를 넘나들 때 명시해요.",
    ),
};

function createServer(config: McpConfig | null, startCwd: string): McpServer {
  const server = new McpServer({ name: "votra-memory", version: "1.0.0" });

  // 서버 시작 cwd 기준 projectId를 첫 툴 호출 시점에 한 번만 resolve (lazy).
  // undefined = 아직 조회 안 함, null = 조회했으나 미등록 프로젝트
  let defaultProjectId: string | null | undefined = undefined;
  async function getDefaultPid(): Promise<string | null> {
    if (defaultProjectId === undefined) {
      defaultProjectId = await resolveOrInitProject(startCwd, config!);
    }
    return defaultProjectId;
  }

  const NOT_REGISTERED = {
    content: [{
      type: "text" as const,
      text: "votra 프로젝트를 찾을 수 없어요. `signin` 툴로 로그인 상태를 확인해 주세요.",
    }],
  };

  const NOT_LOGGED_IN = {
    content: [{
      type: "text" as const,
      text: "로그인이 필요해요. `signin` 툴로 먼저 로그인해 주세요.",
    }],
  };

  server.tool(
    "brief",
    "세션 시작 브리핑. 현재 상태, AI 추천 태스크, 행동 지침을 반환해요. 응답 하단의 지침 섹션을 반드시 따르세요.",
    cwdParam,
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleBrief(pid, config) }] };
    },
  );

  server.tool(
    "recall",
    "의미 유사도로 과거 생각을 검색해요.",
    {
      ...cwdParam,
      query: z.string().describe("검색 쿼리"),
      limit: z.number().int().min(1).max(50).optional().describe("최대 결과 수 (기본 10)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleRecall(args, pid, config) }] };
    },
  );

  server.tool(
    "add_task",
    "새 태스크를 추가해요. 유저 작업 요청 시 코드 작업 전에 반드시 먼저 호출하세요. 등록 직후 update_task로 IN_PROGRESS 변경.",
    {
      ...cwdParam,
      title: z.string().describe("태스크 제목"),
      description: z.string().optional().describe("상세 설명"),
      module: z.string().optional().describe("모듈 슬러그. backend · frontend · database · designer · integration · devops · planner · testing 중 선택 (스킬 자동 매칭에 사용됨)"),
      priority: z.number().int().min(0).max(10).optional().describe("우선순위 0-10 (기본 0)"),
      folderId: z.string().optional().describe("폴더 ID (brief의 폴더 목록에서 확인)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleAddTask(args, pid, config) }] };
    },
  );

  server.tool(
    "start_task",
    "태스크를 생성하고 즉시 IN_PROGRESS로 시작해요. add_task + update_task(IN_PROGRESS) 두 번 호출을 한 번으로 줄여요.",
    {
      ...cwdParam,
      title: z.string().describe("태스크 제목"),
      description: z.string().optional().describe("상세 설명"),
      module: z.string().optional().describe("모듈 슬러그. backend · frontend · database · designer · integration · devops · planner · testing 중 선택 (스킬 자동 매칭에 사용됨)"),
      priority: z.number().int().min(0).max(10).optional().describe("우선순위 0-10 (기본 0)"),
      folderId: z.string().optional().describe("폴더 ID (brief의 폴더 목록에서 확인)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleStartTask(args, pid, config) }] };
    },
  );

  server.tool(
    "finish_task",
    "태스크를 DONE으로 완료해요. keyDecisions에는 이 태스크에서 내린 핵심 결정/인사이트를 추출해서 전달하세요 — 아키텍처 선택, 버그 원인, 방향 변경 등 다음 세션에서 recall로 찾을 만한 내용만. 단순 구현 작업은 생략.",
    {
      ...cwdParam,
      taskSeq: z.number().int().positive().describe("완료할 태스크 번호 (예: 1, 42)"),
      summary: z.string().describe("이번 세션에서 한 작업 요약 (2-5문장)"),
      aiTool: z
        .enum(["claude", "cursor", "gemini", "codex"])
        .optional()
        .describe("사용 중인 AI 도구 (생략 시 unknown)"),
      keyDecisions: z
        .array(z.string())
        .optional()
        .describe("이 태스크의 핵심 결정/인사이트 목록. recall 검색 대상이 됨."),
      outcome: z
        .string()
        .optional()
        .describe("실제로 무엇을 구현/변경했는지 자유 서술 (2-5문장). 다음 세션에서 이 태스크 결과를 빠르게 파악하는 데 쓰임."),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleFinishTask(args, pid, config) }] };
    },
  );

  server.tool(
    "update_task",
    "태스크 상태나 내용을 업데이트해요. taskSeq 는 list_tasks 나 brief 에서 표시되는 #번호예요. 작업 시작 시 IN_PROGRESS, 완료 시 DONE으로 반드시 업데이트하세요.",
    {
      ...cwdParam,
      taskSeq: z.number().int().positive().describe("태스크 번호 (예: 1, 42)"),
      status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"]).optional().describe("새 상태"),
      title: z.string().optional().describe("새 제목"),
      description: z.string().optional().describe("새 설명"),
      module: z.string().optional().describe("새 모듈명"),
      priority: z.number().int().min(0).max(10).optional().describe("새 우선순위"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleUpdateTask({ ...args, projectId: pid }, config) }] };
    },
  );

  server.tool(
    "load_skill",
    "상황에 맞는 스킬의 전체 지침을 로드해요. brief 응답에 listed된 사용 가능한 스킬을 맥락에 맞게 호출하세요.",
    {
      ...cwdParam,
      slug: z.string().describe("스킬 슬러그 (예: planner, reviewer)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleLoadSkill(args, pid, config) }] };
    },
  );

  server.tool(
    "propose_skill",
    "이 프로젝트에 커스텀 스킬을 등록해요. 반복 패턴을 3번 이상 작업했을 때 스킬로 저장하면 다음 세션에서 load_skill로 바로 불러올 수 있어요.",
    {
      ...cwdParam,
      name: z.string().describe("스킬 이름 (예: '타입스크립트 마이그레이션')"),
      description: z.string().describe("한 줄 설명"),
      folder: z.string().describe("스킬 그룹 폴더명 (예: 리팩토링, 테스트, 배포)"),
      content: z.string().describe("에이전트가 따를 마크다운 지침 전문"),
      patternSummary: z.string().optional().describe("이 패턴이 필요하다고 판단한 근거"),
      contextHint: z.string().describe("이 스킬을 사용해야 하는 상황 (예: 외부 API 연동 태스크 시작 전에 사용)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      const res = await fetch(`${config.appUrl}/api/memory/custom-skills`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          projectId: pid,
          name: args.name,
          description: args.description,
          folder: args.folder,
          content: args.content,
          patternSummary: args.patternSummary,
          contextHint: args.contextHint,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json() as { ok: boolean; skill?: { slug: string; name: string }; error?: string };
      if (!data.ok) return { content: [{ type: "text" as const, text: `오류: ${data.error}` }] };
      return {
        content: [{
          type: "text" as const,
          text: `스킬 등록 완료: "${data.skill!.name}" (슬러그: ${data.skill!.slug})\n다음 세션부터 load_skill(slug="${data.skill!.slug}")로 불러올 수 있어요.`,
        }],
      };
    },
  );

  server.tool(
    "task_detail",
    "태스크 하나의 전체 상세 정보를 조회해요. title, description, status, module, outcome, keyDecisions 등을 반환해요.",
    {
      ...cwdParam,
      taskSeq: z.number().int().positive().describe("태스크 번호 (예: 1, 42)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleGetTask(args, pid, config) }] };
    },
  );

  server.tool(
    "list_tasks",
    "태스크 목록을 봐요. status 와 module 로 필터링 가능.",
    {
      ...cwdParam,
      status: z
        .enum(["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"])
        .optional()
        .describe("상태 필터"),
      module: z.string().optional().describe("모듈 필터 (예: auth)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleListTasks(args, pid, config) }] };
    },
  );

  server.tool(
    "pin_task",
    "태스크를 장기 기억(LONG_TERM)으로 고정해요. AI 자동 감쇠 대상에서 영구 제외되며 brief에 항상 표시됩니다.",
    {
      ...cwdParam,
      taskSeq: z.number().int().positive().describe("고정할 태스크 번호 (예: 1, 42)"),
      pin: z.boolean().optional().describe("true=고정, false=고정 해제 (기본값 true)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      const isPinned = args.pin !== false;
      const res = await fetch(`${config.appUrl}/api/memory/tasks/${args.taskSeq}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ projectId: pid, isPinned }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { content: [{ type: "text" as const, text: `오류: ${data.error}` }] };
      return {
        content: [{
          type: "text" as const,
          text: isPinned
            ? `#${args.taskSeq} 태스크를 장기 기억으로 고정했어요. AI 감쇠 대상에서 제외됩니다.`
            : `#${args.taskSeq} 태스크의 장기 기억 고정을 해제했어요.`,
        }],
      };
    },
  );

  server.tool(
    "get_insights",
    "최근 AI 메모리 분석 인사이트를 조회해요. 프로젝트 패턴, 위험 요소, 추천 태스크를 포함해요.",
    {
      ...cwdParam,
      limit: z.number().int().min(1).max(10).optional().describe("최대 reflection 수 (기본 3)"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      const limit = args.limit ?? 3;
      const res = await fetch(`${config.appUrl}/api/memory/reflections?projectId=${pid}&limit=${limit}`, {
        headers: { authorization: `Bearer ${config.apiKey}` },
      });
      const data = await res.json() as { ok: boolean; reflections?: Array<{
        id: string; createdAt: string; analyzedTaskCount: number; triggerReason: string;
        contextSummary: string | null;
        insights: Array<{ type: string; text: string }>;
        suggestedTasks: Array<{ title: string; reason: string; priority: string }>;
      }>; error?: string };
      if (!data.ok || !data.reflections) {
        return { content: [{ type: "text" as const, text: `인사이트가 아직 없어요. 태스크를 더 완료하면 AI가 분석을 생성해요.` }] };
      }
      const lines: string[] = [];
      for (const r of data.reflections) {
        const date = new Date(r.createdAt).toLocaleDateString("ko-KR");
        lines.push(`## ${date} 분석 (${r.analyzedTaskCount}개 태스크, ${r.triggerReason === "threshold" ? "임계값 도달" : "정기"})`);
        if (r.contextSummary) lines.push(`\n**프로젝트 맥락:** ${r.contextSummary}`);
        if (r.insights.length > 0) {
          lines.push(`\n**인사이트:**`);
          for (const ins of r.insights) {
            const label = ins.type === "pattern" ? "패턴" : ins.type === "risk" ? "위험" : "인사이트";
            lines.push(`- [${label}] ${ins.text}`);
          }
        }
        if (r.suggestedTasks.length > 0) {
          lines.push(`\n**추천 태스크:**`);
          for (const t of r.suggestedTasks) {
            lines.push(`- ${t.title} (${t.priority}) — ${t.reason}`);
          }
        }
        lines.push("");
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") || "분석 결과가 없어요." }] };
    },
  );

  server.tool(
    "create_folder",
    "태스크 폴더를 새로 만들어요. brief의 폴더 목록에 없는 폴더가 필요할 때 사용하세요.",
    {
      ...cwdParam,
      name: z.string().describe("폴더 이름"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId: await getDefaultPid() }, config);
      if (!pid) return NOT_REGISTERED;
      return { content: [{ type: "text" as const, text: await handleCreateFolder(args, pid, config) }] };
    },
  );

  server.tool(
    "upload_prompt",
    "CLAUDE.md, AGENTS.md, SKILL.md 파일을 votra에 업로드해요. 프롬프트/스킬 파일을 최신 상태로 동기화할 때 사용해요.",
    {
      cwd: z.string().describe("프로젝트 절대경로"),
    },
    async (args) => {
      if (!config) return NOT_LOGGED_IN;
      return { content: [{ type: "text" as const, text: await handleUploadPrompt(args, config) }] };
    },
  );

  server.tool(
    "signin",
    "votra 계정으로 로그인해요. 브라우저가 자동으로 열려요.",
    {
      appUrl: z.string().optional().describe("votra 서버 URL (기본값: https://votra.jocodingax.ai)"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleSignin(args) }],
    }),
  );

  server.tool(
    "whoami",
    "현재 로그인된 계정 정보를 확인해요.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await handleWhoami() }],
    }),
  );

  server.tool(
    "signout",
    "현재 계정에서 로그아웃해요.",
    {},
    async () => ({
      content: [{ type: "text" as const, text: await handleSignout() }],
    }),
  );

  return server;
}

export async function startStdio(config: McpConfig | null, cwd: string): Promise<void> {
  const server = createServer(config, cwd);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startHttp(port: number, config: McpConfig | null, cwd: string): Promise<void> {
  const mcpServer = createServer(config, cwd);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    await transport.handleRequest(req, res);
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.error(`votra-memory MCP HTTP 서버 실행 중: http://127.0.0.1:${port}/mcp`);
  });

  await new Promise<void>((_, reject) => {
    httpServer.on("error", reject);
  });
}
