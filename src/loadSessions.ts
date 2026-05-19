import { buildSession } from "./buildSession.js";
import { groupBySessionId } from "./groupBySessionId.js";
import { parseJsonlFile } from "./parseJsonl.js";
import type { Session } from "./types.js";

export async function loadSessions(path: string): Promise<Session[]> {
  const events = await parseJsonlFile(path);
  const groups = groupBySessionId(events);
  const sessions: Session[] = [];
  for (const [id, sessionEvents] of groups) {
    sessions.push(buildSession(id, sessionEvents));
  }
  sessions.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return sessions;
}
