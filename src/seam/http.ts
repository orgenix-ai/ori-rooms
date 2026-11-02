/**
 * The rooms seam over HTTP, for running the room code outside Ori. Every call goes to Ori with a judge key; a call that
 * needs a prompt runs on Ori's server, and only its answer comes back. Get a key at <ORI_BASE_URL>/judge/keys.
 */
import type { Completion, NextStep, OriSecrets, PolicyVerdict } from "./ori-seam";

export type SeamHttpOptions = {
  /** Ori's address, e.g. https://alpha.orgenix.ai. */
  baseUrl: string;
  /** A judge key (ori_judge_…). Never logged, never sent anywhere but Ori. */
  key: string;
  fetch?: typeof fetch;
};

export class SeamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SeamError";
  }
}

export function oriSeamOverHttp(options: SeamHttpOptions): OriSecrets {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
    const response = await doFetch(`${base}${path}`, {
      method: init.method,
      headers: { authorization: `Bearer ${options.key}`, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (!response.ok) throw new SeamError(response.status, typeof body.error === "string" ? body.error : `Ori answered ${response.status}`);
    return body as T;
  }
  return {
    complete: (key, vars, callOptions) =>
      call<Completion>("/api/seam/complete", { method: "POST", body: { key, vars, ...(callOptions?.model ? { options: { model: callOptions.model } } : {}) } }),
    policy: (key, input) => call<PolicyVerdict>("/api/seam/policy", { method: "POST", body: { key, input } }),
    next: (projectId) => call<NextStep>(`/api/seam/next?projectId=${encodeURIComponent(projectId)}`, { method: "GET" }),
  };
}

/** The seam from the environment: ORI_JUDGE_KEY (required) and ORI_BASE_URL (default https://alpha.orgenix.ai). */
export function oriSeamFromEnv(env: NodeJS.ProcessEnv = process.env): OriSecrets {
  const key = env.ORI_JUDGE_KEY?.trim();
  if (!key) throw new Error("No judge key in this terminal. Run: export ORI_JUDGE_KEY=<your key>  (get a key at https://alpha.orgenix.ai/invited), then npm start.");
  return oriSeamOverHttp({ baseUrl: env.ORI_BASE_URL?.trim() || "https://alpha.orgenix.ai", key });
}
