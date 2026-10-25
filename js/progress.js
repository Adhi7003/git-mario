// Player progress in localStorage (guarded: the game still works if storage is unavailable).
const KEY = 'gitquest.v1';
const DEFAULTS = () => ({
  done: {},            // levelId -> {stars, coins}
  bonus: 0,            // coins from daily recall
  days: [],            // YYYY-MM-DD dates with activity
  quizDay: null,
  identity: { name: '', email: '' },
  settings: { sound: true, coach: true, unlockAll: false },
  seenWelcome: false,
});

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) { const d = DEFAULTS(); return { ...d, ...raw, settings: { ...d.settings, ...raw.settings }, identity: { ...d.identity, ...raw.identity } }; }
  } catch { /* storage blocked or corrupt */ }
  return DEFAULTS();
}

export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function resetProgress() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return DEFAULTS();
}

export function markDay(p) {
  const t = today();
  if (!p.days.includes(t)) p.days = [...p.days, t].slice(-400);
}

export function streak(p) {
  const set = new Set(p.days);
  const d = new Date();
  if (!set.has(today(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(today(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const totalCoins = (p) => Object.values(p.done).reduce((a, r) => a + (r.coins || 0), 0) + (p.bonus || 0);
export const totalStars = (p) => Object.values(p.done).reduce((a, r) => a + (r.stars || 0), 0);
