/**
 * Providers that speak the OpenAI Responses API at a base URL of their own, as data (My PO, 2026-10-21). A model whose id
 * starts with a route's prefix runs on the OpenAI adapter with that route's base URL and key, so a new provider of this kind
 * is one entry here: no adapter, no branch in the platform's LLM layer. The table routes; it never chooses. The model of a
 * step is the one the project's Settings name, and a model that is not listed here is refused where it is used. Prices are
 * the price table's (model-pricing.ts), which a listed model must have an entry in (agents/test/openai-compatible-routes.test.ts).
 */

export type OpenAiCompatibleModel = {
  id: string;
  displayName: string;
};

export type OpenAiCompatibleRoute = {
  id: string;
  /** The provider's name in operator-facing messages. */
  label: string;
  /** A model id belongs to the route when it starts with this. */
  modelPrefix: string;
  /** The Responses API's base URL (the client appends `/responses`). */
  baseUrl: string;
  /** The environment variable holding Orgenix's key for the route (a pay-per-use API key of its own). */
  keyEnv: string;
  models: readonly OpenAiCompatibleModel[];
};

export const OPENAI_COMPATIBLE_ROUTES: readonly OpenAiCompatibleRoute[] = [
  {
    id: "meta",
    label: "Meta Model API",
    modelPrefix: "muse-",
    baseUrl: "https://api.meta.ai/v1",
    keyEnv: "META_API_KEY",
    models: [
      { id: "muse-wonder-1.0", displayName: "Muse Wonder 1.0 (Meta)" },
      { id: "muse-spark-1.3", displayName: "Muse Spark 1.3 (Meta)" },
    ],
  },
];

/** The route a model id belongs to, or null. Pure. */
export function openAiCompatibleRouteOf(model: string): OpenAiCompatibleRoute | null {
  return OPENAI_COMPATIBLE_ROUTES.find((route) => model.startsWith(route.modelPrefix)) ?? null;
}

/** Every model of every route, for the lists and the price table. */
export function openAiCompatibleModels(): OpenAiCompatibleModel[] {
  return OPENAI_COMPATIBLE_ROUTES.flatMap((route) => route.models.map((model) => ({ ...model })));
}
