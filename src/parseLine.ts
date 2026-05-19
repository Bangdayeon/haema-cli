import type { RawEvent } from "./types.js";

export function parseLine(raw: string): RawEvent | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    if (typeof (parsed as { type?: unknown }).type !== "string") {
      return null;
    }
    return parsed as RawEvent;
  } catch {
    return null;
  }
}
