// Shared plumbing for git commands: arg parsing, ctx, tree movement, commit creation, output formatting.
import { C, short, plural, union, firstLine, gitDate, sha } from '../util.js';
import { diffStat, hunkLines } from './diff.js';
import { workTree, mergeTrees } from './status.js';

export const ok = (out, coach) => ({ out, coach });
export const fail = (out, coach) => ({ out, err: true, coach });

// Minimal option parser. `valued` lists options that take a value (e.g. ['-m']).
export function parse(args, valued = []) {
  const o = { flags: new Set(), vals: {}, pos: [], dashdash: null };
  const push = (k, v) => (o.vals[k] = o.vals[k] || []).push(v);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { o.dashdash = args.slice(i + 1); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) push(a.slice(0, eq), a.slice(eq + 1));
      else if (valued.includes(a)) push(a, args[++i]);
      else o.flags.add(a);
    } else if (/^-\d+$/.test(a)) {
      push('-n', a.slice(1));
    } else if (a.startsWith('-') && a.length > 1) {
      const letters = a.slice(1);
      for (let j = 0; j < letters.length; j++) {
        const f = '-' + letters[j];
        if (valued.includes(f)) { push(f, letters.slice(j + 1) || args[++i]); break; }
        o.flags.add(f);
      }
    } else o.pos.push(a);
  }
  return o;
}

export function makeCtx(env) {
  const found = env.findRepo();
  const ctx = { env, fs: env.fs, repo: found?.repo || null, root: found?.root || null };
  ctx.work = () => workTree(env, ctx.root);
  ctx.rel = (arg) => {
    const abs = env.fs.resolve(env.cwd, arg);
    if (abs === ctx.root) return '';
    return abs.startsWith(ctx.root + '/') ? abs.slice(ctx.root.length + 1) : null;
  };
  ctx.write = (p, content) => env.fs.setFile(ctx.root, p, content);
  return ctx;
}

const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

// Match pathspecs (relative to cwd) against candidate repo paths.
export function matchPaths(ctx, specs, candidates) {
  const out = new Set(), missing = [];
  for (const spec of specs) {
    const rel = ctx.rel(spec);
    if (rel === null) return { outside: spec, paths: [], missing: [] };
    let hits;
    if (/[*?]/.test(rel)) {
      const re = globRe(rel);
      hits = candidates.filter((p) => re.test(p) || re.test(p.split('/').pop()));
    } else hits = rel === '' ? candidates : candidates.filter((p) => p === rel || p.startsWith(rel + '/'));
    if (!hits.length) missing.push(spec);
    hits.forEach((h) => out.add(h));
  }
  return { paths: [...out].sort(), missing };
}

export const sameTree = (a, b) => union(a, b).every((p) => a[p] === b[p]);
export const cleanMsg = (text) => text.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();

// "N files changed, X insertions(+), Y deletions(-)" plus create/delete mode lines.
export function summaryLines(before, after) {
  const files = union(before, after).filter((p) => before[p] !== after[p]);
  let add = 0, del = 0;
  const modes = [];
  for (const p of files) {
    const d = diffStat(before[p], after[p]);
    add += d.add; del += d.del;
    if (before[p] === undefined) modes.push(` create mode 100644 ${p}`);
    if (after[p] === undefined) modes.push(` delete mode 100644 ${p}`);
  }
  const parts = [` ${plural(files.length, 'file')} changed`];
  if (add || !del) parts.push(`${plural(add, 'insertion')}(+)`);
  if (del || !add) parts.push(`${plural(del, 'deletion')}(-)`);
  return [parts.join(', '), ...modes];
}

// Per-file stat rows (used by fast-forward merges and pulls).
export function fileStatLines(before, after) {
  const files = union(before, after).filter((p) => before[p] !== after[p]);
  if (!files.length) return [];
  const w = Math.max(...files.map((p) => p.length));
  const rows = files.map((p) => {
    const d = diffStat(before[p], after[p]);
    return ` ${p.padEnd(w)} | ${String(d.add + d.del).padStart(2)} ${C.green('+'.repeat(Math.min(d.add, 30)))}${C.red('-'.repeat(Math.min(d.del, 30)))}`;
  });
  return [...rows, ...summaryLines(before, after)];
}

const blob = (content) => (content === undefined ? '0000000' : short(sha('blob ' + content)));

export function diffTrees(a, b, paths = null) {
  const out = [];
  for (const p of union(a, b)) {
    if (a[p] === b[p] || (paths && !paths.includes(p))) continue;
    out.push(C.bold(`diff --git a/${p} b/${p}`));
    if (a[p] === undefined) out.push(C.bold('new file mode 100644'), C.bold(`index 0000000..${blob(b[p])}`), C.bold('--- /dev/null'), C.bold(`+++ b/${p}`));
    else if (b[p] === undefined) out.push(C.bold('deleted file mode 100644'), C.bold(`index ${blob(a[p])}..0000000`), C.bold(`--- a/${p}`), C.bold('+++ /dev/null'));
    else out.push(C.bold(`index ${blob(a[p])}..${blob(b[p])} 100644`), C.bold(`--- a/${p}`), C.bold(`+++ b/${p}`));
    out.push(...hunkLines(a[p], b[p]));
  }
  return out;
}

// Move HEAD's checked-out files from the current commit to commit `id`, carrying local changes
// when safe (like git checkout). Returns an error string or null.
export function moveTo(ctx, id, verb = 'checkout') {
  const { repo } = ctx;
  const H = repo.headTree(), T = repo.tree(id), I = repo.index, W = ctx.work();
  const problems = [], untracked = [];
  for (const p of union(H, T)) {
    if (H[p] === T[p]) continue;
    const dirty = I[p] !== H[p] || W[p] !== I[p];
    if (dirty && !(I[p] === T[p] && W[p] === T[p])) problems.push(p);
  }
  for (const p of Object.keys(T)) if (!(p in H) && !(p in I) && W[p] !== undefined && W[p] !== T[p]) untracked.push(p);
  if (problems.length)
    return `error: Your local changes to the following files would be overwritten by ${verb}:\n${problems.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you ${verb === 'checkout' ? 'switch branches' : verb}.\nAborting`;
  if (untracked.length)
    return `error: The following untracked working tree files would be overwritten by ${verb}:\n${untracked.map((p) => '\t' + p).join('\n')}\nPlease move or remove them before you ${verb === 'checkout' ? 'switch branches' : verb}.\nAborting`;
  for (const p of union(H, T)) {
    if (H[p] === T[p]) continue;
    if (T[p] === undefined) delete I[p];
    else I[p] = T[p];
    ctx.write(p, T[p]);
  }
  return null;
}

// Make index + tracked working files exactly match commit `id` (untracked files are kept).
export function hardReset(ctx, id) {
  const { repo } = ctx;
  const T = repo.tree(id), W = ctx.work();
  for (const p of union(repo.index, T)) if (W[p] !== T[p]) ctx.write(p, T[p]);
  repo.index = { ...T };
}

// Tracked files that have local (staged or unstaged) changes among `paths`.
export function dirtyPaths(ctx, paths) {
  const { repo } = ctx;
  const H = repo.headTree(), I = repo.index, W = ctx.work();
  return paths.filter((p) => I[p] !== H[p] || (p in I ? W[p] !== I[p] : W[p] !== undefined));
}

export function applyResult(ctx, res) {
  const { repo } = ctx;
  const W = ctx.work();
  for (const p of union(repo.index, res.index, res.work)) {
    if (res.index[p] === undefined) delete repo.index[p];
    else repo.index[p] = res.index[p];
    if (W[p] !== res.work[p]) ctx.write(p, res.work[p]);
  }
}

// Three-way merge of commit `c` onto HEAD as a cherry-pick (or its inverse for revert).
export function pickResult(ctx, c, revert = false) {
  const { repo } = ctx;
  const label = `${short(c.id)} (${firstLine(c.message)})`;
  return revert
    ? mergeTrees(repo.tree(c.id), repo.headTree(), repo.tree(c.parents[0]), { ours: 'HEAD', theirs: `parent of ${label}` })
    : mergeTrees(repo.tree(c.parents[0]), repo.headTree(), repo.tree(c.id), { ours: 'HEAD', theirs: label });
}

export function hasIdentity(env, repo) {
  return env.getConfig('user.name', repo) && env.getConfig('user.email', repo);
}

export const IDENTITY_ERROR = `Author identity unknown

*** Please tell me who you are.

Run

  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"

to set your account's default identity.
Omit --global to set the identity only in this repository.

fatal: unable to auto-detect email address (got 'player@mushroom.(none)')`;

// Create a commit from the index. Handles root commits, amend and merge parents.
export function makeCommit(ctx, rawMessage, { amend = false, quiet = false } = {}) {
  const { repo, env } = ctx;
  const message = cleanMsg(rawMessage);
  if (!message) return fail('Aborting commit due to empty commit message.');
  const headId = repo.headId();
  const old = headId && repo.commits[headId];
  let parents = amend ? old.parents : headId ? [headId] : [];
  const merging = repo.op?.type === 'merge';
  if (merging) parents = [...parents, repo.op.theirs];
  const parentTree = repo.tree(parents[0]);
  const id = repo.createCommit(env, repo.index, parents, message);
  const kind = amend ? ' (amend)' : !parents.length ? ' (initial)' : merging ? ' (merge)' : '';
  repo.setHeadId(id, `commit${kind}: ${firstLine(message)}`);
  if (repo.op && repo.op.type !== 'rebase') repo.op = null;
  const where = repo.head.branch !== undefined ? repo.head.branch : 'detached HEAD';
  const lines = [`[${where}${!parents.length ? ' (root-commit)' : ''} ${short(id)}] ${firstLine(message)}`];
  if (amend) lines.push(` Date: ${gitDate(old.time)}`);
  if (!merging && !quiet) lines.push(...summaryLines(parentTree, repo.index));
  return ok(lines.join('\n'),
    amend ? `🔧 You replaced the last commit with a fixed-up version (new id ${short(id)}). Only amend commits you haven't pushed yet!`
      : `🪙 Snapshot saved! Commit ${short(id)} is a permanent save point on ${where}. Watch the new coin appear in the graph →`);
}

// Ask the terminal to open the editor modal (like git launching Vim/nano).
export function editorFor(content, onSave, { title = 'COMMIT_EDITMSG', onCancel, coach } = {}) {
  return {
    out: '',
    coach: coach || '📝 Git opened a text editor for the message. In a real terminal this is often Vim: press i to type, then Esc and type :wq + Enter to save & quit. Tip: use -m "message" to skip the editor.',
    editor: { title, content, onSave, onCancel: onCancel || (() => fail('Aborting commit due to empty commit message.')) },
  };
}

export function decorations(repo, id, { remoteRepo = false } = {}) {
  const parts = [];
  const head = repo.headId() === id && !repo.bare;
  if (head && repo.head.branch !== undefined) parts.push(C.boldCyan('HEAD -> ') + C.boldGreen(repo.head.branch));
  else if (head) parts.push(C.boldCyan('HEAD'));
  for (const [t, tid] of Object.entries(repo.tags)) if (tid === id) parts.push(C.boldYellow(`tag: ${t}`));
  for (const [r, rid] of Object.entries(repo.remoteRefs)) if (rid === id) parts.push(C.boldRed(r));
  for (const [rn, b] of Object.entries(repo.remoteHead)) if (repo.remoteRefs[`${rn}/${b}`] === id) parts.push(C.boldRed(`${rn}/HEAD`));
  for (const [b, bid] of Object.entries(repo.branches)) if (bid === id && !(head && b === repo.head.branch)) parts.push(C.boldGreen(b));
  return parts.length ? C.yellow('(') + parts.join(C.yellow(', ')) + C.yellow(')') : '';
}

export function opBlock(repo) {
  if (!repo.op) return null;
  if (repo.op.conflicts?.length) return `error: you need to resolve your current index first\n${repo.op.conflicts.map((p) => `${p}: needs merge`).join('\n')}`;
  const names = { merge: 'merging', rebase: 'rebasing', 'cherry-pick': 'cherry-picking', revert: 'reverting' };
  return `fatal: cannot switch branch while ${names[repo.op.type]}\nConsider "git ${repo.op.type} --abort" to cancel, or finish it first.`;
}

export const validBranch = (n) => !!n && !/[\s~^:?*[\\]|\.\.|^-|\/$|\.lock$|^@$/.test(n);
