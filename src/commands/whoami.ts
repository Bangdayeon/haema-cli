import { authFilePath, readAuth } from "../auth.js";

export async function whoamiCommand(): Promise<void> {
  const auth = await readAuth();
  if (!auth) {
    console.log("로그인되지 않았어요. `votra signin` 으로 로그인해 주세요.");
    process.exit(1);
  }
  console.log(`계정:   ${auth.email ?? "(이메일 정보 없음)"}`);
  console.log(`서버:   ${auth.appUrl}`);
  console.log(`로그인: ${auth.signedInAt}`);
  console.log(`저장:   ${authFilePath()}`);
}
