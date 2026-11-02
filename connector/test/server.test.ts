import { describe, expect, it, vi } from "vitest";

import { handleMcp } from "../src/handler.js";
import type { OriClient } from "../src/ori.js";

function rpc(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:8787/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

const ori = (
  result: Awaited<ReturnType<OriClient["startHandoff"]>>,
  apps: Awaited<ReturnType<OriClient["listApps"]>> = { ok: false, reason: "signed_out" },
) => ({ startHandoff: vi.fn(async () => result), listApps: vi.fn(async () => apps) });

const ok = ori({
  ok: true,
  handoff: { continueUrl: "https://orgenix.ai/continue/abc", oriSays: "You told me you want to build a class waitlist.", expiresInMinutes: 30 },
});

describe("Ori for Muse MCP server", () => {
  it("initializes and lists the one tool as a non-destructive write", async () => {
    const init = await (
      await handleMcp(
        rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
        ok,
      )
    ).json();
    expect(init.result.serverInfo.name).toBe("ori");
    const list = await (await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }), ok)).json();
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["start_app_with_ori", "app_status"]);
    expect(list.result.tools[0].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });

  it("hands the idea to Ori with the caller's IP and returns the link", async () => {
    const client = ori({
      ok: true,
      handoff: { continueUrl: "https://orgenix.ai/continue/abc", oriSays: "Hi", expiresInMinutes: 30 },
    });
    const body = await (
      await handleMcp(
        rpc(
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "start_app_with_ori", arguments: { idea: "A class waitlist for my yoga studio", who_for: "my students" } },
          },
          { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
        ),
        client,
      )
    ).json();
    expect(body.result.structuredContent.continue_url).toBe("https://orgenix.ai/continue/abc");
    expect(client.startHandoff).toHaveBeenCalledWith({ idea: "A class waitlist for my yoga studio", whoFor: "my students", clientIp: "203.0.113.7" });
  });

  it("points the person to orgenix.ai when Ori limits or is unavailable", async () => {
    for (const reason of ["limited", "unavailable"] as const) {
      const body = await (
        await handleMcp(
          rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "start_app_with_ori", arguments: { idea: "A booking app for a yoga studio" } } }),
          ori({ ok: false, reason }),
        )
      ).json();
      expect(body.result.isError).toBe(true);
      expect(body.result.content[0].text).toContain("orgenix.ai");
    }
  });

  it("rejects an idea too short to act on", async () => {
    const client = ori({ ok: false, reason: "unavailable" });
    const body = await (
      await handleMcp(rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "start_app_with_ori", arguments: { idea: "app" } } }), client)
    ).json();
    expect(body.result?.isError ?? Boolean(body.error)).toBe(true);
    expect(client.startHandoff).not.toHaveBeenCalled();
  });

  it("app_status asks for sign-in without a token and never calls Ori", async () => {
    const client = ori({ ok: false, reason: "unavailable" });
    const body = await (await handleMcp(rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "app_status", arguments: {} } }), client)).json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("muse mcp login ori");
    expect(client.listApps).not.toHaveBeenCalled();
  });

  it("app_status reads the person's apps with their own token", async () => {
    const client = ori(
      { ok: false, reason: "unavailable" },
      {
        ok: true,
        apps: [
          {
            id: "p1",
            name: "Class Waitlist",
            stage: { key: "m3", label: "Planning and prototype" },
            waiting_on_you: ["Confirm the prototype"],
            live_url: null,
            open_url: "https://orgenix.ai/dashboard",
          },
        ],
      },
    );
    const body = await (
      await handleMcp(
        rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "app_status", arguments: {} } }, { authorization: "Bearer user-token" }),
        client,
      )
    ).json();
    expect(client.listApps).toHaveBeenCalledWith("user-token");
    expect(body.result.content[0].text).toContain("Class Waitlist: Planning and prototype");
    expect(body.result.content[0].text).toContain("Confirm the prototype");
  });

  it("app_status tells the person to sign in again when Ori rejects the token", async () => {
    const body = await (
      await handleMcp(
        rpc({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "app_status", arguments: {} } }, { authorization: "Bearer old" }),
        ori({ ok: false, reason: "unavailable" }, { ok: false, reason: "signed_out" }),
      )
    ).json();
    expect(body.result.content[0].text).toContain("sign-in has expired");
  });
});
