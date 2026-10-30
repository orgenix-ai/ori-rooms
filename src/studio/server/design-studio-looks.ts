import { z } from "zod";

import {
  MIN_ACCENT_TEXT_CONTRAST,
  MIN_STRUCTURAL_CHANGES,
  accentTextContrast,
  clipText,
  lookRepeatsPrevious,
  fallbackStudioLooks,
  finishStudioLook,
  hexToOklch,
  hueDistance,
  lookDifferenceViolations,
  studioIdentitySchema,
  studioLookSchema,
  type StudioIdentity,
  type StudioLook,
} from "../studio-looks";

import { openPlatformSystemIssue } from "./system-issues";

/**
 * Studio drawing three looks for the app (docs/product/STUDIO-LOOKS.md, L1):
 * the prompt contract, reading the Master's reply, and the fallback.
 */

const drawnLookSchema = z
  .object({
    name: z.string(),
    summary: z.string(),
    moodWords: z.array(z.string()),
    scheme: z.enum(["light", "dark"]),
    inspiredBy: z.string().optional(),
    theme: z.unknown(),
  })
  .passthrough();

/** A founder reference as the looks see it: traits in words, and what the page computed (sites only). */
export type LookReference = {
  label: string;
  summary: string;
  traits: Record<string, string>;
  computed?: { colors?: string[]; fonts?: string[] } | null;
};

/**
 * A look that wears a reference's own face and colour has copied it, not
 * taken traits from it (STUDIO-LOOKS § References: never copied).
 */
export function copiedReference(look: StudioLook, references: readonly LookReference[]): LookReference | null {
  const accent = hexToOklch(look.theme.palette.accent);
  const display = look.theme.fonts.display.toLowerCase();
  for (const reference of references) {
    const fonts = (reference.computed?.fonts ?? []).map((font) => font.toLowerCase());
    if (!fonts.some((font) => font === display)) continue;
    const colours = (reference.computed?.colors ?? []).filter((colour) => /^#[0-9a-f]{6}$/i.test(colour));
    const sameColour = colours.some((colour) => {
      const other = hexToOklch(colour);
      return (
        hueDistance(accent.h, other.h) < 12 && Math.abs(accent.c - other.c) < 0.04 && Math.abs(accent.l - other.l) < 0.08
      );
    });
    if (sameColour) return reference;
  }
  return null;
}

/** A looks redraw older than this is treated as dead (the function was cut off); the next one may start. */
export const LOOKS_REDRAW_STALE_MS = 15 * 60_000;

export type DrawnLooks =
  | { ok: true; looks: StudioLook[]; identity: StudioIdentity | null }
  | { ok: false; problems: string[] };

/**
 * The three looks in a Master reply, checked: each a valid template theme, and
 * the three clearly different. Problems are worded for the Master's retry.
 */
export function readDrawnLooks(
  rawLooks: unknown,
  rawIdentity: unknown,
  references: readonly LookReference[] = [],
  /** The set already shown, when the founder asked for different ones. */
  previous: readonly StudioLook[] = [],
): DrawnLooks {
  if (!Array.isArray(rawLooks) || rawLooks.length !== 3) {
    return { ok: false, problems: ["Reply with exactly three looks."] };
  }
  const problems: string[] = [];
  const looks: StudioLook[] = [];
  rawLooks.forEach((raw, index) => {
    const shape = drawnLookSchema.safeParse(raw);
    if (!shape.success) {
      problems.push(`Look ${index + 1}: ${shape.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
      return;
    }
    const clipped = (field: string) => (full: string) =>
      console.warn("[design-studio/looks] clipped a long look field", { look: index + 1, field, length: full.length });
    try {
      looks.push(
        finishStudioLook({
          name: clipText(shape.data.name, 40, clipped("name")),
          summary: clipText(shape.data.summary, 200, clipped("summary")),
          moodWords: shape.data.moodWords
            .map((word) => clipText(word, 24, clipped("moodWords")))
            .filter(Boolean)
            .slice(0, 4),
          scheme: shape.data.scheme,
          ...(references.length && shape.data.inspiredBy?.trim()
            ? { inspiredBy: clipText(shape.data.inspiredBy, 200, clipped("inspiredBy")) }
            : {}),
          theme: shape.data.theme,
          source: "generated",
        }),
      );
    } catch (error) {
      const issues = error instanceof z.ZodError ? error.issues : [];
      problems.push(
        `Look ${index + 1}: ${issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ") || "not a valid look"}`,
      );
    }
  });
  if (problems.length) return { ok: false, problems };
  for (const look of looks) {
    const contrast = accentTextContrast(look.theme.palette.accent);
    if (contrast < MIN_ACCENT_TEXT_CONTRAST) {
      problems.push(
        `"${look.name}": its accent takes neither black nor white text at ${MIN_ACCENT_TEXT_CONTRAST}:1 (best ${contrast.toFixed(2)}:1); make it a little darker or lighter.`,
      );
    }
  }
  for (const look of looks) {
    const repeats = lookRepeatsPrevious(look, previous);
    if (repeats) {
      problems.push(
        `"${look.name}" re-skins "${repeats.previous.name}", which they already saw: same ${repeats.same.join(", ")}. Change at least ${MIN_STRUCTURAL_CHANGES} of layout, light or dark, density and imagery.`,
      );
    }
    const copied = copiedReference(look, references);
    if (copied) {
      problems.push(`"${look.name}" wears ${copied.label}'s own face and colour; take its traits, not its look.`);
    }
  }
  const names = looks.map((look) => look.name);
  for (const violation of lookDifferenceViolations(looks)) {
    const [a, b] = violation.looks.map((id) => names[looks.findIndex((look) => look.id === id)] ?? id);
    problems.push(
      violation.rule === "copies-default"
        ? `"${a}" repeats an old default's accent and face; give it its own.`
        : `"${a}" and "${b}" are too close: ${violation.detail}.`,
    );
  }
  if (problems.length) return { ok: false, problems };
  const identity = studioIdentitySchema.safeParse(fitIdentity(rawIdentity));
  return { ok: true, looks, identity: identity.success ? identity.data : null };
}

/** The Master's identity within the stored caps; anything that is not an identity is left for the schema to refuse. */
function fitIdentity(raw: unknown): unknown {
  const parsed = z
    .object({ summary: z.string(), audience: z.string(), moodWords: z.array(z.string()) })
    .safeParse(raw);
  if (!parsed.success) return raw;
  const log = (field: string) => (full: string) =>
    console.warn("[design-studio/looks] clipped a long identity field", { field, length: full.length });
  return {
    summary: clipText(parsed.data.summary, 300, log("summary")),
    audience: clipText(parsed.data.audience, 200, log("audience")),
    moodWords: parsed.data.moodWords.map((word) => clipText(word, 24, log("moodWords"))).filter(Boolean).slice(0, 6),
  };
}

/** What Studio knows about the app when the Master gave no identity of its own. */
export function identityFromBrief(
  brief: { one_sentence_summary?: unknown; persona?: unknown } | null,
  repository: string,
): StudioIdentity {
  const summary = typeof brief?.one_sentence_summary === "string" ? brief.one_sentence_summary.trim() : "";
  const persona =
    brief?.persona && typeof brief.persona === "object" && typeof (brief.persona as { summary?: unknown }).summary === "string"
      ? ((brief.persona as { summary: string }).summary.trim())
      : "";
  return {
    summary: (summary || `The app ${repository.split("/").pop() ?? repository}.`).slice(0, 300),
    audience: (persona || "the people who use it").slice(0, 200),
    moodWords: ["clear"],
  };
}

/** The looks the session holds and the one chosen, as stored. */
export function sessionLooks(session: { looks?: unknown; chosen_look_id?: unknown; look_identity?: unknown }): {
  looks: StudioLook[];
  chosen: StudioLook | null;
  identity: StudioIdentity | null;
} {
  const looks = z.array(studioLookSchema).parse(session.looks ?? []);
  const chosenId = typeof session.chosen_look_id === "string" ? session.chosen_look_id : null;
  const chosen = chosenId ? (looks.find((look) => look.id === chosenId) ?? null) : null;
  if (chosenId && !chosen) throw new Error(`Studio chose look ${chosenId}, which it does not hold`);
  const identity = session.look_identity == null ? null : studioIdentitySchema.parse(session.look_identity);
  return { looks, chosen, identity };
}

/**
 * The fallback trio, reinterpreted with the app's brief (STUDIO-LOOKS §
 * Decision 3). Operators hear about it; the founder just sees three looks.
 */
/** The fallback variant after the set already shown: the next one when that set was the fallback too. */
export function nextFallbackVariant(previous: readonly StudioLook[]): number {
  const shown = previous.filter((look) => look.source === "fallback");
  return shown.length ? Math.max(...shown.map((look) => look.variant ?? 0)) + 1 : 0;
}

export async function fallbackLooksFor(input: {
  identity: StudioIdentity;
  projectId: string;
  problems: string[];
  previous: readonly StudioLook[];
}): Promise<{ looks: StudioLook[]; identity: StudioIdentity }> {
  await openPlatformSystemIssue({
    category: "operator",
    code: "studio_looks_fallback",
    title: "Design Studio used the default looks",
    message: "Design Master's looks were unusable after one retry, so Studio showed the three defaults reinterpreted for the app.",
    severity: "warning",
    evidence: { projectId: input.projectId, problems: input.problems.slice(0, 8) },
  }).catch((error: unknown) => console.error("[design-studio/looks] the fallback issue was not opened", error));
  return { looks: fallbackStudioLooks(input.identity, nextFallbackVariant(input.previous)), identity: input.identity };
}
