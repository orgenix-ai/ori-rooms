# How Ori uses Muse

This page goes into the technical detail behind the [README's overview](../README.md#how-ori-uses-muse). It covers each Muse model Ori calls, where, what the call does, what the request looks like, and how the answers are checked.


## Where the model calls happen

Ori's agents ask for a **strength** (light, medium, strong), not a model name. A project set to Meta resolves them to Muse models, and every Muse call is made by Ori's server, never by the browser or by this repo.

```
your terminal / Muse Code ──► Ori's server ──► Meta Model API (https://api.meta.ai/v1)
        judge key             prompt, rules,        muse-wonder-1.0 · muse-spark-1.3 · muse-image-1.0
                              checks, metering
```

The code you can read here is the left-hand side of that picture:

| What | Where |
| --- | --- |
| The interface to Ori's server: `complete` (run a prompt, get only the answer), `policy` (ask a rule for a verdict), `next` (what runs next) | [`src/seam/ori-seam.ts` L7–L30](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/seam/ori-seam.ts#L7-L30) |
| The HTTP client for that interface. Each call carries your judge key as a bearer token; `complete` posts to `/api/seam/complete`, `policy` to `/api/seam/policy` | [`src/seam/http.ts` L25–L44](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/seam/http.ts#L25-L44) |
| The command-line run (`npm start`): Direction, three Studio looks, the repair turn, the picture guard, the cost | [`src/cli.ts` L52–L105](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L52-L105) |
| The Muse Code connector's tool that hands an idea to Ori | [`connector/src/server.ts`](https://github.com/orgenix-ai/ori-rooms/blob/e835783/connector/src/server.ts) |

The prompt is assembled and sent on Ori's server. `complete` returns the answer, the model name, token counts and the cost, and never the prompt. See [`ori-seam.ts` L17–L25](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/seam/ori-seam.ts#L17-L25).

## The request

- **Endpoint.** `https://api.meta.ai/v1`, the Meta Model API.
- **Adapter.** Ori calls Muse through Meta's Model API (https://api.meta.ai/v1), with Muse's reasoning effort set per step. Excerpts from the code are in the last section.
- **Background mode for hosted steps.** A long step doesn't hold a connection open. Ori starts it as a background response, gets a handle back at once, and polls it. A page never waits on a long Muse answer, and a step that stops making progress is caught by Ori's stall watch and reported instead of hanging.
- **`prompt_cache_key`.** Every Build Spec step starts with the same large prefix (contracts and the published plan) and then adds its own instructions. Muse caches prefixes, but only on the backend that served them, so Ori can send a `prompt_cache_key` per project to route a project's steps together. The key changes where a request is served, not what it says: the prompt is the same with or without it. Ori applies it per project, as an opt-in. [Results](ORI-ON-MUSE-RESULTS.md) has the measured cache rates.
- **Token room.** Muse reasons before it answers, inside the output-token budget, so steps that return structured answers get room for both. Too small a budget cuts the JSON short.

## Each model

### muse-wonder-1.0 (medium and strong)

Ori's main model. It runs every agent that has to think or write: the Design Master in Direction and Design Studio, the Business Analyst and Critic in the product plan, the Architect's Build Specification, the quality agents, the release agent and the project manager. The full table is in the [README](../README.md#room-by-room).

- **In this repo.** `npm start` runs two of these: Direction's opening (`direction.opening`, [`cli.ts` L58](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L58)) and the three Studio looks (`studio.looks`, [`cli.ts` L71](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L71)). Both are `complete` calls; the prompts stay on Ori's server.
- **In the platform.** The Architect writes the Build Specification as a series of steps, each its own call: stack, integrations, then each journey's flow, data, screens and behavior. These calls run as background responses and use the cache key above.
- **How results are checked.** A Studio look has to pass Ori's look checks (`policy("studio-looks")`, [`cli.ts` L75](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L75)): palette, type, layout and heading-weight rules. If any look fails, the **repair turn** sends the failures back to the Master once to redraw ([`cli.ts` L76–L85](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L76-L85)), and the result is checked again. A "Repair turn" line in your output means exactly this, and it is normal. Other rooms validate structured answers the same way; an answer that fails its checks is retried or reported, never accepted.

### muse-spark-1.3 (light)

The small, fast model.

- **Picture guard.** Every picture prompt goes through the guard before Muse Image sees it. The guard has two layers: fixed rules for what is never drawn, then a muse-spark-1.3 classifier that reads the prompt as untrusted data and answers allow or refuse. It fails closed: if the classifier can't answer, the picture is refused. In this repo, [`cli.ts` L96–L101](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L96-L101) sends two sample prompts through `policy("picture-guard")`; one is allowed and one (a real person's likeness) is refused. The rules and the classifier prompt aren't quoted here.
- **Design triage** in Studio: a quick first read of a design request.
- **Helper** in the build: Muse Code's background model beside each build agent. It runs in the build sandbox.

### muse-image-1.0 (pictures)

- **Studio.** The Design Master marks where a photo belongs and describes it; each description goes through the guard, and allowed ones are drawn at 1536×1024 with no text, logos or recognizable real people. A session draws at most 12.
- **Build.** The illustrator asks a relay on the host for each picture, one call each. The relay applies the same guard, caps a build at 24 pictures, and saves each with a record of its prompt. The sandbox never holds Orgenix's Meta key.
- **In this repo.** Only the guard's verdicts (above). Image generation itself runs on Ori's server.

### Muse Code

Muse Code appears twice.

- **As a tool that hands work to Ori.** The connector in [`connector/`](https://github.com/orgenix-ai/ori-rooms/tree/e835783/connector) is an MCP server. Muse Code calls its `start_app_with_ori` tool; Ori keeps the idea behind a one-time link, valid for 30 minutes, and the judge opens it. Nothing is built or charged until they continue in Ori. See [`connector/src/server.ts`](https://github.com/orgenix-ai/ori-rooms/blob/e835783/connector/src/server.ts).
- **As Ori's build engine.** The build runs Muse Code inside an isolated sandbox, one session per role (lead, art directors and picker, screen designers, builder, illustrator, finisher and critic, QA, fixer), on muse-wonder-1.0 with muse-spark-1.3 as the helper. This runs in the platform's build sandbox. The sandbox reaches Muse only through the host relay, which holds the key, forwards only the build model, the helper model and Muse Image, and meters every call.

## How results are checked, and what stops a run

| Check | What it does | Where |
| --- | --- | --- |
| Picture guard | Fixed rules plus a muse-spark-1.3 classifier; fails closed | Rules run on Ori's server; verdicts visible in [`cli.ts` L96–L101](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L96-L101) |
| Look checks and repair turn | Rejects a look that breaks Ori's design rules; redraws once with what was found | [`cli.ts` L75–L94](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/cli.ts#L75-L94) |
| QA | Quality agents set the standards before the build and test the finished app in a browser against the plan; a fixer repairs what fails | Ori's server and the build sandbox |
| Cost metering | Every call is priced from its token usage (muse-wonder-1.0 $4 in / $20 out per million tokens; muse-spark-1.3 $1.25 / $4.25; each Muse Image picture $0.01) and recorded against its project and step | `Completion.costUsd` in [`ori-seam.ts` L17–L18](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/seam/ori-seam.ts#L17-L18) |
| Judge spend caps | Judge keys are hashed, scoped, rate-limited, spend-capped and expiring; a key stops working when it hits its cap or when judging ends | Server-side; the client in [`http.ts` L28–L37](https://github.com/orgenix-ai/ori-rooms/blob/e835783/src/seam/http.ts#L28-L37) surfaces the refusal |
| Stall watch | A step that runs past twice its usual time for that model is stopped and reported. A step is never moved to another provider's model | Ori's server |

For measured numbers from real builds, see [ORI-ON-MUSE-RESULTS.md](ORI-ON-MUSE-RESULTS.md).

## Excerpts from Ori's platform code

Paths are in Orgenix's `platform` repo at commit `e17e07f7b` (2026-11-04). Line numbers are for that commit.

### 1. The Muse adapter

`agents/src/rooms/muse/routes.ts` L28–L38 lists Meta's Model API as a route: the base URL, a `muse-` model prefix, and the two text models.

```ts
{
  id: "meta",
  label: "Meta Model API",
  modelPrefix: "muse-",
  baseUrl: "https://api.meta.ai/v1",
  models: [
    { id: "muse-wonder-1.0", displayName: "Muse Wonder 1.0 (Meta)" },
    { id: "muse-spark-1.3", displayName: "Muse Spark 1.3 (Meta)" },
  ],
},
```

`agents/src/providers/meta.ts` L15–L33 turns that route into Ori's Muse provider: the models a project can pick, each with the reasoning effort Muse takes (low, medium or high), and the address of Meta's model catalog.

```ts
export function metaProviderModels(): ProviderModel[] {
  return metaRoute().models.map((model) => ({
    id: model.id,
    displayName: model.displayName,
    parameters: [{ id: "reasoning", values: [{ value: "low" }, { value: "medium" }, { value: "high" }] }],
  }));
}

/** The URL of Meta's model catalog, outside `/v1` whatever the base URL. */
export function metaCatalogUrl(): string {
  return `${new URL(metaRoute().baseUrl).origin}/muse-code/models`;
}
```

The request every hosted Muse step sends lives in the platform's agent provider code (`agents/src/providers/`, L530–L555 at the commit below). It is a **background** call to Meta's Model API with the Muse model id, the step's reasoning effort, an optional JSON-schema output format, and the optional cache key. Ori then polls the run by its id until it completes. (Abridged: tool definitions and metadata fields are omitted.)

```ts
const response = await muse.create({
  model: input.model.id,            // "muse-wonder-1.0" or "muse-spark-1.3"
  input: input.prompt,
  ...(input.system ? { instructions: input.system } : {}),
  background: true,
  store: true,
  ...(effort ? { reasoning: { effort } } : {}),
  ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
  ...(input.jsonSchema ? { text: { format: { type: "json_schema", name: input.jsonSchema.name,
      schema: input.jsonSchema.schema } } } : {}),
  ...(input.promptCacheKey ? { prompt_cache_key: input.promptCacheKey } : {}),
});
```

### 2. Architecture's Build Spec steps

`apps/web/src/lib/server/agent-runs.ts` L2869–L2881 launches one step of a pipeline. For a project opted into Architecture's cache key, the Build Spec steps carry `promptCacheKey`; the provider's `startRun` (above) sends it as `prompt_cache_key`.

```ts
// A project opted into Architecture's cache key routes its Build Spec steps together (architecture-prompt-cache.ts).
const promptCacheKey = await promptCacheKeyForStep({ pipeline: input.pipeline.id, projectId: input.project.id });
let result;
try {
  const launch = input.provider.startRun({
    auth: input.auth,
    model,
    prompt,
    ...(promptCacheKey ? { promptCacheKey } : {}),
    ...(input.step.system ? { system: input.step.system } : {}),
    ...(input.step.jsonSchema ? { jsonSchema: input.step.jsonSchema } : {}),
    timeoutMinutes: input.step.timeoutMinutes,
    name: `${input.pipeline.id}:${input.step.stepKey}`,
```

`apps/web/src/lib/server/architecture-prompt-cache.ts` L28–L30: the key is one per project, so all of a project's Build Spec steps route together.

```ts
export function architecturePromptCacheKey(projectId: string): string {
  return `orgenix-build-spec-${projectId}`;
}
```

The model for each step comes from the project's provider and the step's strength (light, medium, strong); on Meta that resolves to muse-spark-1.3 or muse-wonder-1.0.

### 3. The picture guard

`sandbox/host/picture-guard.ts` L152–L162 is the guard's one entry point, used by Studio, by the build relay and by the `picture-guard` policy this repo's CLI calls. Two layers, and it fails closed. The word lists (`deterministicVerdict`) and the classifier's instructions are not quoted here.

```ts
export async function judgePicturePrompt(prompt, classifier) {
  const listed = deterministicVerdict(prompt);
  if (!listed.allowed) return { verdict: listed, source: "guard" };
  if (!classifier) return { verdict: { allowed: false, category: "classifier_unavailable" }, source: "classifier" };
  const text = await classifier.call(classifierRequest(prompt, classifier.model));
  if (text === null) return { verdict: { allowed: false, category: "classifier_unavailable" }, source: "classifier" };
  return { verdict: parseClassifier(answerText(text)), source: "classifier" };
}
```

L112–L114 is the classifier request (a small model, a short answer, no tools, temperature 0, and the prompt wrapped as data):

```ts
return { model, input: classifierInput(prompt), max_output_tokens: CLASSIFIER_MAX_OUTPUT_TOKENS, temperature: 0 };
```

L128–L142 (`parseClassifier`): anything that is not a clear JSON verdict is a refusal.

### 4. Muse Image

`apps/web/src/lib/server/studio-pictures.ts` L248–L267 is Studio's picture call: the guard first, then Meta's image endpoint.

```ts
async allowed(prompt) {
  return (await judgePicturePrompt(prompt, classifier)).verdict.allowed;
},
async draw(prompt) {
  // … the route for muse-image-1.0 and its base URL are looked up here …
  const response = await fetch(`${baseURL}/images/generations`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MUSE_IMAGE_MODEL, prompt, n: 1, size: STUDIO_PICTURE_SIZE, response_format: "b64_json" }),
  });
  const b64 = ((await response.json()) as { data?: Array<{ b64_json?: unknown }> }).data?.[0]?.b64_json;
  // Meta bills a picture it generated, not a refused or failed one.
  await recordPlatformPictureUsage({ projectId: input.projectId, refId: input.sessionId, model: MUSE_IMAGE_MODEL });
```

`sandbox/host/build-models.ts` L134–L135 names the picture model and its price: `MUSE_IMAGE_MODEL = "muse-image-1.0"` and `MUSE_IMAGE_USD_PER_PICTURE = 0.01`.

### 5. The Muse relay

`sandbox/host/muse-relay.ts` is the only door from the build sandbox to Meta. The sandbox never holds Orgenix's key.

L100–L108 passes on only what the call needs and sets the real key as the bearer token, never the caller's:

```ts
for (const name of ["content-type", "accept", "user-agent", "x-client-id"]) { ... }
kept.authorization = `Bearer ${key}`;
```

L58–L77 (`imageRefusal`) refuses any picture request that doesn't name this build's picture model, asks for more than one picture, has a bad size or prompt, or wants a link instead of base64.

L204–L224 is the picture path. Every refusal says the same words to the caller, the reason is logged, the build has a picture cap, and the relay forces one picture and adds the safety suffix whatever the caller wrote:

```ts
const judged = await judgePicturePrompt(prompt, classifier);
if (!judged.verdict.allowed) {
  refusals.push({ at: new Date().toISOString(), source: judged.source, category: judged.verdict.category, ... });
  response.writeHead(403, ...).end(REFUSAL_MESSAGE);
  return;
}
if (asked >= maxImages) { response.writeHead(429, ...); return; }
asked += 1;
body = Buffer.from(JSON.stringify({ ...sent, n: 1, prompt: withSafetySuffix(String(sent.prompt)) }));
```

Token usage is counted from Meta's own responses and priced from the table in `sandbox/host/build-models.ts` L121–L124 (`muse-wonder-1.0` $4 in / $20 out and `muse-spark-1.3` $1.25 / $4.25 per million tokens; cached input at $0.20 and $0.15).

### 6. The build agents in the sandbox

`sandbox/runner/src/muse-agent.ts` L174–L191 starts one Muse Code lane per role as a headless `muse exec` process, with the model it should use and pointed at the relay instead of Meta:

```ts
return [
  "exec", "--yolo", "--disable-web-tools", "--disable-reminders", "--no-foreign-personal-context",
  "--base-url", `${settings.relay}/v1`,
  "--model", settings.model,
  "--session-id", session,
  "--json",
  "--prompt-file", promptFile,
];
```

`muse exec --json` writes the Muse Session Protocol's events as JSON lines, which the runner maps to its own messages; a later message to a lane is another `muse exec` on the same session id. Muse Code's helper model (muse-spark-1.3) runs beside the build model; the relay allows it and the runner prices both.
