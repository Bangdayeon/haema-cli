import type { McpConfig } from "../mcpClient.js";
import { mcpGet, mcpPost } from "../mcpClient.js";

type GetResponse = { ok: true; sources: string[] } | { ok: false; error: string };
type PatchResponse = { ok: true; sources: string[] } | { ok: false; error: string };

const AVAILABLE_SERVICES = [
  { id: "notion", label: "Notion", desc: "페이지·데이터베이스·회의록 → 핵심 결정" },
  { id: "slack",  label: "Slack",  desc: "채널 스레드·결정사항 기억" },
  { id: "github", label: "GitHub", desc: "이슈·PR 토론·코드 리뷰 맥락" },
  { id: "linear", label: "Linear", desc: "티켓 결정사항·프로젝트 맥락" },
];

export async function handleConfigureIntegrations(
  args: { sources?: string[] },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  if (args.sources === undefined) {
    const data = await mcpGet<GetResponse>(config, "/api/memory/integrations", { projectId });
    if (!data.ok) throw new Error(data.error);

    const current = new Set(data.sources);
    const lines: string[] = ["## 외부 서비스 연결 현황", ""];
    for (const svc of AVAILABLE_SERVICES) {
      const status = current.has(svc.id) ? "✓ 연결됨" : "○ 미연결";
      lines.push(`${status}  ${svc.label} — ${svc.desc}`);
    }
    lines.push("");
    lines.push(`연결할 서비스를 선택하려면:`);
    lines.push(`configure_integrations(sources=["notion", "slack", ...]) 형식으로 호출하세요.`);
    lines.push(`현재 연결됨: ${data.sources.length > 0 ? data.sources.join(", ") : "없음"}`);
    return lines.join("\n");
  }

  const data = await mcpPost<PatchResponse>(config, "/api/memory/integrations", {
    projectId,
    sources: args.sources,
  });
  if (!data.ok) throw new Error(data.error);

  const lines: string[] = [`외부 서비스 연결 업데이트됨: ${data.sources.length > 0 ? data.sources.join(", ") : "없음"}`, ""];

  for (const src of data.sources) {
    const installGuides: Record<string, string> = {
      notion: "npm install -g @notionhq/notion-mcp-server  (https://github.com/makenotion/notion-mcp-server)",
      slack:  "npx @modelcontextprotocol/server-slack  (https://github.com/modelcontextprotocol/servers/tree/main/src/slack)",
      github: "npx @modelcontextprotocol/server-github  (https://github.com/modelcontextprotocol/servers/tree/main/src/github)",
      linear: "npx @modelcontextprotocol/server-linear  (https://github.com/modelcontextprotocol/servers/tree/main/src/linear)",
    };
    const guide = installGuides[src];
    if (guide) lines.push(`📦 ${src} MCP 설치: ${guide}`);
  }

  if (data.sources.length > 0) {
    lines.push("");
    lines.push("다음 brief 호출 시 연결된 서비스에서 자동으로 맥락을 가져올 거예요.");
  }

  return lines.join("\n");
}
