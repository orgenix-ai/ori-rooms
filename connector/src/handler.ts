import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { httpOriClient, type OriClient } from "./ori.js";
import { createOriServer } from "./server.js";

/** Ori's address and this service's key for its connector API, from the environment. */
export function oriFromEnv(env = process.env): OriClient {
  const baseUrl = env.ORI_BASE_URL;
  const token = env.ORI_CONNECTOR_TOKEN;
  if (!baseUrl || !token) throw new Error("Set ORI_BASE_URL and ORI_CONNECTOR_TOKEN");
  return httpOriClient({ baseUrl, token });
}

/**
 * One MCP request, stateless: a fresh server and transport per request, JSON
 * replies, no sessions and no server-initiated stream.
 */
export async function handleMcp(request: Request, ori: OriClient = oriFromEnv()): Promise<Response> {
  const server = createOriServer(ori);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  // Signed in through Ori (Supabase OAuth 2.1): the token goes to Ori as is, and Ori checks it. Without one, only
  // start_app_with_ori works.
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  try {
    return await transport.handleRequest(request, token ? { authInfo: { token, clientId: "", scopes: [] } } : undefined);
  } finally {
    void server.close();
  }
}

/**
 * OAuth protected resource metadata (RFC 9728): tells Muse Code which
 * authorization server signs people in for this endpoint (Ori's, run by
 * Supabase Auth), so `muse mcp login ori` can discover it.
 */
export function protectedResourceMetadata(request: Request, env = process.env): Response {
  const issuer = env.ORI_AUTH_ISSUER;
  if (!issuer) return Response.json({ error: "Set ORI_AUTH_ISSUER" }, { status: 500 });
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      resource: `${origin}${env.ORI_MCP_PATH ?? "/mcp"}`,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "email", "profile"],
      resource_name: "Ori by Orgenix",
      resource_documentation: "https://github.com/orgenix-ai/ori-for-muse",
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
