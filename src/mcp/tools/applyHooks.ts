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

export async function handleApplyHooks(projectId: string, config: McpConfig): Promise<string> {
  const data = await mcpGet<HooksResponse>(config, "/api/memory/hooks", { projectId });
  if (!data.ok) throw new Error(data.error);

  const { hooks } = data;
  const hooksDir = path.join(homedir(), ".votra", "hooks");
  await fs.mkdir(hooksDir, { recursive: true });

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

  // Remove stale votra SOP hooks (identified by .votra/hooks/ in command path)
  const votraHooksPath = path.join(homedir(), ".votra", "hooks");
  let removed = 0;
  for (const event of Object.keys(allHooks)) {
    const before = allHooks[event].length;
    allHooks[event] = allHooks[event].filter((group) =>
      !group.hooks.some((h) => h.command.includes(votraHooksPath) && !h.command.includes("suggest-skill.sh") && !h.command.includes("auto-log-session")),
    );
    removed += before - allHooks[event].length;
  }

  // Add new hooks grouped by event
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
  if (hooks.length === 0) {
    lines.push("적용할 SOP 훅이 없어요. 태스크가 쌓이면 AI가 자동으로 패턴을 감지해 훅을 생성해요.");
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
