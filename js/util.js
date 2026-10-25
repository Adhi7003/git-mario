// Shared helpers: ANSI colors (the terminal renders them), hashing, dates.

const wrap = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
export const C = {
  red: wrap(31), green: wrap(32), yellow: wrap(33), blue: wrap(34), cyan: wrap(36),
  bold: wrap(1), dim: wrap(2),
  boldRed: wrap('1;31'), boldGreen: wrap('1;32'), boldYellow: wrap('1;33'), boldCyan: wrap('1;36'), boldBlue: wrap('1;34'),
};
export const stripAnsi = (s) => s.replace(/\x1b\[[\d;]*m/g, '');

function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Deterministic 40-hex "sha" so levels always produce the same commit ids.
export function sha(str) {
  let out = '';
  for (let seed = 0; out.length < 40; seed++) out += cyrb53(str, seed).toString(16).padStart(14, '0');
  return out.slice(0, 40);
}
export const short = (id) => id.slice(0, 7);

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BASE = Date.UTC(2026, 9, 2, 9, 0, 0);
export function gitDate(clock) {
  const d = new Date(BASE + clock * 7 * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} 2026 +0000`;
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const union = (...objs) => [...new Set(objs.flatMap((o) => Object.keys(o)))].sort();
export const firstLine = (msg) => msg.split('\n')[0];

export function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
