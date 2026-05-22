import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { readMcpConfig } from "../mcp/mcpClient.js";
import { resolveOrInitProject } from "../mcp/resolveProjectId.js";
import { startHttp, startStdio } from "../mcp/server.js";

const DEFAULT_HTTP_PORT = 5200;
const CLAUDE_MD_PATH = path.join(homedir(), ".claude", "CLAUDE.md");
const VOTRA_MARKER = "<!-- votra-memory -->";
const VOTRA_BRIEF_INSTRUCTION = `
${VOTRA_MARKER}
## Votra Memory MCP

votra-memory MCP 서버가 연결된 세션에서는 아래 워크플로우를 따르세요.

### 세션 시작 시 (필수)
항상 \`brief\` tool을 먼저 호출해서 현재 프로젝트 상태를 파악하세요.
- 이전 세션의 태스크, 결정 사항, 완료된 작업을 바로 확인할 수 있어요.

### 작업 워크플로우
새 작업을 시작할 때는 아래 순서를 따르세요:

1. **탐색 (Research)** — 요청 파악, 관련 코드/문서 조사
   - 불확실한 결정이 생기면 \`remember\`로 기록해두세요.
   - 과거 관련 결정이 있는지 \`recall\`로 먼저 검색하세요.

2. **설계 (Design)** — 접근 방식 확정, 트레이드오프 정리
   - 핵심 결정 사항은 반드시 \`remember\`로 저장하세요. (태그: \`decision\`, \`architecture\` 등)

3. **태스크 분해 (Tasks)** — 구체적인 실행 단위로 분해
   - \`add_task\`로 태스크를 등록하고 \`priority\`와 \`module\`을 설정하세요.
   - 작업 시작 시 \`update_task\` (status: IN_PROGRESS), 완료 시 DONE으로 업데이트하세요.

4. **실행 (Execute)** — 태스크 순서대로 구현

### 태그 컨벤션
\`remember\` 저장 시 태그를 활용하세요:
- \`decision\` — 기술/설계 결정
- \`architecture\` — 구조적 선택
- \`bug\` — 발견한 버그나 주의사항
- \`context\` — 배경 지식, 제약 조건
`;

export async function mcpCommand(
  sub: string,
  options: { stdio?: boolean; port?: number; cwd?: string },
): Promise<void> {
  if (sub === "install") {
    await installCommand();
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

async function installCommand(): Promise<void> {
  // 1. Claude Code config 출력
  const mcpConfig = {
    mcpServers: {
      "votra-memory": {
        command: "votra",
        args: ["mcp", "start", "--stdio"],
      },
    },
  };

  console.log("=== votra-memory MCP 서버 설치 ===\n");
  console.log("1. ~/.claude/claude_desktop_config.json 에 아래 내용을 추가하세요:\n");
  console.log(JSON.stringify(mcpConfig, null, 2));

  // 2. ~/.claude/CLAUDE.md 에 brief 자동 호출 지시 주입
  await injectClaudeMd();

  console.log("\n3. Claude Code 를 재시작하세요.");
  console.log(
    "\n✅ 설치 완료! 이제 새 세션에서 자동으로 프로젝트 브리핑이 시작돼요.",
  );
}

async function injectClaudeMd(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CLAUDE_MD_PATH), { recursive: true });

    let existing = "";
    try {
      existing = await fs.readFile(CLAUDE_MD_PATH, "utf8");
    } catch {
      // 파일 없으면 빈 문자열로 시작
    }

    if (existing.includes(VOTRA_MARKER)) {
      console.log("\n2. ~/.claude/CLAUDE.md 에 이미 votra-memory 설정이 있어요. (건너뜀)");
      return;
    }

    await fs.appendFile(CLAUDE_MD_PATH, VOTRA_BRIEF_INSTRUCTION, "utf8");
    console.log("\n2. ~/.claude/CLAUDE.md 에 brief 자동 호출 지시를 추가했어요.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`\n⚠️  ~/.claude/CLAUDE.md 수정 실패 (수동으로 추가해주세요): ${msg}`);
  }
}
