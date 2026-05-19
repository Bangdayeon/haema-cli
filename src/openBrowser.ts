import { spawn } from "node:child_process";

export function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
    // 브라우저 자동 열기 실패해도 무시 — 사용자가 URL 직접 열면 됨
  });
  child.unref();
}
