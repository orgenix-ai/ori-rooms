import { describe, expect, it } from "vitest";

import { protectedResourceMetadata } from "../src/handler.js";

describe("OAuth protected resource metadata", () => {
  it("names Ori's authorization server for this endpoint", async () => {
    const response = protectedResourceMetadata(new Request("https://ori-for-muse.orgenix.ai/.well-known/oauth-protected-resource"), {
      ORI_AUTH_ISSUER: "https://example.supabase.co/auth/v1",
      ORI_MCP_PATH: "/api/mcp",
    });
    const body = await response.json();
    expect(body.resource).toBe("https://ori-for-muse.orgenix.ai/api/mcp");
    expect(body.authorization_servers).toEqual(["https://example.supabase.co/auth/v1"]);
  });
});
