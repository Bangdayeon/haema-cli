import type { ContentBlock, RawEvent, Session, TimelineItem } from "./types.js";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const CONTENT_CAP = 2000;

export function extractTimeline(session: Session): TimelineItem[] {
  const out: TimelineItem[] = [];
  const toolNameByUseId = new Map<string, string>();

  for (const event of session.events) {
    const ts = event.timestamp ?? "";

    if (event.type === "user") {
      const text = readUserText(event);
      if (text) {
        out.push({ kind: "PROMPT", role: "user", content: cap(text), occurredAt: ts });
      }
      pushToolResultErrors(event, toolNameByUseId, ts, out);
      continue;
    }
    if (event.type !== "assistant") continue;

    const blocks = getBlocks(event);
    if (!blocks) continue;

    const assistantText = readAssistantText(blocks);
    if (assistantText) {
      out.push({
        kind: "ASSISTANT",
        role: "assistant",
        content: cap(assistantText),
        occurredAt: ts,
      });
    }

    for (const b of blocks) {
      if (b.type !== "tool_use") continue;
      toolNameByUseId.set(b.id, b.name);
      out.push({
        kind: "TOOL_CALL",
        role: "assistant",
        toolName: b.name,
        occurredAt: ts,
      });
      if (EDIT_TOOLS.has(b.name)) {
        const path = readPath(b.input);
        if (path) {
          out.push({
            kind: "FILE_EDIT",
            role: "assistant",
            toolName: b.name,
            path,
            occurredAt: ts,
          });
        }
      }
    }
  }

  return out;
}

function pushToolResultErrors(
  event: RawEvent,
  toolNameByUseId: Map<string, string>,
  ts: string,
  out: TimelineItem[]
): void {
  const blocks = getBlocks(event);
  if (!blocks) return;
  for (const b of blocks) {
    if (b.type !== "tool_result" || b.is_error !== true) continue;
    const errorType = toolNameByUseId.get(b.tool_use_id) ?? "Unknown";
    out.push({
      kind: "ERROR",
      role: "tool",
      toolName: errorType,
      content: cap(extractResultText(b.content) ?? ""),
      occurredAt: ts,
    });
  }
}

function getBlocks(event: RawEvent): ContentBlock[] | null {
  const c = event.message?.content;
  return Array.isArray(c) ? c : null;
}

function readUserText(event: RawEvent): string | null {
  const c = event.message?.content;
  if (typeof c === "string") return c.trim() || null;
  if (!Array.isArray(c)) return null;
  const parts: string[] = [];
  for (const b of c) {
    if (b.type === "text" && b.text) parts.push(b.text);
  }
  const joined = parts.join(" ").trim();
  return joined || null;
}

function readAssistantText(blocks: ContentBlock[]): string | null {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text" && b.text) parts.push(b.text);
  }
  const joined = parts.join(" ").trim();
  return joined || null;
}

function readPath(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.file_path === "string") return obj.file_path;
  if (typeof obj.notebook_path === "string") return obj.notebook_path;
  return null;
}

function extractResultText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") parts.push(item);
    else if (
      typeof item === "object" &&
      item !== null &&
      "text" in item &&
      typeof (item as { text: unknown }).text === "string"
    ) {
      parts.push((item as { text: string }).text);
    }
  }
  return parts.join(" ").trim() || null;
}

function cap(s: string): string {
  return s.length > CONTENT_CAP ? `${s.slice(0, CONTENT_CAP - 1)}…` : s;
}
