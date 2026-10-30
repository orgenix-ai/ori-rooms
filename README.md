# Ori rooms

Ori is an AI app builder we're developing at Orgenix: a team of AI agents takes an app idea through Direction, Design Studio, a plan, a prototype, architecture, build and QA, all the way to a live app. This repo publishes the code of Ori's rooms that drives Meta's Muse models, as Ori runs it. You can run it against Ori with a judge key.

What stays private is what makes the rooms work well: every prompt, every scoring and quality rule, and how the rooms hand work to each other. The code calls those through one seam (`src/seam/ori-seam.ts`). In Ori the seam reads them directly; here it is an HTTP client to Ori, and any model call that needs a prompt runs on Ori's server, so only the answer comes back.

## New during the Meta hackathon, and what was already there

**New this week:**
- **The seam** (`src/seam/ori-seam.ts`): `complete(key, vars)`, `policy(key, input)`, `next(projectId)`.
- **Ori's side of the seam for judges:** `/api/seam/*` with judge keys that are hashed, scoped, rate-limited, spend-capped and expiring (private repo).
- **The HTTP client** (`src/seam/http.ts`).
- **Pulling the prompts out:** Studio's and Direction's prompts and the picture guard's rules were moved out of the room code, so the room code can be published without them.
- **The public stand-ins:** the picture guard (`src/build/picture-guard.ts`) asks Ori for a verdict; operator notes go to the console.
- **The mirror:** an allowlist with guards that refuse any private prompt text or secret (private repo).
- **This CLI** (`src/cli.ts`).

**Ori's existing code, published as Ori runs it** (written before the event):
- the Muse route and prices (`src/muse/`);
- the Muse relay with its Muse Image call (`src/build/muse-relay.ts`, merged before kickoff as part of Ori's Muse groundwork);
- the Responses relay it builds on;
- the Muse Code driver of Ori's builds (`src/build/muse-agent.ts`, `src/build/usage.ts`, part of the Muse Code runtime merged before kickoff): each build lane as a `muse exec` session, its events mapped to Ori's, its tokens counted per model. The build orchestrator that drives the lanes, and its briefs, stay private;
- Studio's look checks, look math and design tokens (`src/studio/`);
- Direction's reply protocol (`src/direction/`).

## Where each Muse capability is used

| Muse capability | Where | What it does in Ori |
| --- | --- | --- |
| **muse-wonder-1.0**, chat on the Meta Model API (Responses API) | `src/muse/routes.ts` (the `meta` route), `src/cli.ts` → `complete("direction.opening")`, `complete("studio.looks")`, `complete("studio.looksRepair")` | Ori's Design Master in Direction and Studio; Ori's build agents |
| **muse-spark-1.3** | `src/muse/routes.ts`; Ori's picture guard classifier (via `policy("picture-guard")`) | The small model that reads every picture prompt before Muse Image sees it |
| **muse-image-1.0**, `POST /v1/images/generations` | `src/build/muse-relay.ts`: `imageRefusal` (one picture, allowed sizes, base64), `withSafetySuffix`, the per-build cap, per-picture metering in `createRelay` | Photos in the apps Ori builds; logos and icons stay SVG |
| **Muse Code** (the coding agent) | `src/build/muse-agent.ts` runs each build lane as `muse exec --json` on its own session, pointed at the relay, and maps the Muse Session Protocol's events to Ori's; `src/build/muse-relay.ts` is the only door a Muse Code build has to Meta: it holds the key, allows only the build's models, and meters tokens per model | Ori's builds run Muse Code in a sandbox; this relay is how they reach Muse |
| **Prices** | `src/muse/model-pricing.ts` (`muse-wonder-1.0`, `muse-spark-1.3`) | Every Muse call is priced from its token usage |

Studio's checks on what Muse drew run locally in this repo: `readDrawnLooks` in `src/studio/server/design-studio-looks.ts`, accent contrast, looks that differ enough, and fonts from the allowed list.

## Run it

Needs Node 22 or later.

1. Sign up at https://alpha.orgenix.ai with any email.
2. Create a key at https://alpha.orgenix.ai/judge/keys with the invite code from your judging invite. The key is shown once; keep it private.
3. Install and run:

```bash
npm install
ORI_JUDGE_KEY=ori_judge_… npm start
```

Give your own idea with `npm start -- "a booking app for my bike repair shop"`.

The run does three things:
1. Ori's Design Master opens Direction for the idea.
2. Studio draws three looks, and Ori's look checks run on them here. If the checks send them back, Ori's repair turn redraws them, as in the product.
3. Ori's picture guard judges two Muse Image prompts: one it allows, one it refuses.

At the end it prints the run's Muse cost. Each key has a spend cap and expires after judging.

`npm run typecheck` checks the code.

## See a whole app's journey

The Muse Code connector (start an app in Ori from Muse Code): https://github.com/orgenix-ai/ori-for-muse

## Licence

Source-available under the PolyForm Noncommercial License 1.0.0 (`LICENSE`). The judge-key terms on the key page apply to calls to Ori.
