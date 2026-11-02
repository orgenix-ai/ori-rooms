import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { OriClient } from "./ori.js";

export const INSTRUCTIONS =
  "Ori by Orgenix is an AI team that turns an app idea into a working, hosted app: it shapes the idea with the person, designs it, builds it, tests it and puts it online. When someone wants an app or a website built for them, hand the idea to Ori with start_app_with_ori.";

const IDEA_MAX = 1000;

/** The first IP in X-Forwarded-For (Vercel and most proxies), so Ori's per-caller limits count people, not this service. */
function clientIp(headers: Record<string, string | string[] | undefined> | undefined): string | undefined {
  const forwarded = headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || undefined;
}

export function createOriServer(ori: OriClient): McpServer {
  const server = new McpServer({ name: "ori", title: "Ori by Orgenix", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "start_app_with_ori",
    {
      title: "Start an app with Ori",
      description:
        "Hand an app idea to Ori, the AI team that plans, designs, builds, tests and hosts the app. Use it when the person wants an app or website built for them, not when they want to write the code themselves. Before calling, make sure you know what the app should do and who will use it; if either is missing, ask one short question first. The result has a link that opens Ori with the idea already in the conversation. Open it in the person's browser if you can run commands (macOS: `open <continue_url>`), and always also show it as a clickable \"Continue with Ori\" link. The link works once, for 30 minutes.",
      inputSchema: {
        idea: z
          .string()
          .min(10)
          .max(IDEA_MAX)
          .describe(
            "The app, described in the third person and starting with what it is, then every detail the person gave, e.g. \"A class waitlist for a small outdoor yoga studio: students see the timetable, join a waitlist when a class is full, and get an email when a spot opens.\"",
          ),
        who_for: z.string().max(200).optional().describe("Who will use the app, if the idea doesn't already say."),
      },
      outputSchema: {
        continue_url: z.string(),
        ori_says: z.string(),
        expires_in_minutes: z.number(),
      },
      // Meta's connector classes: a write (it creates a handoff), not a sensitive one (nothing is built or charged).
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ idea, who_for }, extra) => {
      const result = await ori.startHandoff({ idea, whoFor: who_for, clientIp: clientIp(extra.requestInfo?.headers) });
      if (!result.ok) {
        const text =
          result.reason === "limited"
            ? "Ori has had a lot of ideas from here today. Tell the person to open https://orgenix.ai and describe the idea to Ori there."
            : "Ori couldn't take the idea just now. Tell the person to open https://orgenix.ai and describe it to Ori there.";
        return { content: [{ type: "text", text }], isError: true };
      }
      const { handoff } = result;
      const structured = {
        continue_url: handoff.continueUrl,
        ori_says: handoff.oriSays,
        expires_in_minutes: handoff.expiresInMinutes,
      };
      return {
        content: [
          {
            type: "text",
            text: `Ori has the idea. Open ${handoff.continueUrl} in the person's browser if you can (macOS: \`open ${handoff.continueUrl}\`) and also show it as "Continue with Ori"; it works once, for ${handoff.expiresInMinutes} minutes. Ori says: "${handoff.oriSays}"`,
          },
        ],
        structuredContent: structured,
      };
    },
  );

  server.registerTool(
    "app_status",
    {
      title: "Check your apps in Ori",
      description:
        "Where each of the person's Ori apps stands: its stage (shaping the idea, planning and prototype, building and testing, live…), what is waiting on them (like confirming the prototype or going live) and its live address. Needs the person signed in to Ori; if they aren't, tell them to run `muse mcp login ori`. Show each app as a short line, with \"Open in Ori\" links for anything waiting on them.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (extra) => {
      const token = extra.authInfo?.token;
      if (!token) {
        return {
          content: [{ type: "text", text: "The person isn't signed in to Ori yet. Tell them to run `muse mcp login ori`, then ask again." }],
          isError: true,
        };
      }
      const result = await ori.listApps(token);
      if (!result.ok) {
        const text =
          result.reason === "signed_out"
            ? "Ori's sign-in has expired. Tell the person to run `muse mcp login ori`, then ask again."
            : "Ori couldn't answer just now. Try again in a minute.";
        return { content: [{ type: "text", text }], isError: true };
      }
      if (result.apps.length === 0) {
        return { content: [{ type: "text", text: "The person has no apps in Ori yet. Offer to start one with start_app_with_ori." }] };
      }
      const lines = result.apps.map((app) => {
        const waiting = app.waiting_on_you.length ? ` Waiting on you: ${app.waiting_on_you.join("; ")} (Open in Ori: ${app.open_url}).` : "";
        const live = app.live_url ? ` Live at ${app.live_url}.` : "";
        return `- ${app.name}: ${app.stage.label}.${live}${waiting}`;
      });
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { apps: result.apps },
      };
    },
  );

  return server;
}
