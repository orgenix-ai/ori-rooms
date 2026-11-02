# Ori for Muse (the connector)

An MCP server that lets **Muse Code**, Meta's coding agent, hand an app idea to Ori. You ask Muse Code for an app; it calls Ori's `start_app_with_ori` tool, and Ori opens in your browser with the idea already in the conversation.

## Run it

Node 22 or later, and a judge key from alpha (see *Use Ori from Muse Code* in the [main README](../README.md)).

```bash
cd connector
npm install
ORI_BASE_URL=https://alpha.orgenix.ai ORI_CONNECTOR_TOKEN=ori_judge_… npm run dev
```

It listens at `http://localhost:8787/mcp`. Add it to Muse Code in `~/.config/muse/settings.json`:

```json
{
  "mcpServers": {
    "ori": { "url": "http://localhost:8787/mcp" }
  }
}
```

Then ask Muse Code for an app, for example *"Use Ori to build a booking app for my bike repair shop. Customers pick a repair and a drop-off time."*

| Variable | Meaning |
| --- | --- |
| `ORI_BASE_URL` | The Ori instance to hand ideas to |
| `ORI_CONNECTOR_TOKEN` | Your key for Ori's connector API (a judge key on alpha) |
| `ORI_AUTH_ISSUER` | Ori's authorization server, only needed for `app_status` |
| `PORT` | Local port (default 8787) |

## Tools

| Tool | What it does |
| --- | --- |
| `start_app_with_ori` | Hands an app idea to Ori and returns a one-time link (30 minutes) that opens Ori with it. Nothing is built or charged until you continue in Ori. |
| `app_status` | Lists your apps in Ori: stage, what's waiting on you, and the live address. Needs `muse mcp login ori` (standard MCP OAuth with PKCE). |

## How it works

`src/server.ts` defines the two tools with the official MCP TypeScript SDK; `src/handler.ts` serves them as a stateless, streamable-HTTP endpoint; `src/ori.ts` calls Ori's connector API. Ori keeps the idea for at most 30 minutes under a one-time token and deletes it when the link is opened. The idea never goes into a URL, and each machine can hand Ori 30 ideas a day.

```bash
npm test
```

## Licence

This folder is MIT licensed (`LICENSE` here); the rest of the repository is under PolyForm Noncommercial.
