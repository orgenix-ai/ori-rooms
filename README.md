# Ori on Meta's Muse

Ori is an AI software team you talk to. You describe an app; Ori's agents take it through Direction, Design Studio, a product plan with a clickable prototype, architecture, build and QA, to a live app at its own address. You make the real choices, and Ori writes down every call it makes.

Every one of those agents runs on Meta's Muse models. This page explains how.

## Try it

1. **Open your invite link**: https://alpha.orgenix.ai/invited
2. **Create an account** with any email and a password, then open the confirmation link Ori emails you.
3. **Enter your invite code** when Ori asks for it. (Five wrong tries lock the code step for an hour.)
4. **Choose Start an app** on the "You're in" page and describe your idea in a sentence or two, for example "a booking app for my bike repair shop". (The page's second card, **Use Ori from Muse Code**, is where you get the key for the connector below.)
5. Ori's team takes it from there: answer its questions in Direction, pick a look in Design Studio, approve the plan and click through the prototype, then let the team build it.

A judge account holds up to three apps. Builds run on Orgenix's Muse account, so you don't need a key or a card.

## Use Ori from Muse Code (the connector)

[`connector/`](connector/) is Ori for Muse, an MCP server that lets **Muse Code**, Meta's coding agent, hand an app idea to Ori. You run it on your own machine; it talks to Ori on alpha with your judge key.

1. **Get a judge key.** Muse Code needs one to reach Ori. On alpha, after entering your invite code (steps 1–3 of *Try it*), the "You're in" page shows a **Use Ori from Muse Code** card: choose **Get a key** there, tick "I accept these terms", choose **Create key** and copy it. It starts with `ori_judge_` and is shown only once. You can hold up to three live keys; all keys stop working on November 10, 2026.
2. **Run the connector** (Node 22 or later):

   ```bash
   git clone https://github.com/orgenix-ai/ori-rooms.git
   cd ori-rooms/connector
   npm install
   ORI_BASE_URL=https://alpha.orgenix.ai ORI_CONNECTOR_TOKEN=ori_judge_… npm run dev
   ```

   It listens at `http://localhost:8787/mcp`.
3. **Add it to Muse Code.** In `~/.config/muse/settings.json`:

   ```json
   {
     "mcpServers": {
       "ori": { "url": "http://localhost:8787/mcp" }
     }
   }
   ```

4. **Ask Muse Code for an app**, for example: *"Use Ori to build a booking app for my bike repair shop."* Muse Code calls Ori's `start_app_with_ori` tool. Ori keeps the idea for 30 minutes behind a one-time link and gives Muse Code that link. (If Muse Code asks you questions instead, say "call start_app_with_ori with this idea".)
5. **Open the link** (click it yourself; Muse Code can't open it for you). Ori opens on alpha with your idea already in the conversation. Sign in with your judge account, and Ori's team takes it from there, on Muse, exactly as in *Try it*.

Nothing is built and nothing is charged until you continue in Ori. The idea never goes into a URL, and a link works once. Each machine can hand Ori 30 ideas a day.

## Licence

Source-available under the PolyForm Noncommercial License 1.0.0 (`LICENSE`), except `connector/`, which is MIT licensed (`connector/LICENSE`).

## How Ori uses Muse

More detail: [How Ori uses Muse, with code](docs/MUSE-INTEGRATION.md) and [Ori on Muse: what we measured](docs/ORI-ON-MUSE-RESULTS.md).

### One model choice per project

Each project picks an AI provider; for judges, and for every new project, the default is **Meta (Muse)**. Ori's agents ask for a strength, not a model: light, medium or strong. On Meta those map to:

| Strength | Muse model |
| --- | --- |
| Light | muse-spark-1.3 |
| Medium | muse-wonder-1.0 |
| Strong | muse-wonder-1.0 |
| Pictures | muse-image-1.0 |

If a step's model isn't available, the step is refused and reported, never quietly swapped for another provider's model. A project set to Meta runs on Muse from start to finish.

### Room by room

| Room | Agent | Muse model | What it does on Muse |
| --- | --- | --- | --- |
| **Direction** | Design Master | muse-wonder-1.0 | Asks one question at a time about who the app is for and what it must do, then writes the Direction brief. |
| **Design Studio** | Design Master | muse-wonder-1.0 | Designs three looks for this app as live sample pages, takes your pushback, and publishes the chosen design profile. |
| | Illustrator | muse-image-1.0 | Draws the real photos inside the sample pages. |
| | Picture guard | muse-spark-1.3 | Checks every picture prompt before Muse Image sees it (below). |
| | Design triage | muse-spark-1.3 | The Studio's light step: a quick first read of a design request. |
| **Product plan** | Business Analyst | muse-wonder-1.0 | Analyzes the brief, drafts who uses the app and their journeys, and answers your questions about the plan. |
| | Critic | muse-wonder-1.0 | Reviews the analyst's draft and sends back what doesn't hold up. |
| | Prototype | muse-wonder-1.0 | Builds the clickable prototype you try before anything is built. |
| **Architecture** | Architect | muse-wonder-1.0 | Writes the Build Specification (stack, integrations, and each journey's flow, data, screens and behaviour), explains it in plain language, and answers questions while moving the map. |
| **Build** | Muse Code team | muse-wonder-1.0 | Builds the app in an isolated sandbox (below). |
| | Helper | muse-spark-1.3 | Muse Code's background model beside each build agent. |
| | Illustrator | muse-image-1.0 | Draws the photos inside the built app. |
| **QA** | Quality agents | muse-wonder-1.0 | Set the quality standards before the build, write what each piece must pass, and test the finished app against the plan. |
| **Release** | Release agent | muse-wonder-1.0 | Leads go-live, suggests domain names, and writes the setup guide for the app's connected services. |
| **Delivery** | Project manager | muse-wonder-1.0 | Picks the next work and watches for stalled steps. |

### The build: a Muse Code team in a sandbox

The build runs **Muse Code** inside an isolated sandbox, one session per role, all on muse-wonder-1.0 with muse-spark-1.3 as Muse Code's helper model:

- a **lead** lays the foundation;
- **three art directors** each propose a look, and a **picker** chooses one;
- **six screen designers** draw the app's screens in parallel;
- a **builder** wires up the features;
- an **illustrator** draws the photos with Muse Image;
- a **finisher** pulls it together and a **critic** reviews it;
- **QA** verifies the app in a browser, and a **fixer** repairs what QA finds.

Muse Code inside the sandbox never holds Orgenix's Meta key. It talks to a relay on the host, which holds the key and passes on only three things: the build model, the helper model and Muse Image. Every call is metered through that relay, and the build stops when it reaches its spending or time limit.

### Pictures with Muse Image, behind a guard

Pictures appear in two places: the Studio's sample pages and the built app.

- **In Studio**, the Design Master marks where a photo belongs and describes it. Each description goes through the picture guard. If allowed, Muse Image draws it at 1536×1024 with no text, no logos and no recognizable real people, and Ori stores it with the design. A session draws at most 12 pictures.
- **In a build**, the illustrator asks the relay for each picture, one per call. The relay applies the same guard, caps a build at 24 pictures, and saves each as a 1600×1200 photo with a record of its prompt.

**The picture guard** has two layers, and a prompt must pass both:

1. fixed rules for what never gets drawn (public figures, brands and logos, text in pictures, sexual content, violence, crime, real people described by role);
2. a **muse-spark-1.3** classifier that reads the prompt as untrusted data and answers allow or refuse.

It fails closed: if the classifier can't answer, the picture is refused. A refused picture becomes a placeholder in Studio, and in a build the agent is told to describe a simpler scene. A build that keeps getting refused is stopped.

### Calls, cost and limits

- Ori calls Muse through the **Meta Model API** at `https://api.meta.ai/v1`. Long steps run as background responses that Ori polls, so a long Muse answer never hangs a page.
- Muse reasons before it answers, so steps that return structured answers get room for both. The Business Analyst's answers, for example, get 4,000 output tokens.
- **Every call is priced from its token usage** at Muse's rates (per million tokens: muse-wonder-1.0 $4 in and $20 out; muse-spark-1.3 $1.25 in and $4.25 out), and each Muse Image picture at $0.01. Each cost is recorded against its project and the step that made it.
- A step that stalls is stopped at twice the usual time for that model and step, and reported. A step is never moved to another provider's model.
