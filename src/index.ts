#!/usr/bin/env node
import { installCommand } from "./mcp/install.js";
import { readMcpConfig } from "./mcp/mcpClient.js";
import { startHttp, startStdio } from "./mcp/server.js";

const args = process.argv.slice(2);

if (args[0] === "install") {
  installCommand(args[1]).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
} else {
  const portArg = args.indexOf("--port");
  const port = portArg !== -1 ? Number(args[portArg + 1]) : undefined;
  const cwdArg = args.indexOf("--cwd");
  const cwd = cwdArg !== -1 ? args[cwdArg + 1] : process.cwd();

  readMcpConfig()
    .then((config) => {
      if (port !== undefined) return startHttp(port, config, cwd);
      return startStdio(config, cwd);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
