import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as readline from "node:readline";

import { readAuth } from "../../auth.js";
import { mcpGet, mcpPatch, mcpPost } from "../mcpClient.js";

type EnvPrompt = {
  key: string;
  label: string;
  guideUrl: string;
  build: (value: string) => string;
};

type ServiceConfig = {
  label: string;
  mcpKey: string;
  command: string;
  args: string[];
  envPrompts: EnvPrompt[];
};

const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  notion: {
    label: "Notion",
    mcpKey: "notion-mcp",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    envPrompts: [
      {
        key: "OPENAPI_MCP_HEADERS",
        label: "Notion 통합 토큰",
        guideUrl: "https://www.notion.so/my-integrations",
        build: (token) =>
          JSON.stringify({ Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" }),
      },
    ],
  },
  slack: {
    label: "Slack",
    mcpKey: "slack-mcp",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envPrompts: [
      {
        key: "SLACK_BOT_TOKEN",
        label: "Slack 봇 토큰 (xoxb-...)",
        guideUrl: "https://api.slack.com/apps",
        build: (v) => v,
      },
      {
        key: "SLACK_TEAM_ID",
        label: "Slack 팀 ID",
        guideUrl: "https://api.slack.com/apps",
        build: (v) => v,
      },
    ],
  },
  github: {
    label: "GitHub",
    mcpKey: "github-mcp",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envPrompts: [
      {
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        label: "GitHub Personal Access Token",
        guideUrl: "https://github.com/settings/tokens",
        build: (v) => v,
      },
    ],
  },
  linear: {
    label: "Linear",
    mcpKey: "linear-mcp",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-linear"],
    envPrompts: [
      {
        key: "LINEAR_API_KEY",
        label: "Linear API 키",
        guideUrl: "https://linear.app/settings/api",
        build: (v) => v,
      },
    ],
  },
};

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function readClaudeJson(): Promise<Record<string, unknown>> {
  const configPath = path.join(homedir(), ".claude.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function writeClaudeJson(data: Record<string, unknown>): Promise<void> {
  const configPath = path.join(homedir(), ".claude.json");
  await fs.writeFile(configPath, JSON.stringify(data, null, 2), "utf8");
}

async function registerInHaema(serviceId: string): Promise<void> {
  const auth = await readAuth();
  if (!auth) {
    console.log("  [건너뜀] haema 로그인 정보가 없어요 — haema에 자동 등록을 건너뜁니다.");
    console.log("           나중에 haema 웹에서 직접 등록하거나 로그인 후 다시 실행하세요.");
    return;
  }

  const config = { appUrl: auth.appUrl, apiKey: auth.apiKey };
  const cwd = process.cwd();

  type InitRes = { ok: true; projectId: string } | { ok: false; error: string };
  const initRes = await mcpPost<InitRes>(config, "/api/memory/init-project", { cwd });
  if (!initRes.ok) {
    console.log(`  [건너뜀] 프로젝트를 찾을 수 없어요: ${initRes.error}`);
    return;
  }

  const projectId = initRes.projectId;

  type SourcesRes = { ok: true; sources: string[] } | { ok: false; error: string };
  const sourcesRes = await mcpGet<SourcesRes>(config, "/api/memory/integrations", { projectId });
  const current = sourcesRes.ok ? sourcesRes.sources : [];

  if (current.includes(serviceId)) {
    console.log(`  [건너뜀] 이미 haema에 ${serviceId} 가 등록되어 있어요.`);
    return;
  }

  const next = [...current, serviceId];
  await mcpPatch(config, "/api/memory/integrations", { projectId, sources: next });
  console.log(`  [완료] haema 프로젝트에 ${serviceId} 를 자동 등록했어요.`);
}

export async function connectIntegration(service: string): Promise<string> {
  const cfg = SERVICE_REGISTRY[service.toLowerCase()];
  if (!cfg) {
    const available = Object.keys(SERVICE_REGISTRY).join(", ");
    return `알 수 없는 서비스예요. 사용 가능한 서비스: ${available}`;
  }

  console.log(`\n${cfg.label} MCP 서버를 설치합니다.\n`);

  // API 키 입력
  const env: Record<string, string> = {};
  for (const ep of cfg.envPrompts) {
    console.log(`  발급 방법: ${ep.guideUrl}`);
    const value = await prompt(`  ${ep.label}: `);
    if (!value) {
      return `취소됐어요. ${ep.label}을(를) 입력해야 설치할 수 있어요.`;
    }
    env[ep.key] = ep.build(value);
  }

  // ~/.claude.json 에 MCP 서버 등록
  const claudeJson = await readClaudeJson();
  const mcpServers =
    typeof claudeJson.mcpServers === "object" && claudeJson.mcpServers !== null
      ? (claudeJson.mcpServers as Record<string, unknown>)
      : {};
  const alreadyInstalled = mcpServers[cfg.mcpKey] !== undefined;
  mcpServers[cfg.mcpKey] = { command: cfg.command, args: cfg.args, env };
  claudeJson.mcpServers = mcpServers;
  await writeClaudeJson(claudeJson);

  if (alreadyInstalled) {
    console.log(`\n  [완료] ${cfg.label} MCP 서버 설정을 업데이트했어요.`);
  } else {
    console.log(`\n  [완료] ${cfg.label} MCP 서버를 에이전트에 등록했어요.`);
  }

  // haema 프로젝트에 자동 등록
  try {
    await registerInHaema(service.toLowerCase());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  [건너뜀] haema 등록 중 오류가 발생했어요: ${msg}`);
  }

  return `\n✅ ${cfg.label} 연결 완료! 에이전트 대화창을 재시작하면 바로 사용할 수 있어요.`;
}

export async function handleInstallIntegration(args: { service: string }): Promise<string> {
  return connectIntegration(args.service);
}
