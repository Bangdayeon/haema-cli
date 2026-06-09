import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type IngestResponse =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; error: string };

export async function handleIngestContext(
  args: { content: string; source: string; sourceUrl?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<IngestResponse>(config, "/api/memory/ingest", {
    projectId,
    source: args.source,
    content: args.content,
    sourceUrl: args.sourceUrl,
  });
  if (!data.ok) throw new Error(data.error);
  if (data.duplicate) {
    return `[${args.source}] 이미 저장된 동일한 내용이에요. (중복 skip)`;
  }
  return `[${args.source}] 외부 맥락 저장됨. 다음 reflection 때 AI가 분석해 insight를 추출해요.`;
}
