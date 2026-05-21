import { buildSession } from "./buildSession.js";
import type { ContentBlock, RawEvent } from "./types.js";

export function parseCursorSession(text: string, sessionId: string, cwd?: string): ReturnType<typeof buildSession> | null {
  const events: RawEvent[] = [];
  let prevUuid: string | null = null;
  let lineIndex = 0;

  const metaUuid = `${sessionId}:meta`;
  events.push({ type: "session_meta", uuid: metaUuid, sessionId, cwd });
  prevUuid = metaUuid;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;

    const { role, message } = parsed as { role?: unknown; message?: unknown };
    if (role !== "user" && role !== "assistant") continue;
    if (!isRecord(message)) continue;

    const rawContent = message.content;
    if (!Array.isArray(rawContent)) continue;

    const uuid = `${sessionId}:${lineIndex++}`;

    if (role === "user") {
      const first = rawContent.find((c) => isRecord(c) && c.type === "text");
      const rawText = isRecord(first) && typeof first.text === "string" ? first.text : "";
      events.push({
        type: "user",
        uuid,
        parentUuid: prevUuid ?? undefined,
        sessionId,
        timestamp: extractTimestamp(rawText),
        cwd,
        message: { role: "user", content: cleanUserText(rawText) },
      });
    } else {
      events.push({
        type: "assistant",
        uuid,
        parentUuid: prevUuid ?? undefined,
        sessionId,
        cwd,
        message: { role: "assistant", content: mapContentBlocks(rawContent) },
      });
    }

    prevUuid = uuid;
  }

  if (events.length === 0) return null;
  return buildSession(sessionId, events);
}

function extractTimestamp(text: string): string | undefined {
  const m = /<timestamp>([^<]+)<\/timestamp>/i.exec(text);
  if (!m) return undefined;
  const raw = m[1]
    .replace(/^[^,]+,\s*/, "")
    .replace(/\s*\(UTC[+-]\d+\)\s*$/i, "")
    .trim();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function cleanUserText(text: string): string {
  const m = /<user_query>([\s\S]*?)<\/user_query>/i.exec(text);
  if (m) return m[1].trim();
  return text.replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, "").trim();
}

function mapContentBlocks(raw: unknown[]): ContentBlock[] | string {
  const blocks: ContentBlock[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (item.type === "text" && typeof item.text === "string") {
      blocks.push({ type: "text", text: item.text });
    } else if (item.type === "tool_use" && typeof item.name === "string") {
      blocks.push({
        type: "tool_use",
        id: typeof item.id === "string" ? item.id : item.name,
        name: item.name,
        input: isRecord(item.input) ? item.input : {},
      });
    }
  }
  if (blocks.length === 0) return "";
  if (blocks.length === 1 && blocks[0].type === "text")
    return (blocks[0] as Extract<ContentBlock, { type: "text" }>).text;
  return blocks;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
