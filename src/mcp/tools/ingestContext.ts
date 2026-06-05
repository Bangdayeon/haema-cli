import type { McpConfig } from "../mcpClient.js";
import { mcpPost } from "../mcpClient.js";

type IngestContextResponse =
  | { ok: true; task: { seq: number; title: string }; extractedDecisions: number }
  | { ok: false; error: string };

export async function handleIngestContext(
  args: { title: string; content: string; source: string; type?: string },
  projectId: string,
  config: McpConfig,
): Promise<string> {
  const data = await mcpPost<IngestContextResponse>(config, "/api/memory/ingest-context", {
    projectId,
    title: args.title,
    content: args.content,
    source: args.source,
    type: args.type,
  });
  if (!data.ok) throw new Error(data.error);
  return `외부 맥락 저장됨: #${data.task.seq} "${data.task.title}" [${args.source}] — 핵심 결정 ${data.extractedDecisions}개 추출됨. recall("${args.title}")로 검색해요.`;
}
