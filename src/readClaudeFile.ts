import { readFile, stat } from "node:fs/promises";

const MAX_BYTES = 256 * 1024;

export async function readClaudeFile(
  absPath: string
): Promise<{ content: string; mtime: number } | null> {
  try {
    const info = await stat(absPath);
    if (!info.isFile()) return null;
    const buf = await readFile(absPath);
    const sliced = buf.length > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
    return { content: sliced.toString("utf-8"), mtime: info.mtimeMs };
  } catch {
    return null;
  }
}
