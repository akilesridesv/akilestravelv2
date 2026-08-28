// Accent- and typo-tolerant matching, used by search bars and the copilot so
// "Jose" finds "José", small misspellings still match, and we can suggest the
// closest record to what the user typed.

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Tolerance grows with query length. */
function tolerance(len: number): number {
  return len <= 3 ? 1 : len <= 7 ? 2 : 3;
}

/** True if `query` loosely matches `target` (substring or small typo distance). */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const t = normalize(target);
  if (t.includes(q)) return true;
  const tol = tolerance(q.length);
  if (levenshtein(q, t) <= tol) return true;
  for (const w of t.split(/\s+/)) {
    if (w.startsWith(q)) return true;
    if (levenshtein(q, w) <= tol) return true;
  }
  return false;
}

/** Lower is closer — for ranking suggestions (0 = substring hit). */
export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (!q || t.includes(q)) return 0;
  let best = levenshtein(q, t);
  for (const w of t.split(/\s+/)) best = Math.min(best, levenshtein(q, w));
  return best;
}

/** Closest item from a list with its score (lower = closer); null if empty. */
export function bestFuzzy<T>(
  query: string,
  items: T[],
  key: (t: T) => string
): { item: T; score: number } | null {
  let best: T | null = null;
  let bestScore = Infinity;
  for (const it of items) {
    const s = fuzzyScore(query, key(it));
    if (s < bestScore) {
      bestScore = s;
      best = it;
    }
  }
  return best ? { item: best, score: bestScore } : null;
}
