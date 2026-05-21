import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(homedir(), ".votra", "upload-state");

function stateFile(source: string): string {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  return join(STATE_DIR, `${hash}.json`);
}

export async function loadState(source: string): Promise<Map<string, number>> {
  try {
    const content = await readFile(stateFile(source), "utf8");
    const obj = JSON.parse(content) as Record<string, number>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export async function saveState(source: string, sent: Map<string, number>): Promise<void> {
  try {
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(stateFile(source), JSON.stringify(Object.fromEntries(sent)));
  } catch {
    // state 저장 실패는 non-fatal — 다음 실행에서 재시도
  }
}
