import w0 from './w0-terminal.js';
import w1 from './w1-commits.js';
import w2 from './w2-time.js';
import w3 from './w3-branches.js';
import w4 from './w4-conflicts.js';
import w5 from './w5-remotes.js';
import w6 from './w6-advanced.js';

export const WORLDS = [w0, w1, w2, w3, w4, w5, w6];
export const LEVELS = WORLDS.flatMap((w) => w.levels.map((l) => ({ ...l, world: w.id })));
export const levelById = (id) => LEVELS.find((l) => l.id === id);
