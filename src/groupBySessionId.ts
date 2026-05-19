import type { RawEvent } from "./types.js";

export function groupBySessionId(events: RawEvent[]): Map<string, RawEvent[]> {
  const groups = new Map<string, RawEvent[]>();
  for (const event of events) {
    const id = event.sessionId;
    if (!id) continue;
    const bucket = groups.get(id);
    if (bucket) bucket.push(event);
    else groups.set(id, [event]);
  }
  return groups;
}
