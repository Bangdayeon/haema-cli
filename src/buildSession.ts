import { extractTitle } from "./extractTitle.js";
import type { RawEvent, Session } from "./types.js";

export function buildSession(id: string, events: RawEvent[]): Session {
  const timestamps = events
    .map((e) => e.timestamp)
    .filter((t): t is string => typeof t === "string")
    .sort();
  return {
    id,
    title: extractTitle(events),
    startedAt: timestamps[0],
    endedAt: timestamps[timestamps.length - 1],
    events,
  };
}
