import { readFile } from "node:fs/promises";
import { parseLine } from "./parseLine.js";
import type { RawEvent } from "./types.js";

export async function parseJsonlFile(path: string): Promise<RawEvent[]> {
  const text = await readFile(path, "utf8");
  const events: RawEvent[] = [];
  for (const line of text.split("\n")) {
    const event = parseLine(line);
    if (event) events.push(event);
  }
  return events;
}
