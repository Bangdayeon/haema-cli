import { resolve } from "node:path";

import {
  postClaudeFiles,
  readClaudeFilesConfig,
  type ClaudeFileUpload,
} from "../claudeFilesClient.js";
import { discoverClaudeFiles } from "../discoverClaudeFiles.js";
import { readClaudeFile } from "../readClaudeFile.js";

type ClaudeFilesOptions = {
  project?: string;
};

export async function claudeFilesCommand(options: ClaudeFilesOptions): Promise<void> {
  const cwd = options.project ? resolve(options.project) : process.cwd();
  const config = await readClaudeFilesConfig();

  console.log(`업로드 대상: ${config.url}`);
  if (config.apiKey) console.log("Authorization: Bearer ***");
  console.log(`소스 (cwd): ${cwd}`);

  const discovered = await discoverClaudeFiles(cwd);
  const files: ClaudeFileUpload[] = [];
  for (const d of discovered) {
    const file = await readClaudeFile(d.absPath);
    if (!file) continue;
    files.push({
      kind: d.kind,
      scope: d.scope,
      absPath: d.absPath,
      displayPath: d.displayPath,
      content: file.content,
      mtime: file.mtime,
    });
  }

  if (files.length === 0) {
    console.error("스캔된 CLAUDE.md / AGENTS.md / SKILL.md 가 없어요.");
    return;
  }

  try {
    await postClaudeFiles(config, { source: cwd, files });
  } catch (err) {
    throw new Error(`POST 실패 (${config.url}): ${err instanceof Error ? err.message : err}`);
  }

  const byScope = {
    global: files.filter((f) => f.scope === "global").length,
    "project-root": files.filter((f) => f.scope === "project-root").length,
    subdir: files.filter((f) => f.scope === "subdir").length,
  };
  console.log(
    `업로드 OK · 총 ${files.length}개 ` +
      `(global ${byScope.global} / project-root ${byScope["project-root"]} / subdir ${byScope.subdir})`
  );
}
