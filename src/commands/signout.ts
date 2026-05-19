import { promises as fs } from "node:fs";

import { authFilePath, readAuth } from "../auth.js";

export async function signoutCommand(): Promise<void> {
  const auth = await readAuth();
  if (!auth) {
    console.log("이미 로그아웃 상태예요.");
    return;
  }
  await fs.rm(authFilePath());
  const who = auth.email ? ` (${auth.email})` : "";
  console.log(`로그아웃 완료${who}`);
}
