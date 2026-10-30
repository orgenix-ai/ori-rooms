/**
 * The Codex builds' only way to OpenAI models (#870's OpenAI slice): a small HTTP relay beside the sandbox, on the
 * build's internal network as http://openai:8080, that holds Orgenix's OpenAI key. The sandbox runs agent code with
 * permissions bypassed, so the key never enters it: the Codex CLI there is pointed at this relay with a placeholder
 * key, and the relay forwards only Responses API calls (`POST /v1/responses`) for the models the build may use, with
 * the real key set and anything the caller sent for authorization dropped.
 *
 * Orgenix calls providers directly by default (PO policy, 2026-10-17), so the default route is OpenAI's own API
 * (`api.openai.com`, `Authorization: Bearer`). Azure OpenAI is an optional route, switched on by configuration while
 * Orgenix has credits there: the same call goes to the resource's `/openai/v1/responses` with `api-key`.
 *
 * It is also the build's meter: token usage is counted from the provider's own responses (a plain answer's `usage`, a
 * stream's `response.completed`) and `GET /__usage` returns the totals per model, which the session's spend guard prices.
 *
 * Environment: OPENAI_API_KEY, OPENAI_MODELS (comma-separated model names the build may use), OPENAI_ROUTE (`openai`,
 * the default, or `azure` with AZURE_OPENAI_ENDPOINT, https://<resource>.openai.azure.com); PORT (default 8080).
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { pipeline, Readable, Transform, type TransformCallback } from "node:stream";

/** What a model call is counted as: input tokens not served from the cache, cached input tokens, and output tokens. */
export type CodexTokens = { in: number; cached: number; out: number };

type ResponsesUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
};

/** One Responses API `usage` object as tokens (the cached part of the input is not also counted as input). Pure. */
export function codexTokensOf(usage: ResponsesUsage | undefined | null): CodexTokens {
  const input = usage?.input_tokens ?? 0;
  const cached = Math.min(usage?.input_tokens_details?.cached_tokens ?? 0, input);
  return { in: input - cached, cached, out: usage?.output_tokens ?? 0 };
}

/** Where the relay sends a call: OpenAI's own API, or (optional) an Azure OpenAI resource. */
export type OpenAiRoute = { kind: "openai" } | { kind: "azure"; endpoint: string };

/** The only Azure addresses a key may be sent to: an Azure OpenAI or Foundry resource over HTTPS. Pure. */
export function validAzureEndpoint(endpoint: string): boolean {
  return /^https:\/\/[a-z0-9][a-z0-9-]{1,62}\.(?:openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)\/?$/.test(endpoint);
}

/** The route the environment names: OpenAI direct unless it says azure. Throws on a route it does not have. Pure. */
export function routeFromEnv(env: { OPENAI_ROUTE?: string | undefined; AZURE_OPENAI_ENDPOINT?: string | undefined }): OpenAiRoute {
  const route = env.OPENAI_ROUTE?.trim() || "openai";
  if (route === "openai") return { kind: "openai" };
  if (route === "azure") {
    const endpoint = (env.AZURE_OPENAI_ENDPOINT ?? "").trim().replace(/\/$/, "");
    if (!validAzureEndpoint(endpoint)) throw new Error("AZURE_OPENAI_ENDPOINT is not an Azure OpenAI resource address");
    return { kind: "azure", endpoint };
  }
  throw new Error(`OPENAI_ROUTE ${JSON.stringify(route)} is not a route this relay has (openai, azure)`);
}

/** The upstream URL of a call the CLI made to `/v1/responses…`. Pure. */
export function upstreamUrl(route: OpenAiRoute, url: string): string {
  return route.kind === "openai" ? `https://api.openai.com${url}` : `${route.endpoint}/openai${url}`;
}

/** The only request the relay forwards. Pure. */
export function allowedRequest(method: string, url: string): boolean {
  const [pathname] = url.split("?");
  return method === "POST" && pathname === "/v1/responses";
}

/** Why a request body may not be forwarded, or null: it must name a model the build may use. Pure. */
export function bodyRefusal(body: string, models: readonly string[]): string | null {
  let parsed: { model?: unknown };
  try {
    parsed = JSON.parse(body) as { model?: unknown };
  } catch {
    return "the request is not JSON";
  }
  if (typeof parsed.model !== "string" || !models.includes(parsed.model)) {
    return `the request names ${JSON.stringify(parsed.model)}, not one of this build's models (${models.join(", ")})`;
  }
  return null;
}

/** Request headers passed upstream: what the call needs plus the route's own authorization, never the caller's. Pure. */
export function forwardedHeaders(incoming: IncomingMessage["headers"], route: OpenAiRoute, key: string): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of ["content-type", "accept", "openai-beta", "user-agent", "session_id", "x-client-request-id"]) {
    const value = incoming[name];
    if (typeof value === "string") kept[name] = value;
  }
  if (route.kind === "azure") kept["api-key"] = key;
  else kept.authorization = `Bearer ${key}`;
  return kept;
}

export class CodexUsageMeter {
  private readonly models = new Map<string, CodexTokens>();
  private requests = 0;

  add(model: string, tokens: CodexTokens): void {
    const current = this.models.get(model) ?? { in: 0, cached: 0, out: 0 };
    this.models.set(model, { in: current.in + tokens.in, cached: current.cached + tokens.cached, out: current.out + tokens.out });
    this.requests += 1;
  }

  /** A non-streamed answer's body, as received; an error body is nothing billed. */
  addJson(model: string, body: string): void {
    try {
      const parsed = JSON.parse(body) as { usage?: ResponsesUsage };
      if (parsed.usage) this.add(model, codexTokensOf(parsed.usage));
    } catch {
      // Not a response object.
    }
  }

  totals(): { requests: number; models: Record<string, CodexTokens> } {
    return { requests: this.requests, models: Object.fromEntries(this.models) };
  }
}

/**
 * Passes a streamed answer through unchanged and, when it ends, adds the usage its final event carries
 * (`response.completed`, or `response.incomplete` / `response.failed`, which are billed as far as they got).
 */
export class ResponsesStreamTap extends Transform {
  private buffer = "";
  private counted = false;

  constructor(
    private readonly meter: CodexUsageMeter,
    private readonly model: string,
  ) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.buffer += chunk.toString("utf8");
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      this.line(this.buffer.slice(0, newline).trim());
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
    }
    done(null, chunk);
  }

  override _flush(done: TransformCallback): void {
    this.line(this.buffer.trim());
    done();
  }

  private line(line: string): void {
    if (!line.startsWith("data:")) return;
    try {
      const event = JSON.parse(line.slice(5).trim()) as { type?: string; response?: { usage?: ResponsesUsage } };
      if ((event.type === "response.completed" || event.type === "response.incomplete" || event.type === "response.failed") && event.response?.usage) {
        // Counted when the event is read, not when the stream ends: a caller that has read it may close the connection, and
        // a pipeline that is torn down by that never reaches the end (the first Azure lab run's relay counted a tenth).
        if (!this.counted) {
          this.counted = true;
          this.meter.add(this.model, codexTokensOf(event.response.usage));
        }
      }
    } catch {
      // A data line that is not JSON ([DONE] and the like).
    }
  }
}

const MAX_BODY_BYTES = 64 * 1024 * 1024;

export type RelayOptions = {
  route: OpenAiRoute;
  key: string;
  models: readonly string[];
  /** The transport to the provider; a test replaces it. */
  fetch?: typeof fetch;
};

/** The relay's HTTP server and its meter. Throws without a key or a model, or for an Azure address that is not Azure's. */
export function createRelay(options: RelayOptions): { server: Server; meter: CodexUsageMeter } {
  if (options.route.kind === "azure" && !validAzureEndpoint(options.route.endpoint)) throw new Error("AZURE_OPENAI_ENDPOINT is not an Azure OpenAI resource address");
  if (options.key.length < 16) throw new Error("OPENAI_API_KEY is not set");
  if (options.models.length === 0) throw new Error("OPENAI_MODELS is not set");
  const route: OpenAiRoute = options.route.kind === "azure" ? { kind: "azure", endpoint: options.route.endpoint.replace(/\/$/, "") } : options.route;
  const doFetch = options.fetch ?? fetch;
  const meter = new CodexUsageMeter();
  const server = createServer(async (request, response) => {
    const url = request.url ?? "";
    if (request.method === "GET" && url === "/__usage") {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(meter.totals()));
      return;
    }
    if (!allowedRequest(request.method ?? "", url)) {
      response.writeHead(403, { "content-type": "text/plain" }).end("not a Responses call");
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY_BYTES) {
          response.writeHead(413, { "content-type": "text/plain" }).end("request too large");
          return;
        }
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks);
      const refusal = bodyRefusal(body.toString("utf8"), options.models);
      if (refusal) {
        response.writeHead(403, { "content-type": "text/plain" }).end(refusal);
        return;
      }
      const model = (JSON.parse(body.toString("utf8")) as { model: string }).model;
      const upstream = await doFetch(upstreamUrl(route, url), { method: "POST", headers: forwardedHeaders(request.headers, route, options.key), body });
      const headers: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) headers[name] = value;
      });
      response.writeHead(upstream.status, headers);
      if (!upstream.body) {
        response.end();
        return;
      }
      // An upstream that breaks mid-answer must end this answer and nothing else: pipeline() carries the error to every
      // stream and `response.destroy()` lets the caller see a reset (and retry), where a bare pipe() left the error
      // unhandled and took the whole relay down (found in the first lab run on the Azure route, 2026-10-17).
      if ((upstream.headers.get("content-type") ?? "").includes("text/event-stream")) {
        pipeline(Readable.fromWeb(upstream.body as never), new ResponsesStreamTap(meter, model), response, (error) => {
          if (error) response.destroy();
        });
      } else {
        const text = await upstream.text();
        if (upstream.ok) meter.addJson(model, text);
        response.end(text);
      }
    } catch (error) {
      // The message can name the upstream address; it never carries the key (headers are not in errors). Once the answer's
      // headers are out there is no status left to give: the connection is cut.
      if (response.headersSent) response.destroy();
      else response.writeHead(502, { "content-type": "text/plain" }).end(`relay: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { server, meter };
}

if (process.argv[1]?.endsWith("openai-relay.mjs") || process.argv[1]?.endsWith("openai-relay.ts")) {
  const models = (process.env.OPENAI_MODELS ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  const route = routeFromEnv(process.env);
  // A failure inside one request must never end the relay, which every agent of the build depends on.
  process.on("uncaughtException", (error) => console.error("relay: uncaught", error.message));
  process.on("unhandledRejection", (error) => console.error("relay: unhandled", error instanceof Error ? error.message : String(error)));
  const { server } = createRelay({ route, key: process.env.OPENAI_API_KEY ?? "", models });
  server.listen(Number(process.env.PORT ?? "8080"), "0.0.0.0", () => console.log(`openai relay, route ${route.kind} (${models.join(", ")})`));
}
