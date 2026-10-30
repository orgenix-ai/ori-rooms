/**
 * The Muse builds' only way to Meta's models: a small HTTP relay beside the sandbox, on the build's internal network as
 * http://muse:8080, that holds Orgenix's Meta Model API key. The sandbox runs agent code with permissions bypassed, so the
 * key never enters it: Muse Code there is pointed at this relay (`--base-url http://muse:8080/v1`) with a placeholder
 * `META_API_KEY`, and the relay forwards two calls to api.meta.ai with the real key set and anything the caller sent for
 * authorization dropped:
 *
 *   - `POST /v1/responses`, the model call (the Responses API), for the models the build may use: the build's own and the
 *     helper model Muse Code runs beside it (muse-spark-1.3). A call to any other model is refused.
 *   - `GET /muse-code/models`, the model catalog Muse Code reads at its start (outside `/v1`, whatever the base URL).
 *
 *   - `POST /v1/images/generations`, the picture call (docs/product/PICTURES.md §4), only when the build is given a picture
 *     model (MUSE_IMAGE_MODEL): that model and no other, `n` of 1, a size from the allowed list, a prompt that is text, and
 *     at most MUSE_IMAGE_MAX pictures (24) per build. Anything else is refused before it reaches Meta.
 *
 * It is also the build's meter: token usage is counted from Meta's own responses (a plain answer's `usage`, a stream's
 * `response.completed`, the OpenAI Responses shape) and `GET /__usage` returns the totals per model, which the session's
 * spend guard prices. The call and the stream handling are the OpenAI relay's own; only the upstream and the allowed calls
 * differ.
 *
 * Environment: META_API_KEY, MUSE_MODELS (comma-separated model ids the build may use); optional MUSE_IMAGE_MODEL,
 * MUSE_IMAGE_SIZES (comma-separated, default DEFAULT_IMAGE_SIZES), MUSE_IMAGE_MAX (default 24) and MUSE_IMAGE_CLASSIFIER (the
 * model that reads every picture prompt first; without it every picture is refused); PORT (default 8080).
 * Pictures are billed per picture, so /__usage reports the billed pictures (`images`) and the calls let through
 * (`imagesAsked`); token usage of a picture answer is not metered. It also lists the refused prompts (`refusals`: when,
 * which layer, which category) for operators; a caller is told the same thing for every refusal.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { pipeline, Readable } from "node:stream";

import { allowedRequest, bodyRefusal, CodexUsageMeter, ResponsesStreamTap } from "./openai-relay.js";
import { judgePicturePrompt, REFUSAL_MESSAGE, type PictureCategory, type PictureClassifier } from "./picture-guard.js";

const META = "https://api.meta.ai";
const MAX_BODY_BYTES = 64 * 1024 * 1024;

/** The sizes a picture call may ask for until the platform names its own (MUSE_IMAGE_SIZES). */
export const DEFAULT_IMAGE_SIZES: readonly string[] = ["1024x1024", "1536x1024", "1024x1536"];
/** Most pictures one build may make (PICTURES.md §4). */
export const DEFAULT_MAX_IMAGES = 24;
const MAX_PROMPT_CHARS = 2000;

/** Every prompt ends with this, whatever the agent wrote: the first of our rules (picture-guard.ts has the rest). */
export const IMAGE_SAFETY_SUFFIX = ", no text, no logos, no recognizable real people";

/** The prompt as it is sent: ours is the last word. */
export function withSafetySuffix(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.endsWith(IMAGE_SAFETY_SUFFIX) ? trimmed : `${trimmed}${IMAGE_SAFETY_SUFFIX}`;
}

/** Whether a call is the picture call. Pure. */
export function isImageRequest(method: string, url: string): boolean {
  return method === "POST" && url.split("?")[0] === "/v1/images/generations";
}

/** Why a picture request may not be forwarded, or null: the build's picture model, one picture, an allowed size, a text prompt. Pure. */
export function imageRefusal(body: string, imageModel: string, sizes: readonly string[]): string | null {
  let parsed: { model?: unknown; n?: unknown; size?: unknown; prompt?: unknown; response_format?: unknown };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return "the request is not JSON";
  }
  if (parsed.model !== imageModel) return `the request names ${JSON.stringify(parsed.model)}, not this build's picture model (${imageModel})`;
  if (parsed.n !== undefined && parsed.n !== 1) return "one picture per call: n must be 1";
  if (typeof parsed.prompt !== "string" || parsed.prompt.trim() === "" || parsed.prompt.length > MAX_PROMPT_CHARS) {
    return `the prompt must be text of at most ${MAX_PROMPT_CHARS} characters`;
  }
  if ((parsed as { response_format?: unknown }).response_format !== undefined && (parsed as { response_format?: unknown }).response_format !== "b64_json") {
    return "pictures come back as base64 (response_format b64_json), never as a link";
  }
  if (parsed.size !== undefined && (typeof parsed.size !== "string" || !sizes.includes(parsed.size))) {
    return `size ${JSON.stringify(parsed.size)} is not one of ${sizes.join(", ")}`;
  }
  return null;
}

/** How many pictures a successful answer carries (Meta bills per picture; a failed or filtered one is not billed). Pure. */
export function picturesIn(text: string): number {
  try {
    const data = (JSON.parse(text) as { data?: unknown }).data;
    return Array.isArray(data) ? data.filter((item) => item && typeof item === "object" && typeof (item as { b64_json?: unknown }).b64_json === "string").length : 0;
  } catch {
    return 0;
  }
}

/** The only catalog read the relay forwards. Pure. */
export function allowedCatalog(method: string, url: string): boolean {
  return method === "GET" && url.split("?")[0] === "/muse-code/models";
}

/** The upstream URL of a forwarded call: the same path at Meta. Pure. */
export function upstreamUrl(url: string): string {
  return `${META}${url}`;
}

/** Request headers passed upstream: what the call needs plus the real key as a bearer token, never the caller's. Pure. */
export function forwardedHeaders(incoming: IncomingMessage["headers"], key: string): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of ["content-type", "accept", "user-agent", "x-client-id"]) {
    const value = incoming[name];
    if (typeof value === "string") kept[name] = value;
  }
  kept.authorization = `Bearer ${key}`;
  return kept;
}

export type MuseRelayOptions = {
  key: string;
  models: readonly string[];
  /** The picture model this build may call (PICTURES.md); without one the picture call is refused. */
  imageModel?: string;
  /** The sizes a picture call may ask for. */
  imageSizes?: readonly string[];
  /** Most pictures this build may make. */
  maxImages?: number;
  /**
   * The small model that reads every picture prompt before the call (picture-guard.ts); without one every picture is
   * refused, because the check fails closed.
   */
  classifierModel?: string;
  /** Most refused prompts a build may send before the relay stops answering them (a loop of retries is a bug or an attack). */
  maxRefusals?: number;
  /** The transport to the provider; a test replaces it. */
  fetch?: typeof fetch;
};

/** The relay's HTTP server and its meter. Throws without a key or a model. */
export function createRelay(options: MuseRelayOptions): { server: Server; meter: CodexUsageMeter } {
  if (options.key.length < 16) throw new Error("META_API_KEY is not set");
  if (options.models.length === 0) throw new Error("MUSE_MODELS is not set");
  const doFetch = options.fetch ?? fetch;
  const meter = new CodexUsageMeter();
  const imageSizes = options.imageSizes ?? DEFAULT_IMAGE_SIZES;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  let asked = 0;
  let billed = 0;
  const maxRefusals = options.maxRefusals ?? 60;
  /** For operators only: what was refused and why. Never shown to a founder, never named to the caller. */
  const refusals: Array<{ at: string; source: "guard" | "classifier"; category: PictureCategory; prompt: string }> = [];

  /** The picture guard's classifier call, through this relay's key and meter; null when it fails, so the guard refuses. */
  const classifierModel = options.classifierModel;
  const classifier: PictureClassifier | undefined = classifierModel
    ? {
        model: classifierModel,
        call: async (body) => {
          try {
            const answer = await doFetch(upstreamUrl("/v1/responses"), {
              method: "POST",
              headers: forwardedHeaders({ "content-type": "application/json" }, options.key),
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(20_000),
            });
            const text = await answer.text();
            if (!answer.ok) return null;
            meter.addJson(classifierModel, text);
            return text;
          } catch {
            return null;
          }
        },
      }
    : undefined;
  const server = createServer(async (request, response) => {
    const url = request.url ?? "";
    const method = request.method ?? "";
    if (method === "GET" && url === "/__usage") {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ...meter.totals(), ...(options.imageModel ? { images: billed, imagesAsked: asked, refusals } : {}) }));
      return;
    }
    const picture = isImageRequest(method, url);
    if (picture && !options.imageModel) {
      response.writeHead(403, { "content-type": "text/plain" }).end("this build has no picture model");
      return;
    }
    const catalog = allowedCatalog(method, url);
    if (!picture && !catalog && !allowedRequest(method, url)) {
      response.writeHead(403, { "content-type": "text/plain" }).end("not a call this relay forwards");
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
      let body = Buffer.concat(chunks);
      let model = "";
      if (picture) {
        const refusal = imageRefusal(body.toString("utf8"), options.imageModel!, imageSizes);
        if (refusal) {
          response.writeHead(403, { "content-type": "text/plain" }).end(refusal);
          return;
        }
        // Our own rules, before anything reaches Meta. Every refusal says the same thing to the caller; the reason is logged.
        if (refusals.length >= maxRefusals) {
          response.writeHead(429, { "content-type": "text/plain" }).end(REFUSAL_MESSAGE);
          return;
        }
        const prompt = String((JSON.parse(body.toString("utf8")) as { prompt: unknown }).prompt);
        const judged = await judgePicturePrompt(prompt, classifier);
        if (!judged.verdict.allowed) {
          refusals.push({ at: new Date().toISOString(), source: judged.source, category: judged.verdict.category, prompt: prompt.slice(0, 200) });
          response.writeHead(403, { "content-type": "text/plain" }).end(REFUSAL_MESSAGE);
          return;
        }
        // The cap counts every picture asked for and let through, so a failing call cannot be retried past it for free.
        if (asked >= maxImages) {
          response.writeHead(429, { "content-type": "text/plain" }).end(`this build has made its ${maxImages} pictures`);
          return;
        }
        asked += 1;
        model = options.imageModel!;
        // One picture, a base64 answer and our safety suffix, whatever the caller wrote.
        const sent = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
        body = Buffer.from(JSON.stringify({ ...sent, n: 1, prompt: withSafetySuffix(String(sent.prompt)) }));
      } else if (!catalog) {
        const refusal = bodyRefusal(body.toString("utf8"), options.models);
        if (refusal) {
          response.writeHead(403, { "content-type": "text/plain" }).end(refusal);
          return;
        }
        model = (JSON.parse(body.toString("utf8")) as { model: string }).model;
      }
      const upstream = await doFetch(upstreamUrl(url), { method, headers: forwardedHeaders(request.headers, options.key), ...(catalog ? {} : { body }) });
      const headers: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) headers[name] = value;
      });
      response.writeHead(upstream.status, headers);
      if (!upstream.body) {
        response.end();
        return;
      }
      // An upstream that breaks mid-answer must end this answer and nothing else (pipeline() carries the error to every
      // stream, and `response.destroy()` lets the caller see a reset and retry).
      if (!catalog && (upstream.headers.get("content-type") ?? "").includes("text/event-stream")) {
        pipeline(Readable.fromWeb(upstream.body as never), new ResponsesStreamTap(meter, model), response, (error) => {
          if (error) response.destroy();
        });
      } else {
        const text = await upstream.text();
        if (picture) {
          if (upstream.ok) billed += picturesIn(text);
        } else if (!catalog && upstream.ok) meter.addJson(model, text);
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

if (process.argv[1]?.endsWith("muse-relay.mjs") || process.argv[1]?.endsWith("muse-relay.ts")) {
  const models = (process.env.MUSE_MODELS ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  // A failure inside one request must never end the relay, which every agent of the build depends on.
  process.on("uncaughtException", (error) => console.error("relay: uncaught", error.message));
  process.on("unhandledRejection", (error) => console.error("relay: unhandled", error instanceof Error ? error.message : String(error)));
  const imageModel = process.env.MUSE_IMAGE_MODEL?.trim() || undefined;
  const imageSizes = (process.env.MUSE_IMAGE_SIZES ?? "").split(",").map((size) => size.trim()).filter(Boolean);
  const maxImages = Number(process.env.MUSE_IMAGE_MAX);
  const classifierModel = process.env.MUSE_IMAGE_CLASSIFIER?.trim() || undefined;
  const { server } = createRelay({
    key: process.env.META_API_KEY ?? "",
    models,
    ...(imageModel ? { imageModel } : {}),
    ...(imageSizes.length > 0 ? { imageSizes } : {}),
    ...(Number.isInteger(maxImages) && maxImages > 0 ? { maxImages } : {}),
    ...(classifierModel ? { classifierModel } : {}),
  });
  server.listen(Number(process.env.PORT ?? "8080"), "0.0.0.0", () => console.log(`muse relay (${models.join(", ")})`));
}
