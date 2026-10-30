import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { addTokens, ZERO, type Tokens } from "./usage.js";

/**
 * One lane as a Muse Code session (the fourth build runtime, after Claude Code, Codex and the Gemini CLI). Like Codex and
 * Gemini, the CLI has no subagents the pipeline can use, so the orchestrator is a program (muse-session.ts) and each lane is
 * a `muse exec` process: its launch text is the first turn, and a later message (the lab's SendMessage) is another
 * `muse exec` on the same `--session-id`, which replays the session and adds the message. A lane counts as idle when no turn
 * runs and no message waits.
 *
 * `muse exec --json` writes the Muse Session Protocol's events as JSON lines (payload_type, payload). They are reported in
 * the shape the host already maps (sandbox/host/events.ts, the Claude Agent SDK's messages): the agent's words as assistant
 * text, a tool call with its result, a finished turn as a result. `parentToolUseId` ties a lane's messages to the
 * orchestrator's "Agent" call that launched it, which is how the host names the lane's role.
 */

type MuseUsageRow = { model?: string; input_tokens?: number; cached_tokens?: number; output_tokens?: number };

/** One line of `muse exec --json`: the protocol's envelope, and the payload as far as the host uses it. */
export type MuseEvent = {
  payload_type?: string;
  payload?: {
    text?: string;
    call_id?: string;
    operation?: string;
    idempotency_key?: string;
    terminal?: string;
    reason?: string | null;
    models?: MuseUsageRow[];
    correlation_facts?: { tool_name?: string; outcome?: string };
    event?: { kind?: string; operation?: string; idempotency_key?: string };
  };
};

/** A message in the shape events.ts reads (Claude Agent SDK's SDKMessage), as far as the host uses it. */
export type SdkLike = Record<string, unknown>;

/** Tokens by model: the build's own and the helper model Muse Code runs beside it, each priced at its own rates. */
export type TokensByModel = Record<string, Tokens>;

/**
 * One turn's usage by model: the cached part of the input apart from the rest (it is counted inside `input_tokens`), no
 * cache-write charge, reasoning inside the output. Pure.
 */
export function museTurnTokens(models: MuseUsageRow[] | undefined): TokensByModel {
  const byModel: TokensByModel = {};
  for (const row of models ?? []) {
    const input = row.input_tokens ?? 0;
    const cached = Math.min(row.cached_tokens ?? 0, input);
    const key = row.model ?? "unknown";
    byModel[key] = addTokens(byModel[key] ?? { ...ZERO }, { in: input - cached, out: row.output_tokens ?? 0, cw5: 0, cw1h: 0, cr: cached });
  }
  return byModel;
}

export function parseMuseLine(line: string): MuseEvent | null {
  if (!line.startsWith("{")) return null;
  try {
    return JSON.parse(line) as MuseEvent;
  } catch {
    return null;
  }
}

/** The Claude-style name of a Muse tool, which is what the host and its readers know tools by. Pure. */
export function toolName(name: string | undefined): string {
  switch (name) {
    case "bash":
      return "Bash";
    case "write_file":
      return "Write";
    case "edit_file":
      return "Edit";
    case "read_file":
      return "Read";
    case "search":
      // Muse's one search tool lists folders, matches file names and greps contents.
      return "Grep";
    default:
      return `mcp__muse__${name ?? "tool"}`;
  }
}

/** The tool a `side_effect_intent` names (`tool:bash`) and the call it belongs to (`tool:<call id>`); null for a model call. Pure. */
export function toolCall(event: MuseEvent): { id: string; name: string } | null {
  if (event.payload_type !== "task.lifecycle.side_effect_intent") return null;
  const intent = event.payload?.event;
  const operation = intent?.operation ?? event.payload?.operation;
  const key = intent?.idempotency_key ?? event.payload?.idempotency_key;
  if (!operation?.startsWith("tool:") || !key?.startsWith("tool:")) return null;
  return { id: key.slice("tool:".length), name: operation.slice("tool:".length) };
}

/**
 * One Muse event as zero or more SDK-shaped messages. `pending` is the assistant text the lane has said since its last tool
 * call or result; it is flushed as one assistant message when a tool call or the result comes. Pure.
 */
export function sdkMessages(event: MuseEvent, parentToolUseId: string | null, turn: number, pending: string): { messages: SdkLike[]; pending: string } {
  const assistant = (content: unknown[]): SdkLike => ({ type: "assistant", parent_tool_use_id: parentToolUseId, message: { role: "assistant", content } });
  const flush = (): SdkLike[] => (pending.trim() ? [assistant([{ type: "text", text: pending }])] : []);
  if (event.payload_type === "run.output.delta" && event.payload?.text) {
    return { messages: [], pending: pending + event.payload.text };
  }
  const call = toolCall(event);
  if (call) {
    return { messages: [...flush(), assistant([{ type: "tool_use", id: call.id, name: toolName(call.name), input: {} }])], pending: "" };
  }
  if (event.payload_type === "tool.result") {
    return {
      messages: [
        {
          type: "user",
          parent_tool_use_id: parentToolUseId,
          message: {
            role: "user",
            content: [
              { type: "tool_result", tool_use_id: event.payload?.call_id ?? `muse-${turn}`, content: event.payload?.text ?? "", is_error: event.payload?.correlation_facts?.outcome !== "success" },
            ],
          },
        },
      ],
      pending,
    };
  }
  if (event.payload_type?.startsWith("run.terminal.")) {
    const ok = event.payload?.terminal === "completed";
    return {
      messages: [
        ...flush(),
        {
          type: "result",
          subtype: ok ? "success" : "error_during_execution",
          is_error: !ok,
          parent_tool_use_id: parentToolUseId,
          num_turns: turn,
          result: ok ? (event.payload?.text ?? pending) : (event.payload?.reason ?? event.payload?.terminal ?? "the turn failed"),
        },
      ],
      pending: "",
    };
  }
  return { messages: [], pending };
}

export type MuseSettings = {
  /** The model the lane runs on (the id the host's relay allows). */
  model: string;
  /** The directory every lane starts in. */
  cwd: string;
  /** Raw events of every turn, one file per lane, and the turns' prompt files. */
  transcripts: string;
  /** Where the CLI is pointed: the host's relay, http://muse:8080. Muse is given `<relay>/v1` as its base URL. */
  relay: string;
  /** Environment the CLI gets (its home, the placeholder key); the real key is the relay's. */
  env: Record<string, string | undefined>;
  emit: (event: Record<string, unknown>) => void;
  abort: AbortController;
  /** The Muse executable; a test replaces it. */
  muse?: string;
  /** Text put before every launch text and message: how the Muse runtime differs from the one the role text was written for. */
  preamble?: string;
};

/**
 * Arguments of one turn. The session id is the lane's own, so a message after the first resumes it; the prompt is read from
 * a file (a fix or agent brief is far past what an argument should carry). Approval and the OS sandbox are off (the build's
 * own sandbox is the boundary, as for the other runtimes), web tools and reminder agents are off (no part of this pipeline
 * uses them; the pipeline's web lookup is `web-lookup`), and the model call goes to the relay. Pure.
 */
export function museArgs(settings: Pick<MuseSettings, "model" | "relay">, session: string, promptFile: string): string[] {
  return [
    "exec",
    "--yolo",
    "--disable-web-tools",
    "--disable-reminders",
    "--no-foreign-personal-context",
    "--base-url",
    `${settings.relay}/v1`,
    "--model",
    settings.model,
    "--session-id",
    session,
    "--json",
    "--prompt-file",
    promptFile,
  ];
}

export class MuseAgent {
  /** The Muse session this lane runs in (its own id from the start; the first turn creates it). */
  readonly session = randomUUID();
  /** Messages sent (the launch prompt is the first). */
  turns = 0;
  /** Turns Muse finished. */
  completed = 0;
  /** What the lane's finished turns used, by model. */
  byModel: TokensByModel = {};
  lastStatus: "success" | "error" | "aborted" | null = null;
  lastText = "";
  private readonly queue: string[] = [];
  private child: ChildProcess | null = null;
  private started = false;
  private closed = false;
  private pump: Promise<void> | null = null;

  constructor(
    readonly label: string,
    private readonly settings: MuseSettings,
    /** The id of the orchestrator's "Agent" call that launched this lane; null when the lane is the session itself. */
    private readonly parentToolUseId: string | null = null,
  ) {}

  /** All the lane's finished turns' tokens, whatever the model. */
  get tokens(): Tokens {
    return Object.values(this.byModel).reduce((sum, tokens) => addTokens(sum, tokens), { ...ZERO });
  }

  /** No turn running and no message waiting. */
  get idle(): boolean {
    return this.started && this.child === null && this.queue.length === 0;
  }

  /** The lane's whole run so far, to wait on. */
  get running(): Promise<void> | null {
    return this.pump;
  }

  start(prompt: string): void {
    if (this.started) throw new Error(`${this.label} was already started`);
    this.started = true;
    this.send(prompt);
  }

  /** A message to the lane (the lab's SendMessage): it waits for the lane's current turn, if one runs. */
  send(message: string): void {
    if (!this.started || this.closed) throw new Error(`${this.label} has no open session`);
    this.turns += 1;
    this.settings.emit({ type: "agent_start", label: this.label, turn: this.turns, prompt: message });
    this.queue.push(message);
    this.pump ??= this.drain();
  }

  /** The lane ends once its waiting messages are done (nothing of its is cut off). */
  async retire(): Promise<void> {
    while (!this.idle) await new Promise((resolve) => setTimeout(resolve, 2000));
    this.closed = true;
  }

  /** Ends the lane now (the end of the build). */
  close(): void {
    this.closed = true;
    this.queue.length = 0;
    this.child?.kill("SIGTERM");
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && !this.closed && !this.settings.abort.signal.aborted) {
      const message = this.queue.shift()!;
      this.child = null;
      await this.turn(message);
    }
    this.pump = null;
  }

  private turn(message: string): Promise<void> {
    const name = this.label.replaceAll(" ", "-");
    const file = path.join(this.settings.transcripts, `${name}.jsonl`);
    const turnNumber = this.turns - this.queue.length;
    const promptFile = path.join(this.settings.transcripts, `${name}-turn-${turnNumber}.prompt.txt`);
    writeFileSync(promptFile, `${this.settings.preamble ? `${this.settings.preamble}\n\n` : ""}${message}`);
    return new Promise((resolve) => {
      let failed: string | null = null;
      let finished = false;
      let pending = "";
      const child = spawn(this.settings.muse ?? "muse", museArgs(this.settings, this.session, promptFile), {
        cwd: this.settings.cwd,
        env: { ...process.env, ...this.settings.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.child = child;
      const onAbort = () => child.kill("SIGTERM");
      this.settings.abort.signal.addEventListener("abort", onAbort, { once: true });
      let buffer = "";
      let stderr = "";
      const line = (text: string) => {
        appendFileSync(file, `${text}\n`);
        const event = parseMuseLine(text);
        if (!event) return;
        if (event.payload_type === "run.usage") {
          for (const [model, tokens] of Object.entries(museTurnTokens(event.payload?.models))) this.byModel[model] = addTokens(this.byModel[model] ?? { ...ZERO }, tokens);
        }
        if (event.payload_type?.startsWith("run.terminal.")) {
          if (event.payload?.terminal === "completed") {
            this.completed += 1;
            finished = true;
            this.lastText = event.payload.text ?? pending;
          } else {
            failed = event.payload?.reason ?? event.payload?.terminal ?? "the turn failed";
          }
        }
        const mapped = sdkMessages(event, this.parentToolUseId, turnNumber, pending);
        pending = mapped.pending;
        for (const sdk of mapped.messages) this.settings.emit({ type: "message", message: sdk });
      };
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          line(buffer.slice(0, newline).trim());
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        appendFileSync(path.join(this.settings.transcripts, "stderr.log"), chunk);
        stderr = `${stderr}${chunk.toString("utf8")}`.slice(-2000);
      });
      const end = (detail: string | null) => {
        if (buffer.trim()) line(buffer.trim());
        buffer = "";
        this.settings.abort.signal.removeEventListener("abort", onAbort);
        this.child = null;
        const aborted = this.settings.abort.signal.aborted;
        this.lastStatus = aborted ? "aborted" : finished && !failed ? "success" : "error";
        const lastError = stderr.trim().split("\n").filter((entry) => !entry.startsWith("muse: ")).pop();
        this.settings.emit({
          type: "agent_end",
          label: this.label,
          turn: this.completed,
          status: this.lastStatus,
          detail: aborted ? null : (failed ?? (finished ? null : (lastError ?? detail ?? "the Muse process ended without finishing its turn"))),
        });
        resolve();
      };
      child.on("error", (error) => end(`muse did not start: ${error.message}`));
      child.on("close", (code) => end(code === 0 ? null : `muse exited ${code}`));
    });
  }
}
