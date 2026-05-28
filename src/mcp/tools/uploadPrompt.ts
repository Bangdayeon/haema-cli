import { discoverClaudeFiles } from "../../discoverClaudeFiles.js";
import { readClaudeFile } from "../../readClaudeFile.js";
import type { McpConfig } from "../mcpClient.js";

export async function handleUploadPrompt(
  args: { cwd: string },
  config: McpConfig,
): Promise<string> {
  const discovered = await discoverClaudeFiles(args.cwd);
  if (discovered.length === 0) {
    return "업로드할 파일이 없어요. CLAUDE.md, AGENTS.md, SKILL.md 파일을 확인해주세요.";
  }

  const files: {
    kind: string;
    scope: string;
    absPath: string;
    displayPath: string;
    content: string;
    mtime: number;
  }[] = [];

  for (const f of discovered) {
    const result = await readClaudeFile(f.absPath);
    if (!result) continue;
    files.push({ ...f, content: result.content, mtime: result.mtime });
  }

  if (files.length === 0) return "파일을 읽을 수 없었어요.";

  const res = await fetch(`${config.appUrl}/api/claude-files/ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ source: args.cwd, files }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`업로드 실패 HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const lines = files.map((f) => `  • ${f.displayPath} [${f.kind}]`).join("\n");
  return `${files.length}개 파일 업로드 완료:\n${lines}`;
}
