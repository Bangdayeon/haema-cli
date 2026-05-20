import { buildSession } from "./buildSession.js";
import type { ContentBlock, RawEvent, Session } from "./types.js";

type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
};

export function parseCodexRollout(text: string): Session | null {
  let sessionId: string | null = null;
  let currentModel: string | null = null;
  let lastTokenUsage: TokenUsage | null = null;
  const events: RawEvent[] = [];
  let prevUuid: string | null = null;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;

    const { timestamp, type, payload } = parsed as {
      timestamp?: unknown;
      type?: unknown;
      payload?: unknown;
    };
    if (typeof type !== "string" || !isRecord(payload)) continue;
    const ts = typeof timestamp === "string" ? timestamp : undefined;

    if (type === "session_meta") {
      sessionId = typeof payload.id === "string" ? payload.id : null;
      const cwd = typeof payload.cwd === "string" ? payload.cwd : undefined;
      const version =
        typeof payload.cli_version === "string" ? payload.cli_version : undefined;
      const gitBranch =
        isRecord(payload.git) && typeof payload.git.branch === "string"
          ? payload.git.branch
          : undefined;
      const uuid = `${sessionId ?? "unknown"}:meta`;
      events.push({
        type: "session_meta",
        uuid,
        sessionId: sessionId ?? undefined,
        timestamp: ts,
        cwd,
        gitBranch,
        version,
      });
      prevUuid = uuid;
      continue;
    }

    if (type === "turn_context") {
      if (typeof payload.model === "string") currentModel = payload.model;
      continue;
    }

    if (
      type === "event_msg" &&
      payload.type === "token_count" &&
      isRecord(payload.info)
    ) {
      const total = (payload.info as Record<string, unknown>).total_token_usage;
      if (isRecord(total)) {
        lastTokenUsage = {
          input_tokens:
            typeof total.input_tokens === "number" ? total.input_tokens : 0,
          output_tokens:
            typeof total.output_tokens === "number" ? total.output_tokens : 0,
          cached_input_tokens:
            typeof total.cached_input_tokens === "number"
              ? total.cached_input_tokens
              : 0,
        };
      }
      continue;
    }

    if (type !== "response_item") continue;

    const itemType = payload.type;
    const uuid = `${sessionId ?? "unknown"}:${i}`;

    if (itemType === "message") {
      const role = payload.role === "user" ? "user" : "assistant";
      const content = mapContentBlocks(payload.content);
      events.push({
        type: role,
        uuid,
        parentUuid: prevUuid ?? undefined,
        sessionId: sessionId ?? undefined,
        timestamp: ts,
        message: {
          role,
          content,
          ...(role === "assistant" && currentModel ? { model: currentModel } : {}),
        },
      });
      prevUuid = uuid;
    } else if (itemType === "local_shell_call") {
      events.push({
        type: "assistant",
        uuid,
        parentUuid: prevUuid ?? undefined,
        sessionId: sessionId ?? undefined,
        timestamp: ts,
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: String(payload.call_id ?? uuid),
              name: "shell",
              input: payload.action ?? {},
            },
          ],
        },
      });
      prevUuid = uuid;
    } else if (itemType === "function_call") {
      let input: unknown = {};
      if (typeof payload.arguments === "string") {
        try {
          input = JSON.parse(payload.arguments);
        } catch {
          input = { raw: payload.arguments };
        }
      }
      events.push({
        type: "assistant",
        uuid,
        parentUuid: prevUuid ?? undefined,
        sessionId: sessionId ?? undefined,
        timestamp: ts,
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: String(payload.call_id ?? uuid),
              name: String(payload.name ?? "function"),
              input,
            },
          ],
        },
      });
      prevUuid = uuid;
    } else if (itemType === "function_call_output") {
      events.push({
        type: "user",
        uuid,
        parentUuid: prevUuid ?? undefined,
        sessionId: sessionId ?? undefined,
        timestamp: ts,
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: String(payload.call_id ?? ""),
              content: payload.output ?? "",
              is_error: false,
            },
          ],
        },
      });
      prevUuid = uuid;
    }
  }

  if (!sessionId) return null;

  if (
    lastTokenUsage &&
    (lastTokenUsage.input_tokens > 0 || lastTokenUsage.output_tokens > 0)
  ) {
    events.push({
      type: "assistant",
      uuid: `${sessionId}:tokens`,
      sessionId,
      message: {
        role: "assistant",
        content: [],
        usage: {
          input_tokens: lastTokenUsage.input_tokens,
          output_tokens: lastTokenUsage.output_tokens,
          cache_read_input_tokens: lastTokenUsage.cached_input_tokens,
        },
        ...(currentModel ? { model: currentModel } : {}),
      },
    });
  }

  return buildSession(sessionId, events);
}

function mapContentBlocks(raw: unknown): ContentBlock[] | string {
  if (!Array.isArray(raw)) return "";
  const blocks: ContentBlock[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (
      (item.type === "input_text" || item.type === "output_text") &&
      typeof item.text === "string"
    ) {
      blocks.push({ type: "text", text: item.text });
    }
  }
  if (blocks.length === 0) return "";
  if (blocks.length === 1)
    return (blocks[0] as Extract<ContentBlock, { type: "text" }>).text;
  return blocks;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
