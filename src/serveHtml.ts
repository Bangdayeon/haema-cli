import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { injectLiveReload } from "./liveReloadScript.js";

export type ServeHandle = {
  url: string;
  update: (html: string) => void;
  close: () => Promise<void>;
};

export async function serveHtml(initialHtml: string, port: number): Promise<ServeHandle> {
  let html = injectLiveReload(initialHtml);
  let stamp = Date.now();

  const server = createServer((req, res) => handle(req, res));

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";
    if (url === "/__votra/version") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ stamp }));
      return;
    }
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    url: `http://127.0.0.1:${actualPort}/`,
    update(next: string) {
      html = injectLiveReload(next);
      stamp = Date.now();
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
