import { existsSync, readFileSync } from "node:fs";

/**
 * Token usage and cost of one agent, read from its persisted session
 * transcript (~/.claude/projects/<cwd>/<session>.jsonl), as the lab's
 * cost.py reads them: a streamed message is logged once per content block,
 * so records are keyed by message id and the largest value of each count is
 * kept; cache writes are split into 5-minute and 1-hour TTLs.
 */

export type Tokens = { in: number; out: number; cw5: number; cw1h: number; cr: number };

/** USD per million tokens. */
export type Prices = { input: number; output: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number };

export const ZERO: Tokens = { in: 0, out: 0, cw5: 0, cw1h: 0, cr: 0 };

export function addTokens(a: Tokens, b: Tokens): Tokens {
  return { in: a.in + b.in, out: a.out + b.out, cw5: a.cw5 + b.cw5, cw1h: a.cw1h + b.cw1h, cr: a.cr + b.cr };
}

export function costUsd(tokens: Tokens, prices: Prices): number {
  return (
    (tokens.in * prices.input +
      tokens.out * prices.output +
      tokens.cw5 * prices.cacheWrite5m +
      tokens.cw1h * prices.cacheWrite1h +
      tokens.cr * prices.cacheRead) /
    1e6
  );
}

type UsageRecord = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};

export type TranscriptUsage = { tokens: Tokens; messages: number; models: Record<string, number> };

export function transcriptUsage(file: string): TranscriptUsage {
  const seen = new Map<string, Tokens>();
  const models: Record<string, number> = {};
  if (!existsSync(file)) return { tokens: { ...ZERO }, messages: 0, models };
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let record: { message?: { id?: string; model?: string; usage?: UsageRecord } };
    try {
      record = JSON.parse(line);
    } catch {
      // A line cut off by a write in progress.
      continue;
    }
    const message = record.message;
    const usage = message?.usage;
    if (!usage || !message?.id) continue;
    if (message.model && !seen.has(message.id)) models[message.model] = (models[message.model] ?? 0) + 1;
    const written = usage.cache_creation_input_tokens ?? 0;
    const cw1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const cw5 = usage.cache_creation?.ephemeral_5m_input_tokens ?? written - cw1h;
    const next: Tokens = {
      in: usage.input_tokens ?? 0,
      out: usage.output_tokens ?? 0,
      cw5,
      cw1h,
      cr: usage.cache_read_input_tokens ?? 0,
    };
    const previous = seen.get(message.id) ?? ZERO;
    seen.set(message.id, {
      in: Math.max(previous.in, next.in),
      out: Math.max(previous.out, next.out),
      cw5: Math.max(previous.cw5, next.cw5),
      cw1h: Math.max(previous.cw1h, next.cw1h),
      cr: Math.max(previous.cr, next.cr),
    });
  }
  let tokens = { ...ZERO };
  for (const value of seen.values()) tokens = addTokens(tokens, value);
  return { tokens, messages: seen.size, models };
}
