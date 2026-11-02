import { createServer } from "node:http";
import { Readable } from "node:stream";

import { handleMcp, protectedResourceMetadata } from "./handler.js";

/** Local server: `ORI_BASE_URL=… ORI_CONNECTOR_TOKEN=… npm run dev`, then point Muse Code at http://localhost:8787/mcp. */
const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
    const meta = protectedResourceMetadata(new Request(url));
    res.writeHead(meta.status, Object.fromEntries(meta.headers)).end(await meta.text());
    return;
  }
  if (url.pathname !== "/mcp") {
    res.writeHead(url.pathname === "/" ? 200 : 404, { "content-type": "text/plain" }).end("Ori for Muse: MCP endpoint at /mcp\n");
    return;
  }
  const request = new Request(url, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([key, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((v) => [key, v] as [string, string]),
    ),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : (Readable.toWeb(req) as ReadableStream),
    duplex: "half",
  } as RequestInit);
  const response = await handleMcp(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Ori for Muse on http://localhost:${port}/mcp`));
