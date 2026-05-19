import { parseJsonlFile } from "../parseJsonl.js";
import { resolveSessionPath } from "../resolveSession.js";
import type { AssistantUsage, RawEvent } from "../types.js";

type InspectOptions = {
  type?: string;
  limit?: number;
  raw?: boolean;
};

export async function inspectCommand(file: string | undefined, options: InspectOptions): Promise<void> {
  const path = await resolveSessionPath(file);
  const events = await parseJsonlFile(path);

  const filtered = options.type
    ? events.filter((e) => e.type === options.type)
    : events;

  if (options.raw) {
    const limit = options.limit ?? filtered.length;
    for (const e of filtered.slice(0, limit)) {
      console.log(JSON.stringify(e));
    }
    return;
  }

  console.log(`총 이벤트: ${events.length} (필터 후 ${filtered.length})`);
  printTypeBreakdown(filtered);
  printTokenUsage(filtered);
}

function printTypeBreakdown(events: RawEvent[]): void {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  console.log("\n[type 분포]");
  for (const [type, n] of rows) console.log(`  ${type.padEnd(20)} ${n}`);
}

function printTokenUsage(events: RawEvent[]): void {
  const totals: Required<AssistantUsage> = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  for (const e of events) {
    const usage = e.message?.usage;
    if (!usage) continue;
    totals.input_tokens += usage.input_tokens ?? 0;
    totals.output_tokens += usage.output_tokens ?? 0;
    totals.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0;
    totals.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
  }
  console.log("\n[token 사용량]");
  console.log(`  input              ${totals.input_tokens.toLocaleString()}`);
  console.log(`  output             ${totals.output_tokens.toLocaleString()}`);
  console.log(`  cache_creation     ${totals.cache_creation_input_tokens.toLocaleString()}`);
  console.log(`  cache_read         ${totals.cache_read_input_tokens.toLocaleString()}`);
}
