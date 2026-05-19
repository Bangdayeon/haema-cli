#!/usr/bin/env node
import { createRequire } from "node:module";

import { Command } from "commander";
import { claudeFilesCommand } from "./commands/claudeFiles.js";
import { inspectCommand } from "./commands/inspect.js";
import { replayCommand } from "./commands/replay.js";
import { signinCommand } from "./commands/signin.js";
import { signoutCommand } from "./commands/signout.js";
import { uploadCommand } from "./commands/upload.js";
import { whoamiCommand } from "./commands/whoami.js";

const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
const program = new Command();

program
  .name("votra")
  .description("votra 세션 jsonl 검사 / 리플레이 / 업로드 CLI")
  .version(pkg.version);

program
  .command("signin")
  .description(
    "브라우저로 votra SaaS 에 로그인하고 자격증명을 ~/.votra/auth.json 에 저장. " +
      "이후 upload / claude-files 가 자동으로 사용해요."
  )
  .argument("[url]", "votra SaaS 베이스 URL (기본: env VOTRA_APP_URL 또는 https://votra.jocodingax.ai)")
  .option("--port <n>", "콜백 서버 포트 (기본: 5180-5189 중 첫 가용)", (v) => Number(v))
  .option("--no-open", "브라우저 자동 열기 비활성 (URL 출력만)")
  .action(
    (url: string | undefined, options: { port?: number; open?: boolean }) =>
      signinCommand(url, { port: options.port, noOpen: options.open === false })
  );

program
  .command("whoami")
  .description("현재 로그인된 계정 정보 확인")
  .action(() => whoamiCommand());

program
  .command("signout")
  .description("로그아웃 (자격증명 파일 삭제)")
  .action(() => signoutCommand());

program
  .command("replay")
  .description("로컬 jsonl 을 파싱해 event timeline + static replay html 생성")
  .argument("[file]", "session.jsonl 경로 (생략 시 ~/.claude/projects 에서 자동 탐색)")
  .option("-o, --out <path>", "출력 HTML 경로 (--serve 없으면 기본 replay.html)")
  .option("-w, --watch", "파일 변경 감지해 HTML 자동 재생성", false)
  .option("-p, --project [path]", "프로젝트 폴더 전체의 모든 세션을 합쳐 렌더 (생략 시 현재 cwd)")
  .option(
    "-s, --serve [port]",
    "로컬 http 서버 + 브라우저 자동 리로드 (watch 함축, 기본 포트 5179)",
    (v) => Number(v)
  )
  .option("--no-open", "--serve 시 브라우저 자동 열기 비활성")
  .action(
    (
      file: string | undefined,
      options: {
        out?: string;
        watch?: boolean;
        project?: string | boolean;
        serve?: number | boolean;
        open?: boolean;
      }
    ) => replayCommand(file, options)
  );

program
  .command("upload")
  .description(
    "세션을 votra 서버로 업로드 (incremental). project 모드면 CLAUDE.md/AGENTS.md/SKILL.md 도 자동 함께 올려요. " +
      "env: VOTRA_API_URL (기본 https://votra.jocodingax.ai/api/sessions/ingest), VOTRA_API_KEY"
  )
  .argument("[file]", "session.jsonl 경로 (생략 시 자동 탐색)")
  .option("-w, --watch", "파일 변경 감지해 새 이벤트만 incremental 전송", false)
  .option("-p, --project [path]", "프로젝트 폴더 전체 세션 업로드 (생략 시 현재 cwd)")
  .option("--no-claude-files", "project 모드의 CLAUDE.md/AGENTS.md/SKILL.md 자동 업로드 비활성")
  .action(
    (
      file: string | undefined,
      options: { watch?: boolean; project?: string | boolean; claudeFiles?: boolean }
    ) => uploadCommand(file, options)
  );

program
  .command("claude-files")
  .description(
    "현재 프로젝트의 CLAUDE.md / AGENTS.md / SKILL.md 를 스캔해 votra 서버로 업로드. " +
      "env: VOTRA_API_URL 또는 VOTRA_CLAUDE_FILES_URL, VOTRA_API_KEY"
  )
  .option("-p, --project <path>", "스캔할 프로젝트 루트 (생략 시 현재 cwd)")
  .action((options: { project?: string }) => claudeFilesCommand(options));

program
  .command("inspect")
  .description("raw event / token usage / type 분포 확인")
  .argument("[file]", "session.jsonl 경로 (생략 시 자동 탐색)")
  .option("-t, --type <type>", "특정 type 만 필터")
  .option("-l, --limit <n>", "raw 출력 시 최대 라인 수", (v) => Number(v))
  .option("--raw", "raw event JSON 라인 출력")
  .action((file: string | undefined, options: { type?: string; limit?: number; raw?: boolean }) =>
    inspectCommand(file, options)
  );

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
