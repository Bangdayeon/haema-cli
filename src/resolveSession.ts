import { findLatestSession } from "./findSession.js";

export async function resolveSessionPath(input?: string): Promise<string> {
  if (input) return input;
  const latest = await findLatestSession();
  if (!latest) {
    throw new Error(
      "세션 파일을 찾지 못했어요. session.jsonl 경로를 직접 넣어주세요 (예: votra inspect ./session.jsonl)."
    );
  }
  console.error(`(자동 탐색) ${latest}`);
  return latest;
}
