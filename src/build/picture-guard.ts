/**
 * The picture guard, as the public build sees it. Inside Ori this module holds the rules for the pictures a build may
 * make (lists and a classifier model); they stay private, because a published rule explains how to get round it. Here
 * the Muse relay (muse-relay.ts) asks Ori for a verdict through the rooms seam's `picture-guard` policy, so every
 * Muse Image prompt is still checked before it reaches Meta.
 */
import { oriSeamFromEnv } from "../seam/http";

export type PictureCategory = "real_person" | "brand" | "text" | "sexual" | "minor_sexual" | "violence" | "crime" | "classifier_unavailable" | "other";

export type PictureVerdict = { allowed: true } | { allowed: false; category: PictureCategory };

/** Inside Ori, the classifier model and its transport. The public guard asks Ori instead, so it is not used here. */
export type PictureClassifier = { model: string; call: (body: Record<string, unknown>) => Promise<string | null> };

/** Ori's verdict on a picture prompt. Fails closed: no verdict, no picture. */
export async function judgePicturePrompt(
  prompt: string,
  _classifier: PictureClassifier | undefined,
): Promise<{ verdict: PictureVerdict; source: "guard" | "classifier" }> {
  try {
    const verdict = await oriSeamFromEnv().policy("picture-guard", prompt);
    return { verdict: verdict.pass ? { allowed: true } : { allowed: false, category: "other" }, source: "guard" };
  } catch {
    return { verdict: { allowed: false, category: "classifier_unavailable" }, source: "guard" };
  }
}

/** What a caller is told when a picture is refused: the same words for every reason. */
export const REFUSAL_MESSAGE = "this picture cannot be made; describe a different scene with anonymous people, no brands and no text";
