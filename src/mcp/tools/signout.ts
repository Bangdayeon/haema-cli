import { promises as fs } from "node:fs";

import { authFilePath, readAuth } from "../../auth.js";

export async function handleSignout(): Promise<string> {
  const auth = await readAuth();
  if (!auth) return "이미 로그아웃 상태예요.";
  await fs.rm(authFilePath());
  const who = auth.email ? ` (${auth.email})` : "";
  return `로그아웃 완료${who}`;
}
