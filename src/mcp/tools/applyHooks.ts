import { homedir } from "node:os";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { McpConfig } from "../mcpClient.js";
import { mcpGet } from "../mcpClient.js";

type HookEntry = {
  slug: string;
  name: string;
  hookEvent: string;
  hookMatcher: string;
  hookScript: string;
};

type HooksResponse = { ok: true; hooks: HookEntry[] } | { ok: false; error: string };

type ClaudeHook = { type: string; command: string; statusMessage?: string };
type ClaudeHookGroup = { matcher?: string; hooks: ClaudeHook[] };

const AUTO_LOG_SESSION_SCRIPT = `#!/bin/bash
# haema auto-log-session — Claude Code Stop 훅 (자동 설치됨)
AUTH_FILE="$HOME/.haema/auth.json"
[ -f "$AUTH_FILE" ] || exit 0

HAEMA_HOOK_INPUT=$(cat 2>/dev/null || echo "{}") HAEMA_CWD="$PWD" node --input-type=module << 'JSEOF' 2>/dev/null || true
import { readFileSync } from 'node:fs';
let auth;
try { auth = JSON.parse(readFileSync(process.env.HOME + '/.haema/auth.json', 'utf8')); }
catch { process.exit(0); }
if (!auth.apiKey || !auth.appUrl) process.exit(0);
let sessionId;
try { sessionId = JSON.parse(process.env.HAEMA_HOOK_INPUT || '{}').session_id; } catch {}
const body = JSON.stringify({ cwd: process.env.HAEMA_CWD, sessionId: sessionId || undefined });
try {
  await fetch(auth.appUrl + '/api/memory/sessions/auto', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + auth.apiKey, 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(15000),
  });
} catch {}
JSEOF
`;

export async function handleApplyHooks(projectId: string, config: McpConfig): Promise<string> {
  const data = await mcpGet<HooksResponse>(config, "/api/memory/hooks", { projectId });
  if (!data.ok) throw new Error(data.error);

  const { hooks } = data;
  const hooksDir = path.join(homedir(), ".haema", "hooks");
  await fs.mkdir(hooksDir, { recursive: true });

  // Deploy auto-log-session Stop hook
  const stopScriptPath = path.join(hooksDir, "auto-log-session.sh");
  await fs.writeFile(stopScriptPath, AUTO_LOG_SESSION_SCRIPT, { encoding: "utf8", mode: 0o755 });

  // Write each hook script file
  for (const hook of hooks) {
    const scriptPath = path.join(hooksDir, `${hook.slug}.sh`);
    await fs.writeFile(scriptPath, hook.hookScript, { encoding: "utf8", mode: 0o755 });
  }

  // Update ~/.claude/settings.json
  const settingsPath = path.join(homedir(), ".claude", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });

  let settings: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // create fresh settings
  }

  const allHooks = (settings.hooks ?? {}) as Record<string, ClaudeHookGroup[]>;

  // Remove stale haema SOP hooks (identified by .haema/hooks/ in command path)
  const haemaHooksPath = path.join(homedir(), ".haema", "hooks");
  let removed = 0;
  for (const event of Object.keys(allHooks)) {
    const before = allHooks[event].length;
    allHooks[event] = allHooks[event].filter((group) =>
      !group.hooks.some((h) => h.command.includes(haemaHooksPath) && !h.command.includes("suggest-skill.sh") && !h.command.includes("auto-log-session")),
    );
    removed += before - allHooks[event].length;
  }

  // Register Stop hook for auto-log-session
  const stopGroups = allHooks["Stop"] ?? [];
  const stopCommand = `bash ${stopScriptPath}`;
  if (!stopGroups.some((g) => g.hooks.some((h) => h.command === stopCommand))) {
    stopGroups.push({ hooks: [{ type: "command", command: stopCommand, statusMessage: "Haema: 세션 자동 저장" }] });
  }
  allHooks["Stop"] = stopGroups;

  // Add new SOP hooks grouped by event
  const byEvent = new Map<string, HookEntry[]>();
  for (const hook of hooks) {
    const arr = byEvent.get(hook.hookEvent) ?? [];
    arr.push(hook);
    byEvent.set(hook.hookEvent, arr);
  }

  for (const [event, eventHooks] of byEvent) {
    const existingGroups = allHooks[event] ?? [];
    for (const hook of eventHooks) {
      const scriptPath = path.join(hooksDir, `${hook.slug}.sh`);
      const command = `bash ${scriptPath}`;
      const alreadyExists = existingGroups.some((g) =>
        g.hooks.some((h) => h.command === command),
      );
      if (!alreadyExists) {
        existingGroups.push({
          matcher: hook.hookMatcher,
          hooks: [{ type: "command", command, statusMessage: `SOP: ${hook.name}` }],
        });
      }
    }
    allHooks[event] = existingGroups;
  }

  settings.hooks = allHooks;
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

  const lines: string[] = [];
  lines.push(`✅ Stop 훅 등록 완료 — 세션 종료 시 작업 내역이 자동으로 저장돼요.`);
  if (hooks.length === 0) {
    lines.push("등록할 SOP 훅이 없어요. 태스크가 쌓이면 AI가 자동으로 패턴을 감지해 훅을 생성해요.");
  } else {
    lines.push(`✅ ${hooks.length}개 SOP 훅 적용 완료 (${removed > 0 ? `${removed}개 교체` : "신규 등록"})`);
    for (const hook of hooks) {
      lines.push(`- [${hook.hookEvent}:${hook.hookMatcher}] ${hook.name}`);
    }
    lines.push(`\n스크립트 위치: ${hooksDir}/`);
    lines.push(`다음 세션부터 "${hooks.map((h) => h.hookMatcher).join(", ")}" 툴 호출 시 자동으로 SOP 리마인더가 실행돼요.`);
  }

  return lines.join("\n");
}
