# Ori rooms

Ori is an AI app builder we're developing at Orgenix: a team of AI agents takes an app idea through Direction, Design Studio, a plan, a prototype, architecture, build and QA, all the way to a live app. This repo holds the work developed during the Meta hackathon building Ori's rooms on Meta's Muse models. It can be run with a judge key.

## Built during the event (this repo, and Ori's side of it)

- **The seam** (`src/seam/ori-seam.ts`): `complete(key, vars)` runs one of Ori's prompts on Muse and returns only the answer and its cost; `policy(key, input)` returns one of Ori's verdicts; `next(projectId)` says which room and step run next.
- **The HTTP client** (`src/seam/http.ts`): the seam over Ori's `/api/seam/*`, authenticated with a judge key.
- **This CLI** (`src/cli.ts`): one app idea through Direction and Studio, then the picture guard.
- **Ori's side, in the private product:** `/api/seam/*`, with judge keys that are hashed, scoped, rate-limited, spend-capped and expiring; Studio's look checks and the picture guard as seam policies; the prompts pulled out of the room code behind the seam; and the mirror that publishes this repo with guards against any private prompt text or secret.

## Where each Muse model is used

Ori's agents in each room run on Muse models: the heavier steps on muse-wonder-1.0, the light ones on muse-spark-1.3, and pictures on muse-image-1.0.

| Room | Muse model | What it does |
| --- | --- | --- |
| **Direction** | muse-wonder-1.0 | The Design Master's chat and the Direction brief |
| **Design Studio** | muse-wonder-1.0 | The Studio session, three looks for the app, plan changes at the end of Studio, and the published design profile and sample pages |
| | muse-image-1.0 | Real photos in the sample pages |
| | muse-spark-1.3 | The picture guard: reads every picture prompt before Muse Image sees it |
| **Product plan** | muse-wonder-1.0 | The Business Analyst's analysis and draft, the Critic's pass, answers to your questions, plan changes from a discussion, and the clickable prototype |
| **Architecture** | muse-wonder-1.0 | The room's guide, the Build Specification (stack, integrations, each journey), the check of the plan against Direction and Studio, and the delivery backlog |
| **Build** | muse-wonder-1.0 | Muse Code in Ori's sandbox: the lead's plan and briefs, a builder per work unit, an independent review and verification, and defect fixes |
| | muse-spark-1.3 | The helper model Muse Code runs beside each build |
| | muse-image-1.0 | Real photos in the built app |
| **QA** | muse-wonder-1.0 | Quality standards before the build, QA expectations for each work unit, and independent QA of each change |
| **Release** | muse-wonder-1.0 | The release agent's chat, domain name ideas, and the setup guide for the app's connected services |

Each call's Muse cost comes back with it, priced from its token usage.

## Run it

Needs Node 22 or later and git.

1. **Open your invite link** at https://alpha.orgenix.ai/invited. Create an account with any email and a password, and open the confirmation link Ori emails you.
2. **Enter your invite code** when Ori asks for it, then choose **Get a key**. Tick "I accept these terms", choose **Create key** and copy the key (it starts with `ori_judge_`). It is shown only once.
3. **Install and run:**

```bash
git clone https://github.com/orgenix-ai/ori-rooms.git
cd ori-rooms
npm install
ORI_JUDGE_KEY=ori_judge_… npm start
```

Give your own idea with `npm start -- "a booking app for my bike repair shop"`.

The run does three things:
1. Ori's Design Master opens Direction for the idea.
2. Studio draws three looks, and Ori checks them on its server (`policy("studio-looks")`). Looks the checks send back get Ori's repair turn, as in the product.
3. Ori's picture guard judges two Muse Image prompts: one it allows, one it refuses.

At the end it prints the run's Muse cost. Each judge has $20 of model use across their keys, and keys expire when judging ends.

`npm run typecheck` checks the code.

### If something goes wrong

- `Set ORI_JUDGE_KEY to your judge key`: the key is missing from the command.
- `This key is not known`: the key was mistyped or revoked. Create a new one on the key page.
- Ori asks you to log in again: open the confirmation link in your email first, then log in.

## Build a whole app in Ori

Your invite code also unlocks Ori's whole build on alpha. After entering it, choose **Start an app** and describe your idea. Ori's team takes it through Direction, Design Studio, a plan, the build and QA to a live app, on Muse models.

## Start an app from Muse Code

The Muse Code connector hands an idea from Muse Code to Ori: https://github.com/orgenix-ai/ori-for-muse

## Licence

Source-available under the PolyForm Noncommercial License 1.0.0 (`LICENSE`). The judge-key terms on the key page apply to calls to Ori.
