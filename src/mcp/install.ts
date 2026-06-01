import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const VOTRA_MARKER = "<!-- votra-memory -->";

function resolveMcpServerBlock(): { command: string; args: string[] } {
  const isWindows = process.platform === "win32";
  try {
    const cmd = isWindows ? "where votra" : "which votra";
    const result = execSync(cmd, { encoding: "utf8" }).trim();
    const full = result.split("\n")[0].trim();
    if (full) return { command: full, args: ["--stdio"] };
  } catch {
    // PATH에서 못 찾으면 폴백
  }
  return { command: "votra", args: ["--stdio"] };
}

const WORKFLOW_INSTRUCTION = `
${VOTRA_MARKER}
## Votra Memory MCP

votra-memory MCP 서버가 연결되어 있어요. 아래 툴을 활용하세요.

### 사용 가능한 툴
- \`brief\` — 현재 프로젝트의 태스크·커밋·추천을 한번에 조회
- \`recall\` — 과거 결정 의미 검색
- \`add_task\` — 태스크 미리 등록 (나중에 시작할 때만)
- \`start_task\` — 태스크 생성 + 즉시 IN_PROGRESS 시작
- \`update_task\` — 태스크 상태·내용 변경
- \`finish_task\` — 태스크 완료 (DONE)
- \`list_tasks\` — 태스크 목록 조회
- \`create_folder\` — 태스크 폴더 생성
- \`load_skill\` — 스킬 전체 내용 로드
- \`upload_prompt\` — CLAUDE.md/AGENTS.md/SKILL.md 업로드
- \`signin\` / \`whoami\` / \`signout\` — 계정 관리

### 세션 시작 시 (필수)
\`brief\` 호출 후 아래 형식으로 현황 정리:

\`\`\`
최근 작업 흐름:
- [커밋·태스크 기반 흐름 1]
- [커밋·태스크 기반 흐름 2]
- [커밋·태스크 기반 흐름 3]

추천 태스크:
1) [AI 추천 1개]
2) [기존 태스크·최근 커밋 분석 추천]
3) [기존 태스크·최근 커밋 분석 추천]
\`\`\`

추천 태스크는 반드시 3개를 채워서 출력해요.

### 태스크 사이클 (매 태스크마다 반복)

**1단계 — 제안 및 유저 확인**
수행할 태스크를 유저에게 먼저 제안하고 승낙을 받아요. 유저가 승낙하기 전에 구현을 시작하지 마세요.

**2단계 — 폴더·모듈 선택**
- **폴더**: brief의 폴더 목록에서 적합한 폴더를 선택해요. 맞는 폴더가 없으면 \`create_folder\`로 생성하고 유저에게 확인받아요.
- **모듈**: \`backend · frontend · database · designer · integration · devops · planner · testing\` 중 하나를 반드시 선택해요.

**3단계 — 시작**
\`start_task(title, module, folderId)\`로 태스크를 생성하고 즉시 IN_PROGRESS로 시작해요.
응답에 매칭된 스킬이 있으면 **반드시** \`load_skill(slug)\`를 호출해 스킬을 로드한 후 구현을 시작해요.

**4단계 — 탐색**
\`recall(태스크명)\`으로 관련 과거 결정을 검색해요.

**5단계 — 구현**
코드 작업을 수행해요.

**6단계 — 완료**
\`finish_task(taskSeq, summary, keyDecisions, outcome)\`로 태스크를 완료해요.
- \`outcome\`: 수정한 파일 경로 포함
- \`keyDecisions\`: 아키텍처 선택, 버그 원인, 방향 변경 등 다음 세션에서 recall로 찾을 결정만

**7단계 — 다음 태스크 제안**
완료 후 brief의 대기 태스크 또는 현재 맥락을 바탕으로 다음 태스크 3개를 제안하고 1단계부터 반복해요.
`;

type ToolKind = "claude" | "cursor" | "gemini" | "codex" | "antigravity";

const TOOL_CONFIGS: Record<ToolKind, { name: string; mcpConfigPath: string; instructionPath: string }> = {
  claude: {
    name: "Claude Code",
    mcpConfigPath: path.join(homedir(), ".claude.json"),
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
  antigravity: {
    name: "Antigravity",
    mcpConfigPath: path.join(homedir(), ".gemini", "antigravity", "mcp_config.json"),
    instructionPath: path.join(homedir(), ".gemini", "antigravity", "AGENTS.md"),
  },
};

export async function installCommand(forFlag?: string): Promise<void> {
  const targets = parseTargets(forFlag ?? "claude");
  const mcpServerBlock = resolveMcpServerBlock();

  console.log(`\n=== votra-memory MCP 설치 (${targets.map((t) => TOOL_CONFIGS[t].name).join(", ")}) ===\n`);

  for (const tool of targets) {
    await configureTool(tool, mcpServerBlock);
  }

  console.log("\n✅ 설치 완료! 새 대화창을 열어 'brief' 라고 말하면 현재 프로젝트 상태를 바로 확인할 수 있어요.");
}

function parseTargets(flag: string): ToolKind[] {
  if (flag === "all") return ["claude", "cursor", "gemini", "codex", "antigravity"];
  const parts = flag.split(",").map((s) => s.trim()) as ToolKind[];
  const valid: ToolKind[] = ["claude", "cursor", "gemini", "codex", "antigravity"];
  const invalid = parts.filter((p) => !valid.includes(p));
  if (invalid.length > 0) {
    console.error(`알 수 없는 도구: ${invalid.join(", ")}. 사용 가능: claude, cursor, gemini, codex, antigravity, all`);
    process.exit(1);
  }
  return parts;
}

async function configureTool(tool: ToolKind, mcpServerBlock: { command: string; args: string[] }): Promise<void> {
  const cfg = TOOL_CONFIGS[tool];
  console.log(`\n── ${cfg.name} ──`);

  if (tool === "claude") {
    await injectMcpJson(cfg.mcpConfigPath, "Claude Code", mcpServerBlock);
    await injectInstruction(cfg.instructionPath, WORKFLOW_INSTRUCTION, "CLAUDE.md");
  } else if (tool === "cursor") {
    await injectMcpJson(cfg.mcpConfigPath, "Cursor", mcpServerBlock);
    await injectCursorRule(cfg.instructionPath);
  } else if (tool === "gemini") {
    await injectMcpJson(cfg.mcpConfigPath, "Gemini settings.json", mcpServerBlock);
    await injectInstruction(cfg.instructionPath, WORKFLOW_INSTRUCTION, "GEMINI.md");
  } else if (tool === "codex") {
    await injectCodexConfig(cfg.mcpConfigPath, mcpServerBlock);
    await injectInstruction(cfg.instructionPath, WORKFLOW_INSTRUCTION, "AGENTS.md");
  } else if (tool === "antigravity") {
    await injectMcpJson(cfg.mcpConfigPath, "Antigravity", mcpServerBlock);
    await injectInstruction(cfg.instructionPath, WORKFLOW_INSTRUCTION, "AGENTS.md");
  }
}

async function injectMcpJson(filePath: string, label: string, mcpServerBlock: { command: string; args: string[] }): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let existing: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(filePath, "utf8");
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // 없거나 파싱 실패 → 새로 생성
    }

    const servers = (existing.mcpServers ?? {}) as Record<string, { command?: string; args?: string[] }>;
    if ("votra-memory" in servers) {
      const current = servers["votra-memory"];
      if (current?.command === mcpServerBlock.command) {
        console.log(`  [건너뜀] ${label} 에 이미 votra-memory 설정이 있어요.`);
        return;
      }
      servers["votra-memory"] = mcpServerBlock;
      existing.mcpServers = servers;
      await fs.writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf8");
      console.log(`  [업데이트] ${filePath} 의 votra-memory command 경로를 업데이트했어요.`);
      return;
    }

    servers["votra-memory"] = mcpServerBlock;
    existing.mcpServers = servers;
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf8");
    console.log(`  [완료] ${filePath} 에 votra-memory 서버를 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 수정 실패: ${msg}`);
  }
}

async function injectCursorRule(filePath: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const frontmatter = `---\ndescription: Votra Memory MCP 워크플로우\nalwaysApply: true\n---`;
    const fullContent = `${frontmatter}\n${WORKFLOW_INSTRUCTION}`;

    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch {
      // 없으면 새로 생성
    }

    if (existing.includes(VOTRA_MARKER)) {
      const markerIdx = existing.indexOf(VOTRA_MARKER);
      // frontmatter는 마커 앞 부분에 있으므로 마커부터 전체 교체
      const updated = existing.slice(0, markerIdx) + WORKFLOW_INSTRUCTION.trimStart();
      await fs.writeFile(filePath, updated, "utf8");
      console.log(`  [업데이트] ${filePath} 의 votra-memory 지시문을 최신 버전으로 교체했어요.`);
      return;
    }

    await fs.writeFile(filePath, fullContent, "utf8");
    console.log(`  [완료] ${filePath} 에 votra 규칙을 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 생성 실패: ${msg}`);
  }
}

async function injectCodexConfig(filePath: string, mcpServerBlock: { command: string; args: string[] }): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let existing = "";
    try {
      existing = await fs.readFile(filePath, "utf8");
    } catch {
      // 없으면 새로 생성
    }

    if (existing.includes("votra-memory")) {
      // votra-memory 섹션 이후의 command 행만 교체 (다른 섹션의 command 행 오염 방지)
      const sectionMatch = existing.match(/(votra-memory:[\s\S]*?command:\s*)(.+)/);
      const currentCommand = sectionMatch?.[2]?.trim();
      if (currentCommand === mcpServerBlock.command) {
        console.log(`  [건너뜀] ${filePath} 에 이미 votra-memory 설정이 있어요.`);
        return;
      }
      const updated = existing.replace(
        /(votra-memory:[\s\S]*?command:\s*).+/,
        `$1${mcpServerBlock.command}`,
      );
      await fs.writeFile(filePath, updated, "utf8");
      console.log(`  [업데이트] ${filePath} 의 votra-memory command 경로를 업데이트했어요.`);
      return;
    }

    const block = `
mcp_servers:
  votra-memory:
    command: ${mcpServerBlock.command}
    args: [${mcpServerBlock.args.join(", ")}]
`;
    await fs.appendFile(filePath, block, "utf8");
    console.log(`  [완료] ${filePath} 에 votra-memory 서버를 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 수정 실패: ${msg}`);
  }
}

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
      const markerIdx = existing.indexOf(VOTRA_MARKER);
      const updated = existing.slice(0, markerIdx) + instruction.trimStart();
      await fs.writeFile(filePath, updated, "utf8");
      console.log(`  [업데이트] ${filePath} 의 votra-memory 지시문을 최신 버전으로 교체했어요.`);
      return;
    }

    await fs.appendFile(filePath, instruction, "utf8");
    console.log(`  [완료] ${filePath} 에 brief 워크플로우 지시문을 추가했어요.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  [실패] ${filePath} 수정 실패: ${msg}`);
  }
}
