# Ori rooms

Ori is an AI app builder we're developing at Orgenix: a team of AI agents takes an app idea through Direction, Design Studio, a plan, a prototype, architecture, build and QA, all the way to a live app. During the Meta hackathon we built a seam that lets code outside Ori drive Ori's rooms on Meta's Muse models. This repo holds that work, and only that work. You can run it against Ori with a judge key.

Ori's existing rooms are in the private product and are called through the seam: the Muse route and prices, the Muse relay with its Muse Image call, Studio's look checks, Direction's reply protocol and the Muse Code driver.

## Built during the event (this repo, and Ori's side of it)

- **The seam** (`src/seam/ori-seam.ts`): `complete(key, vars)` runs one of Ori's prompts on Muse and returns only the answer and its cost; `policy(key, input)` returns one of Ori's verdicts; `next(projectId)` says which room and step run next.
- **The HTTP client** (`src/seam/http.ts`): the seam over Ori's `/api/seam/*`, authenticated with a judge key.
- **This CLI** (`src/cli.ts`): one app idea through Direction and Studio, then the picture guard.
- **Ori's side, in the private product:** `/api/seam/*`, with judge keys that are hashed, scoped, rate-limited, spend-capped and expiring; Studio's look checks and the picture guard as seam policies; the prompts pulled out of the room code behind the seam; and the mirror that publishes this repo with guards against any private prompt text or secret.

## Where each Muse model is used

| Muse model | Called by | What it does in Ori |
| --- | --- | --- |
| **muse-wonder-1.0** | `complete("direction.opening")`, `complete("studio.looks")`, `complete("studio.looksRepair")` | Ori's Design Master in Direction and Studio |
| **muse-spark-1.3** | `policy("picture-guard")` | Reads every picture prompt before Muse Image sees it |

Each call's Muse cost comes back with it, priced from its token usage.

## Run it

Needs Node 22 or later and git.

1. **Create an Ori account.** Go to https://alpha.orgenix.ai/login?mode=signup, sign up with any email and a password, open the confirmation link Ori emails you, then log in.
2. **Get a judge key.** Go to https://alpha.orgenix.ai/judge/keys. Enter the invite code from your judging invite, tick "I accept these terms" and choose **Create a key**. Copy the key (it starts with `ori_judge_`). It is shown only once.
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
- The key page asks you to log in again: confirm your email first, then log in.

## Build a whole app in Ori

The same invite code unlocks Ori's whole build on alpha. At https://alpha.orgenix.ai, start an app from your idea. Ori's team takes it through Direction, Design Studio, a plan, the build and QA to a live app, on Muse models.

## Start an app from Muse Code

The Muse Code connector hands an idea from Muse Code to Ori: https://github.com/orgenix-ai/ori-for-muse

## Licence

Source-available under the PolyForm Noncommercial License 1.0.0 (`LICENSE`). The judge-key terms on the key page apply to calls to Ori.
