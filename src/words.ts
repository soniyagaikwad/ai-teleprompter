import { normalizeToken } from "./scriptMatch";

export type ScriptWord = { display: string; norm: string };

export function parseScriptWords(text: string): ScriptWord[] {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((display) => ({
      display,
      norm: normalizeToken(display),
    }))
    .filter((w) => w.norm.length > 0);
}

export const WORDS_PER_LINE = 5;
export const TRANSCRIPT_LOOKAHEAD = 48;
