import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

type ServiceConfig = {
  label: string;
  mcpKey: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  envGuide: string;
};

const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  notion: {
    label: "Notion",
    mcpKey: "notion-mcp",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      OPENAPI_MCP_HEADERS:
        '{"Authorization":"Bearer YOUR_NOTION_TOKEN","Notion-Version":"2022-06-28"}',
    },
    envGuide: "Notion 통합 토큰 발급: https://www.notion.so/my-integrations",
  },
  slack: {
    label: "Slack",
    mcpKey: "slack-mcp",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: "YOUR_SLACK_BOT_TOKEN",
      SLACK_TEAM_ID: "YOUR_SLACK_TEAM_ID",
    },
    envGuide: "Slack 앱 토큰 발급: https://api.slack.com/apps",
  },
  github: {
    label: "GitHub",
    mcpKey: "github-mcp",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "YOUR_GITHUB_TOKEN" },
    envGuide: "GitHub PAT 발급: https://github.com/settings/tokens",
  },
  linear: {
    label: "Linear",
    mcpKey: "linear-mcp",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-linear"],
    env: { LINEAR_API_KEY: "YOUR_LINEAR_API_KEY" },
    envGuide: "Linear API 키 발급: https://linear.app/settings/api",
  },
};

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

export async function connectIntegration(service: string): Promise<string> {
  const cfg = SERVICE_REGISTRY[service.toLowerCase()];
  if (!cfg) {
    const available = Object.keys(SERVICE_REGISTRY).join(", ");
    return `알 수 없는 서비스예요. 사용 가능한 서비스: ${available}`;
  }

  const claudeJson = await readClaudeJson();
  const mcpServers =
    typeof claudeJson.mcpServers === "object" && claudeJson.mcpServers !== null
      ? (claudeJson.mcpServers as Record<string, unknown>)
      : {};

  const alreadyInstalled = mcpServers[cfg.mcpKey] !== undefined;

  mcpServers[cfg.mcpKey] = {
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
  };
  claudeJson.mcpServers = mcpServers;
  await writeClaudeJson(claudeJson);

  const lines: string[] = [];
  if (alreadyInstalled) {
    lines.push(`✅ ${cfg.label} MCP 서버 설정을 업데이트했어요.`);
  } else {
    lines.push(`✅ ${cfg.label} MCP 서버를 Claude Code에 등록했어요.`);
  }
  lines.push("");
  lines.push(`다음 단계:`);
  lines.push(`1. API 키 설정 — ~/.claude.json의 mcpServers.${cfg.mcpKey}.env 값을 실제 키로 교체하세요.`);
  lines.push(`   ${cfg.envGuide}`);
  lines.push(`2. Claude Code를 재시작하세요.`);
  lines.push(`3. 재시작 후 ${cfg.label} MCP 툴을 바로 사용할 수 있어요.`);

  return lines.join("\n");
}

export async function handleInstallIntegration(args: { service: string }): Promise<string> {
  return connectIntegration(args.service);
}
