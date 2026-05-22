import http from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import type { McpConfig } from "./mcpClient.js";
import { resolveProject } from "./resolveProjectId.js";
import { handleAddTask } from "./tools/addTask.js";
import { handleBrief } from "./tools/brief.js";
import { handleListTasks } from "./tools/listTasks.js";
import { handleListThoughts } from "./tools/listThoughts.js";
import { handleRecall } from "./tools/recall.js";
import { handleRemember } from "./tools/remember.js";
import { handleUpdateTask } from "./tools/updateTask.js";

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

function createServer(defaultProjectId: string, config: McpConfig): McpServer {
  const server = new McpServer({ name: "votra-memory", version: "1.0.0" });

  server.tool(
    "brief",
    "세션 시작 브리핑: 대기 중인 태스크, 최근 결정, 완료 항목, 프로젝트 규칙을 한 번에 받아요.",
    cwdParam,
    async (args) => {
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId }, config);
      return { content: [{ type: "text" as const, text: await handleBrief(pid, config) }] };
    },
  );

  server.tool(
    "remember",
    "생각, 결정, 인사이트를 저장해요. 나중에 recall 로 의미 검색 가능.",
    {
      ...cwdParam,
      content: z.string().describe("저장할 내용"),
      tags: z.array(z.string()).optional().describe("태그 목록 (예: ['architecture', 'decision'])"),
    },
    async (args) => {
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId }, config);
      return { content: [{ type: "text" as const, text: await handleRemember(args, pid, config) }] };
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
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId }, config);
      return { content: [{ type: "text" as const, text: await handleRecall(args, pid, config) }] };
    },
  );

  server.tool(
    "list_thoughts",
    "최근 저장한 생각 목록을 봐요.",
    {
      ...cwdParam,
      limit: z.number().int().min(1).max(100).optional().describe("최대 개수 (기본 20)"),
    },
    async (args) => {
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId }, config);
      return { content: [{ type: "text" as const, text: await handleListThoughts(args, pid, config) }] };
    },
  );

  server.tool(
    "add_task",
    "새 태스크를 추가해요.",
    {
      ...cwdParam,
      title: z.string().describe("태스크 제목"),
      description: z.string().optional().describe("상세 설명"),
      module: z.string().optional().describe("모듈명 (예: auth, api, ui)"),
      priority: z.number().int().min(0).max(10).optional().describe("우선순위 0-10 (기본 0)"),
    },
    async (args) => {
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId }, config);
      return { content: [{ type: "text" as const, text: await handleAddTask(args, pid, config) }] };
    },
  );

  server.tool(
    "update_task",
    "태스크 상태나 내용을 업데이트해요. taskSeq 는 list_tasks 나 brief 에서 표시되는 #번호예요.",
    {
      taskSeq: z.number().int().positive().describe("태스크 번호 (예: 1, 42)"),
      status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "CANCELLED"]).optional().describe("새 상태"),
      title: z.string().optional().describe("새 제목"),
      description: z.string().optional().describe("새 설명"),
      module: z.string().optional().describe("새 모듈명"),
      priority: z.number().int().min(0).max(10).optional().describe("새 우선순위"),
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await handleUpdateTask(args, config) }],
    }),
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
      const pid = await resolveProject({ cwd: args.cwd, defaultProjectId }, config);
      return { content: [{ type: "text" as const, text: await handleListTasks(args, pid, config) }] };
    },
  );

  return server;
}

export async function startStdio(defaultProjectId: string, config: McpConfig): Promise<void> {
  const server = createServer(defaultProjectId, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startHttp(
  port: number,
  defaultProjectId: string,
  config: McpConfig,
): Promise<void> {
  const mcpServer = createServer(defaultProjectId, config);
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
