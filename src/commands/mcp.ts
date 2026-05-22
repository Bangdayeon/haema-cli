import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { readMcpConfig } from "../mcp/mcpClient.js";
import { resolveOrInitProject } from "../mcp/resolveProjectId.js";
import { startHttp, startStdio } from "../mcp/server.js";

const DEFAULT_HTTP_PORT = 5200;
const VOTRA_MARKER = "<!-- votra-memory -->";

const MCP_SERVER_BLOCK = {
  command: "votra",
  args: ["mcp", "start", "--stdio"],
};

const WORKFLOW_INSTRUCTION = `
${VOTRA_MARKER}
## Votra Memory MCP

votra-memory MCP 서버가 연결된 세션에서는 아래 워크플로우를 따르세요.

### 세션 시작 시 (필수)
항상 \`brief\` tool을 먼저 호출해서 현재 프로젝트 상태를 파악하세요.
- 이전 세션의 태스크, 결정 사항, 완료된 작업을 바로 확인할 수 있어요.

### 작업 워크플로우
1. **탐색 (Research)** — 과거 관련 결정이 있는지 \`recall\`로 먼저 검색하세요.
2. **설계 (Design)** — 핵심 결정 사항은 \`remember\`로 저장하세요. (태그: \`decision\`, \`architecture\`)
3. **태스크 분해 (Tasks)** — \`add_task\`로 등록, 시작 시 IN_PROGRESS, 완료 시 DONE.
4. **실행 (Execute)** — 태스크 순서대로 구현
`;

type ToolKind = "claude" | "cursor" | "gemini" | "codex";

const TOOL_CONFIGS: Record<ToolKind, { name: string; mcpConfigPath: string; instructionPath: string }> = {
  claude: {
    name: "Claude Code",
    mcpConfigPath: path.join(homedir(), ".claude", "claude_desktop_config.json"),
    instructionPath: path.join(homedir(), ".claude", "CLAUDE.md"),
  },
  cursor: {
    name: "Cursor",
    mcpConfigPath: path.join(homedir(), ".cursor", "mcp.json"),
    instructionPath: path.join(homedir(), ".cursor", "rules", "votra.mdc"),
  },
  gemini: {
    name: "Gemini CLI",
    mcpConfigPath: path.join(homedir(), ".gemini", "settings.json"),
    instructionPath: path.join(homedir(), ".gemini", "GEMINI.md"),
  },
  codex: {
    name: "Codex CLI",
    mcpConfigPath: path.join(homedir(), ".codex", "config.yaml"),
    instructionPath: path.join(homedir(), ".codex", "AGENTS.md"),
  },
};

export async function mcpCommand(
  sub: string,
  tools: string | undefined,
  options: { stdio?: boolean; port?: number; cwd?: string },
): Promise<void> {
  if (sub === "install") {
    await installCommand(tools);
    return;
  }

  if (sub !== "start") {
    console.error(`알 수 없는 subcommand: ${sub}. 'start' 또는 'install' 을 사용해주세요.`);
    process.exit(1);
  }

  const config = await readMcpConfig();
  const cwd = options.cwd ?? process.cwd();
  const projectId = await resolveOrInitProject(cwd, config);

  if (options.stdio) {
    await startStdio(projectId, config);
    return;
  }

  const port = options.port ?? DEFAULT_HTTP_PORT;
  await startHttp(port, projectId, config);
}

async function installCommand(forFlag?: string): Promise<void> {
  const targets = parseTargets(forFlag ?? "claude");

  console.log(`\n=== votra-memory MCP 설치 (${targets.map((t) => TOOL_CONFIGS[t].name).join(", ")}) ===\n`);

  for (const tool of targets) {
    await configureTool(tool);
  }

  console.log("\n✅ 설치 완료! 대상 도구를 재시작하면 새 세션에서 자동으로 브리핑이 시작돼요.");
}

function parseTargets(flag: string): ToolKind[] {
  if (flag === "all") return ["claude", "cursor", "gemini", "codex"];
  const parts = flag.split(",").map((s) => s.trim()) as ToolKind[];
  const valid: ToolKind[] = ["claude", "cursor", "gemini", "codex"];
  const invalid = parts.filter((p) => !valid.includes(p));
  if (invalid.length > 0) {
    console.error(`알 수 없는 도구: ${invalid.join(", ")}. 사용 가능: claude, cursor, gemini, codex, all`);
    process.exit(1);
  }
  return parts;
}

async function configureTool(tool: ToolKind): Promise<void> {
  const cfg = TOOL_CONFIGS[tool];
  console.log(`\n── ${cfg.name} ──`);

  if (tool === "claude") {
    await injectMcpJson(cfg.mcpConfigPath, "Claude Code");
    await injectInstruction(cfg.instructionPath, WORKFLOW_INSTRUCTION, "CLAUDE.md");
  } else if (tool === "cursor") {
    await injectMcpJson(cfg.mcpConfigPath, "Cursor");
    await injectCursorRule(cfg.instructionPath);
  } else if (tool === "gemini") {
    await injectMcpJson(cfg.mcpConfigPath, "Gemini settings.json");
    await injectInstruction(cfg.instructionPath, WORKFLOW_INSTRUCTION, "GEMINI.md");
  } else if (tool === "codex") {
    await injectCodexConfig(cfg.mcpConfigPath);
    await injectInstruction(cfg.instructionPath, WORKFLOW_INSTRUCTION, "AGENTS.md");
  }
}

// JSON 기반 MCP 설정 파일 (Cursor, Gemini)
async function injectMcpJson(filePath: string, label: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let existing: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(filePath, "utf8");
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 없거나 파싱 실패 → 새로 생성
    }

    const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;
    if ("votra-memory" in servers) {
      console.log(`  [건너뜀] ${label} 에 이미 votra-memory 설정이 있어요.`);
      return;
    }

    servers["votra-memory"] = MCP_SERVER_BLOCK;
    existing.mcpServers = servers;
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf8");
    console.log(`  [완료] ${filePath} 에 votra-memory 서버를 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 수정 실패: ${msg}`);
  }
}

// Cursor rules .mdc 파일 (frontmatter + instruction)
async function injectCursorRule(filePath: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    try {
      await fs.access(filePath);
      console.log(`  [건너뜀] ${filePath} 에 이미 votra 규칙이 있어요.`);
      return;
    } catch {
      // 없으면 생성
    }

    const content = `---
description: Votra Memory MCP 워크플로우
alwaysApply: true
---
${WORKFLOW_INSTRUCTION}`;
    await fs.writeFile(filePath, content, "utf8");
    console.log(`  [완료] ${filePath} 에 votra 규칙을 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 생성 실패: ${msg}`);
  }
}

// Codex YAML config (mcp_servers 블록 추가)
async function injectCodexConfig(filePath: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch {
      // 없으면 새로 생성
    }

    if (existing.includes("votra-memory")) {
      console.log(`  [건너뜀] ${filePath} 에 이미 votra-memory 설정이 있어요.`);
      return;
    }

    const block = `
mcp_servers:
  votra-memory:
    command: votra
    args: [mcp, start, --stdio]
`;
    await fs.appendFile(filePath, block, "utf8");
    console.log(`  [완료] ${filePath} 에 votra-memory 서버를 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 수정 실패: ${msg}`);
  }
}

// Markdown 지시문 파일 (CLAUDE.md, GEMINI.md, AGENTS.md)
async function injectInstruction(filePath: string, instruction: string, label: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch {
      // 없으면 생성
    }

    if (existing.includes(VOTRA_MARKER)) {
      console.log(`  [건너뜀] ${label} 에 이미 votra-memory 지시문이 있어요.`);
      return;
    }

    await fs.appendFile(filePath, instruction, "utf8");
    console.log(`  [완료] ${filePath} 에 brief 워크플로우 지시문을 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 수정 실패: ${msg}`);
  }
}
