/**
 * `npm start [idea]`: one app idea through two of Ori's rooms on Meta's Muse models, then the picture guard.
 *
 *   1. Direction: Ori's Design Master opens the conversation (muse-wonder-1.0, prompt on Ori's server).
 *   2. Studio: the Master draws three looks for the app (muse-wonder-1.0); Ori's own look checks (studio/) run here,
 *      and looks they send back get Ori's repair turn.
 *   3. Pictures: Ori's picture guard judges two Muse Image prompts (muse-spark-1.3 classifier on Ori's server).
 *
 * Needs ORI_JUDGE_KEY (create one at https://alpha.orgenix.ai/judge/keys). Prompts never come back, only answers.
 */
import { oriSeamFromEnv } from "./seam/http";
import { readDrawnLooks } from "./studio/server/design-studio-looks";

const DEFAULT_IDEA =
  "A class waitlist for my small yoga studio with outdoor classes in the park. Students sign in with Google, see the weekly timetable, and join a waitlist when a class is full. When someone cancels, the next person on the waitlist gets an email and the spot. For outdoor classes, everyone booked gets a warning the day before if rain is forecast.";

/** The first JSON object in a model's answer: a ```json fence if there is one, else the outermost braces. */
function jsonIn(text: string): Record<string, unknown> | null {
  const fenced = /```json\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const rule = (title: string) => console.log(`\n── ${title} ${"─".repeat(Math.max(0, 66 - title.length))}`);

async function main() {
  const idea = process.argv.slice(2).join(" ").trim() || DEFAULT_IDEA;
  const ori = oriSeamFromEnv();
  let spent = 0;

  rule("Direction · Ori's Design Master opens (muse-wonder-1.0)");
  const opening = await ori.complete("direction.opening", { repository: "your-app", description: idea });
  spent += opening.costUsd;
  const direction = jsonIn(opening.text);
  console.log(typeof direction?.reply === "string" ? direction.reply : opening.text);
  if (direction?.axes) console.log(`\nAxes: ${JSON.stringify(direction.axes)}`);

  rule("Studio · three looks for this app (muse-wonder-1.0)");
  const drawn = await ori.complete("studio.looks", { app: idea });
  spent += drawn.costUsd;
  let studio = jsonIn(drawn.text);
  let looks = readDrawnLooks(studio?.looks, studio?.identity);
  if (!looks.ok) {
    // As in Ori: what the checks found goes back to the Master once, on Ori's repair turn.
    console.log("Ori's look checks sent the looks back:");
    for (const problem of looks.problems) console.log(`  - ${problem}`);
    console.log("\nRepair turn: the Master redraws them with what the checks found (muse-wonder-1.0).");
    const repaired = await ori.complete("studio.looksRepair", { app: idea, previous: drawn.text });
    spent += repaired.costUsd;
    studio = jsonIn(repaired.text);
    looks = readDrawnLooks(studio?.looks, studio?.identity);
  }
  if (looks.ok) {
    for (const look of looks.looks) {
      const theme = look.theme;
      console.log(`• ${look.name} (${look.scheme}): ${look.summary}`);
      console.log(`  accent ${theme.palette.accent} · ${theme.fonts.display} over ${theme.fonts.body} · ${theme.layout.shell}, ${theme.layout.width} · ${theme.density}`);
    }
  } else {
    console.log("The repaired looks still failed Ori's checks (inside Ori, Studio falls back to looks made for the app):");
    for (const problem of looks.problems) console.log(`  - ${problem}`);
  }

  rule("Pictures · Ori's guard on two Muse Image prompts (muse-spark-1.3)");
  for (const prompt of ["a sunny yoga class on a park lawn, anonymous students on mats, morning light", "a portrait of a famous movie star doing yoga"]) {
    const verdict = await ori.policy("picture-guard", prompt);
    console.log(`${verdict.pass ? "✓ allowed" : "✗ refused"}  ${prompt}`);
  }

  rule("Done");
  console.log(`Muse cost of this run: $${spent.toFixed(4)} (plus the guard's classifier calls), charged to your judge key.`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
