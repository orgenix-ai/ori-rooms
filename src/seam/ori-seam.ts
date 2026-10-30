/**
 * The one seam between Ori's room code and what stays private: every prompt, every scoring or quality rule, and the
 * cross-room orchestration go through it. Inside Ori it reads the private sources; in the public ori-rooms repo it is an
 * HTTP client to Ori (ori-seam-http.ts), and a call that needs a prompt runs on Ori's server, so prompt text never leaves.
 */

/** A prompt the room code needs, by key, with the values it fills in. */
export type PromptKey = string;
/** A rule the room code asks a verdict of, by key (a quality bar, a picture guard, a scoring rule). */
export type PolicyKey = string;

export type PolicyVerdict = { pass: boolean; reasons: string[] };

/** What runs next for a project, as Ori's orchestration decides it: a room, a step, or nothing. */
export type NextStep = { room: "direction" | "studio" | "plan" | "prototype" | "architecture" | "build" | "live"; step: string } | null;

/** A model call's outcome: the answer and what it cost, never the prompt that produced it. */
export type Completion = { text: string; model: string; inputTokens: number; outputTokens: number; costUsd: number };

export interface OriSecrets {
  /**
   * Runs the model call that prompt `key` drives, with `vars` filled in, and returns only its answer. The prompt is
   * assembled and sent on Ori's server; it is never returned, so the public client cannot read it back.
   */
  complete(key: PromptKey, vars: Record<string, string>, options?: { model?: string; stream?: boolean }): Promise<Completion>;
  /** The verdict of rule `key` on `input`. The rule itself stays private. */
  policy(key: PolicyKey, input: unknown): Promise<PolicyVerdict>;
  /** What runs next for the project. */
  next(projectId: string): Promise<NextStep>;
}
