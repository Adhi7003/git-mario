// Headless level runtime: build a level's world from its setup script and check goals.
// Used by the game UI and by tests/levels.mjs.
import { Env } from '../env.js';
import { HOME, dirname, tilde } from '../vfs.js';
import { runLine } from '../shell.js';
import { stripAnsi } from '../util.js';
import { Repo, copyCommits } from '../git/repo.js';
import { computeStatus } from '../git/status.js';

function runStep(env, step) {
  if (typeof step === 'object') {
    const abs = env.fs.resolve(env.cwd, step.file);
    env.fs.mkdirp(dirname(abs));
    env.fs.write(abs, step.text.endsWith('\n') ? step.text : step.text + '\n');
    return;
  }
  if (step.startsWith('@remote ')) {
    const [, url, dir] = step.split(/\s+/);
    const abs = env.fs.resolve(env.cwd, dir);
    const repo = env.repoAt(abs);
    const R = new Repo({ bare: true, branch: repo.head.branch });
    copyCommits(repo, R, [...Object.values(repo.branches), ...Object.values(repo.tags)]);
    R.branches = { ...repo.branches };
    R.tags = { ...repo.tags };
    env.remotes[url] = R;
    if (env.cwd.startsWith(abs)) env.cwd = HOME;
    env.fs.remove(abs);
    return;
  }
  if (step.startsWith('@emptyremote ')) {
    env.remotes[step.split(/\s+/)[1]] = new Repo({ bare: true });
    return;
  }
  const r = runLine(env, step);
  if (r.editor) r.editor.onSave(r.editor.content);
  if (r.err) throw new Error(`Level setup failed at "${step}": ${stripAnsi(r.chunks.map((c) => c.text).join('\n'))}`);
}

export function buildLevel(level, identity = {}) {
  const env = new Env();
  for (const step of level.setup || []) runStep(env, step);
  env.cwd = env.fs.resolve(HOME, level.start || '~');
  env.prevCwd = env.cwd;
  env.history = [];
  env.config['user.name'] = identity.name || 'Player';
  env.config['user.email'] = identity.email || 'player@mushroom.kingdom';
  if (level.noIdentity) { delete env.config['user.name']; delete env.config['user.email']; }
  return env;
}

// The object goal checks receive. Paths are relative to the home folder (~).
export function makeState(env, level) {
  const abs = (p = '') => env.fs.resolve(HOME, p.replace(/^~\/?/, ''));
  const s = {
    env,
    repo: (p = level.repo || 'kart-stats') => env.repoAt(abs(p)),
    remote: (url) => env.remotes[url || level.remote],
    in: (p) => env.cwd === abs(p),
    cwd: () => tilde(env.cwd),
    file: (p) => env.fs.read(abs(p)),
    exists: (p) => !!env.fs.get(abs(p)),
    isDir: (p) => env.fs.isDir(abs(p)),
    ran: (re) => env.history.some((h) => re.test(h.cmd)),
    ranOk: (re) => env.history.some((h) => re.test(h.cmd) && !h.err),
    said: (re) => env.history.some((h) => re.test(h.out)),
    last: (re) => { const h = env.history[env.history.length - 1]; return !!h && re.test(h.cmd); },
    lastOk: (re) => { const h = env.history[env.history.length - 1]; return !!h && !h.err && re.test(h.cmd); },
    status: (p = level.repo || 'kart-stats') => { const r = env.repoAt(abs(p)); return r ? computeStatus(env, r, abs(p)) : null; },
    clean: (p) => !!s.status(p)?.clean,
    msg: (repo, rev = 'HEAD') => { const id = repo?.resolve(rev); return id ? repo.commits[id].message : null; },
    tree: (repo, rev = 'HEAD') => { const id = repo?.resolve(rev); return id ? repo.commits[id].tree : {}; },
    count: (repo, rev = 'HEAD') => { const id = repo?.resolve(rev); return id ? repo.ancestors(id).size : 0; },
    contains: (repo, rev, other) => { const a = repo?.resolve(rev); return !!a && !!other && repo.ancestors(a).has(other); },
    findMsg: (repo, re) => Object.values(repo?.commits || {}).filter((c) => re.test(c.message)),
  };
  return s;
}

// Evaluate goals; goals stay done once reached ("sticky"). `seq` goals need all earlier goals done.
export function checkGoals(level, env, done) {
  const s = makeState(env, level);
  const fresh = [];
  level.goals.forEach((g, i) => {
    if (done.has(i)) return;
    if (g.seq && ![...Array(i).keys()].every((j) => done.has(j))) return;
    let hit = false;
    try { hit = !!g.c(s); } catch (e) { hit = false; }
    if (hit) { done.add(i); fresh.push(i); }
  });
  return fresh;
}
