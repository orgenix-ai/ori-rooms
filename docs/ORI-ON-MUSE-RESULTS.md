# Ori on Muse: what we measured

**Ori** is an AI team that takes an app idea through Direction, Design Studio, a product plan, Architecture, the build, QA and Go-Live to a live app, running on Meta's Muse models. This document is what we measured while Ori built real apps on Muse, and what we learned from it.

The four apps are small, one-journey apps that Ori's agents built end to end on alpha and staging in November 2026:

- **Water Log** logs each glass of water against a daily goal and shows the last 7 days. Live: https://stg-water-log-debd25.orgenix.app
- **Habit Tick** keeps a personal habit list, lets you tick off today, and shows the last seven days as dots. Live: https://stg-habit-tick-c2385b.orgenix.app
- **Step Count** lets you log today's steps; today shows progress against a daily goal, and the last 7 days show as small bars. The log is saved. Not live yet when this was measured, so it has no link.
- **tic-tac-toe** lets you sign up and play tic-tac-toe against the computer; it keeps a score of wins, draws and losses. It has no hosted app, so no link.

How to read the first table: each column is one app, each row is one measurement. Times are wall-clock minutes, cost is what Ori recorded on Muse calls, and "so far" means the run was still going when we measured.

Measured on Orgenix's staging database, read-only, on 2026-11-04 (UTC). Every project below ran with Muse
(`muse-wonder-1.0`) for every step. Dates and times are UTC; the apps ran on 2026-11-03 and 2026-11-04.

Sources: `node scripts/time-breakdown.mjs <repo>` (wall time per phase), and read-only queries of `agent_run_steps`
(steps, model, tokens, cost, status), `hosted_apps` (go-live time) and the project record (start time).

## Four apps, start to finish

| | Water Log | Habit Tick | tic-tac-toe | Step Count |
| --- | --- | --- | --- | --- |
| Ran on | 2026-11-03 | 2026-11-03 | 2026-11-03 | 2026-11-04 |
| Idea → live | **108.9 min** | **174.9 min** | not hosted | not live yet (Delivery open at 05:21 UTC) |
| Architecture | 26.1 min | 45.1 min | 118.4 min¹ | 27.9 min |
| Delivery | 67.9 min | 67.4 min | 83.5 min | 62.0 min so far |
| Muse cost, Architecture + Delivery | $29.18 | $28.96 | $39.63 | $28.81 so far |
| Agent steps² | 23 | 27 | 48 | 22 so far |
| Tool calls inside the build sandbox | 961 | 891 | 1,130 | 925 so far |
| QA rounds (verify / fix) | 2 verify, 1 fix | 2 verify, 1 fix | 2 verify, 1 fix | 2 verify (1 failed), 0 fix so far |

¹ 38.8 of tic-tac-toe's 118.4 minutes were a staging database outage during one step. Staging has since moved to
a larger database size. Without the outage, Architecture took about 79.6 minutes.
² One step is one Muse call (hosted steps) or one whole sandbox session (the build, verify and fix turns).

"Idea → live" is the time from the project's creation to the app's go-live. It includes Direction, Design Studio and the
product plan, which the table doesn't break out. Judge journeys approve checkpoints automatically, so none of
these runs waited on a person. Cost is what Ori recorded on the agent steps of Architecture and Delivery; it does not
include Direction or Design Studio calls.

### Where Delivery time went (Water Log, 2026-11-03)

| Phase | Minutes | Share |
| --- | --- | --- |
| Agents building in the sandbox | 45.9 | 68% |
| Machine boot | 10.7 | 16% |
| Gate (install, typecheck, tests) | 3.7 | 5% |
| Setup, demo video, push, queueing, hand-offs | about 7.6 | 11% |

Habit Tick, tic-tac-toe and Step Count show the same shape: agents are 69–74% of Delivery, boot 8–15%.

## Muse in numbers (staging, 2026-10-25 → 2026-11-04)

Hosted steps are the model calls Ori makes from its own server (Direction-to-Architecture work such as the Business
Analyst, the Critic and the Build Spec steps). They run through Meta's Model API. Sandbox steps are
Muse Code sessions inside the build machine.

| | Hosted steps | Sandbox sessions |
| --- | --- | --- |
| Records | 409 | 49 |
| Finished | 395 | 47 |
| Muse "failed to generate a response" | 6 (1.5%) | 0 |
| No output for 6–13 minutes, step restarted | 3 | 0 |
| Queued 90 s without starting, step restarted | 1 | 0 |
| Cancelled (superseded or stall watchdog) | 4 | 0 |
| Failed for a reason that is not Muse | 0 | 1 (no machine zone available) |
| Input tokens (finished) | 20.0 M | 24.4 M |
| Output tokens (finished) | 3.35 M | 3.35 M |
| Cached input tokens read | 4.1 M | 744.8 M |
| Cost, finished steps | $131.35 | $313.54 |

All of these are staging projects, not only the four above. One sandbox session was still running when we counted.

## What Muse does well

- **Complete, designed apps that pass QA.** Water Log, Habit Tick and tic-tac-toe each went through the build, an
  independent QA check and one fix round to a releasable build. Water Log and Habit Tick went live.
- **Prompt caching inside the build machine.** The Muse Code sessions read 744.8 million cached tokens against 24.4
  million fresh input tokens. One Water Log build session alone read 59.8 million cached tokens
  (2026-11-03).
- **Steady single calls in the sandbox.** On tic-tac-toe (2026-11-03), single model calls inside the build
  took 3–7 seconds.
- **Most hosted steps finish.** 395 of 409 hosted steps finished (97%); 6 ended in a generation failure.

## Where Muse could improve

| Area | Measured |
| --- | --- |
| Caching for Build Spec steps | On Step Count (2026-11-04), 1 of 12 Build Spec calls read cached tokens. Across all projects since 2026-10-26, 62 of 278 finished Build Spec calls did (22%); cached tokens were about 17% of their input. Each call re-sends roughly 35–55k tokens. |
| Occasional generation failures | "The model failed to generate a response" came back 6 times between 2026-10-26 and 2026-11-03, out of 409 hosted steps. |
| Silent stalls | 3 hosted steps produced no output for 6, 7 and 13 minutes before Ori restarted them (all 2026-11-03). One Habit Tick step lost 13.9 minutes this way. |
| Latency per Build Spec call | On Step Count (2026-11-04), calls took 78–219 seconds (1.3–3.7 minutes). |

## Where Ori could improve

| Area | Measured |
| --- | --- |
| Build agents waiting on each other | In the build sandbox, "waiting on another agent" was 58% of tool time on Water Log (3,420 of 5,918 agent-seconds, 2026-11-03). On the other three apps it was 21–39%: Habit Tick 39%, tic-tac-toe 24%, Step Count 21%. |
| QA fix rounds | Each finished app needed a verify, a fix and a verify (about 12 minutes for the fix turn on Habit Tick and tic-tac-toe, 10.6 minutes on Water Log). |
| Machine boot | A sandbox machine takes about 2–3 minutes to boot, and every build, verify and fix turn boots its own. That was 10.3–11.4 minutes of Delivery on Habit Tick, tic-tac-toe and Water Log. |
| Architecture runs journeys one after another | Each journey makes five sequential Muse calls and the next journey waits. On tic-tac-toe, each journey took 10–13 minutes. On Step Count, Architecture took 27.9 minutes with one journey. |
| Faults after a failed step | A failed Build Spec step used to leave a run idle until something restarted it. On Reading List this cost 32.6 minutes and on Tip Split 169.4 minutes (measured 2026-11-03; root causes since fixed). |

## What this doesn't show

- Step Count is still being built; its row will change.
- tic-tac-toe wasn't hosted, so it has no idea-to-live time.
- Cost is recorded per step, not per app, so Direction and Design Studio calls aren't in the per-app costs.
- The four apps are small, judge-journey apps built with the fast pipeline. They say how Ori behaves on this kind of app, not on every kind.

## Working with the Muse team

We'd love to work with Meta's Muse team to make Ori the default way to build apps on Muse: sharing what we measure, and improving Ori and Muse together on the gaps above (caching in background mode, generation failures, latency).
