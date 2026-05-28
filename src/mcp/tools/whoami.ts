import { authFilePath, readAuth } from "../../auth.js";

export async function handleWhoami(): Promise<string> {
  const auth = await readAuth();
  if (!auth) return "로그인되지 않았어요. `signin` 툴로 로그인해 주세요.";
  return [
    `계정:   ${auth.email ?? "(이메일 정보 없음)"}`,
    `서버:   ${auth.appUrl}`,
    `로그인: ${auth.signedInAt}`,
    `저장:   ${authFilePath()}`,
  ].join("\n");
}
