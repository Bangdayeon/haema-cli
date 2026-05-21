import { buildSession } from "./buildSession.js";
import type { ContentBlock, RawEvent, Session } from "./types.js";

export function parseGeminiSession(text: string, cwd?: string): Session | null {
  let sessionId: string | null = null;
  let startTime: string | undefined;

  const idOrder: string[] = [];
  const geminiById = new Map<string, GeminiTurn>();
  const userById = new Map<string, UserTurn>();

  const lines = text.split("\n");
  let isFirst = true;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;

    // 헤더: 첫 번째 유효 줄, sessionId 있고 type 없음
    if (isFirst) {
      isFirst = false;
      if (typeof parsed.sessionId === "string") {
        sessionId = parsed.sessionId;
        startTime = typeof parsed.startTime === "string" ? parsed.startTime : undefined;
        continue;
      }
    }

    if ("$set" in parsed) continue;

    const type = parsed.type;
    const id = typeof parsed.id === "string" ? parsed.id : null;
    if (!id) continue;

    if (type === "gemini") {
      if (!geminiById.has(id)) idOrder.push(id);
      geminiById.set(id, parsed as unknown as GeminiTurn); // 마지막 등장 우선 (스트리밍 dedup)
    } else if (type === "user") {
      if (!userById.has(id)) idOrder.push(id);
      userById.set(id, parsed as unknown as UserTurn);
    }
  }

  if (!sessionId) return null;

  const events: RawEvent[] = [];
  let prevUuid: string | null = null;

  const metaUuid = `${sessionId}:meta`;
  events.push({ type: "session_meta", uuid: metaUuid, sessionId, timestamp: startTime, cwd });
  prevUuid = metaUuid;

  for (const id of idOrder) {
    const g = geminiById.get(id);
    if (g) {
      prevUuid = emitGeminiTurn(g, sessionId, prevUuid, events);
      continue;
    }
    const u = userById.get(id);
    if (u) prevUuid = emitUserTurn(u, sessionId, prevUuid, events);
  }

  return buildSession(sessionId, events);
}

function emitGeminiTurn(
  turn: GeminiTurn,
  sessionId: string,
  prevUuid: string | null,
  events: RawEvent[],
): string {
  const uuid = `${sessionId}:${turn.id}`;
  const toolCalls = turn.toolCalls ?? [];
  const contentBlocks: ContentBlock[] = [];

  if (typeof turn.content === "string" && turn.content.length > 0) {
    contentBlocks.push({ type: "text", text: turn.content });
  }
  for (const tc of toolCalls) {
    contentBlocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args ?? {} });
  }

  const tok = turn.tokens ?? {};
  events.push({
    type: "assistant",
    uuid,
    parentUuid: prevUuid ?? undefined,
    sessionId,
    timestamp: turn.timestamp,
    message: {
      role: "assistant",
      content: contentBlocks,
      usage: {
        input_tokens: tok.input ?? 0,
        output_tokens: (tok.output ?? 0) + (tok.thoughts ?? 0),
        cache_read_input_tokens: tok.cached ?? 0,
      },
      model: typeof turn.model === "string" ? turn.model : undefined,
    },
  });

  let last = uuid;

  // status:"error"인 툴콜 → is_error tool_result 이벤트 생성 (extractErrors 호환)
  const errorCalls = toolCalls.filter((tc) => tc.status === "error");
  if (errorCalls.length > 0) {
    const errUuid = `${sessionId}:${turn.id}:err`;
    events.push({
      type: "user",
      uuid: errUuid,
      parentUuid: last,
      sessionId,
      timestamp: turn.timestamp,
      message: {
        role: "user",
        content: errorCalls.map((tc) => ({
          type: "tool_result" as const,
          tool_use_id: tc.id,
          content: extractToolResultText(tc.result),
          is_error: true,
        })),
      },
    });
    last = errUuid;
  }

  return last;
}

function emitUserTurn(
  turn: UserTurn,
  sessionId: string,
  prevUuid: string | null,
  events: RawEvent[],
): string {
  const uuid = `${sessionId}:${turn.id}`;
  const text = Array.isArray(turn.content)
    ? turn.content
        .filter((c) => typeof c.text === "string")
        .map((c) => c.text)
        .join("\n")
        .trim()
    : "";
  events.push({
    type: "user",
    uuid,
    parentUuid: prevUuid ?? undefined,
    sessionId,
    timestamp: turn.timestamp,
    message: { role: "user", content: text },
  });
  return uuid;
}

function extractToolResultText(result: unknown): string {
  if (!Array.isArray(result)) return "";
  const parts: string[] = [];
  for (const item of result) {
    if (!isRecord(item)) continue;
    const fr = item.functionResponse;
    if (isRecord(fr) && isRecord(fr.response) && typeof fr.response.output === "string") {
      parts.push(fr.response.output);
    }
  }
  return parts.join("\n").trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type GeminiTurn = {
  id: string;
  timestamp: string;
  type: "gemini";
  content: unknown;
  tokens: { input?: number; output?: number; cached?: number; thoughts?: number };
  model: string;
  toolCalls?: GeminiToolCall[];
};

type GeminiToolCall = {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: string;
};

type UserTurn = {
  id: string;
  timestamp: string;
  type: "user";
  content: Array<{ text: string }>;
};
