/** Normalize for comparison: lowercase, strip punctuation except apostrophe in contractions */
export function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9']/g, "");
}

export function tokenizeScript(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => normalizeToken(w))
    .filter(Boolean);
}

export function tokenizeTranscript(text: string): string[] {
  return tokenizeScript(text);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cur =
        a[i - 1] === b[j - 1]
          ? row[j - 1]
          : 1 + Math.min(row[j - 1], row[j], prev);
      row[j - 1] = prev;
      prev = cur;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Fuzzy token match for ASR noise, accents, light mispronunciation */
export function tokensFuzzyEqual(scriptTok: string, spokenTok: string): boolean {
  if (!scriptTok || !spokenTok) return false;
  if (scriptTok === spokenTok) return true;
  const maxDist =
    scriptTok.length <= 4 ? 1 : scriptTok.length <= 8 ? 2 : 3;
  return levenshtein(scriptTok, spokenTok) <= maxDist;
}

/**
 * How many leading script words are covered by spoken tokens in order.
 * Spoken may contain ad-libbed words between matches (skipped in transcript).
 * Stops when the next script word cannot be found within `lookahead` spoken tokens.
 */
export function countMatchedScriptWords(
  scriptWords: string[],
  spokenWords: string[],
  lookahead: number
): number {
  let t = 0;
  let matched = 0;
  for (let s = 0; s < scriptWords.length; s++) {
    const limit = Math.min(t + lookahead, spokenWords.length);
    let found = false;
    for (let k = t; k < limit; k++) {
      if (tokensFuzzyEqual(scriptWords[s], spokenWords[k])) {
        t = k + 1;
        matched = s + 1;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return matched;
}
