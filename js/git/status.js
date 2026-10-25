// Working tree helpers, status computation and tree-level three-way merge.
import { C, union, plural, short } from '../util.js';
import { merge3 } from './diff.js';

export const workTree = (env, root) => env.fs.walkFiles(root);

function globToRegex(glob) {
  return new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$');
}

export function ignorePatterns(work) {
  return (work['.gitignore'] || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

export function isIgnored(patterns, path) {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  for (const pat of patterns) {
    if (pat.endsWith('/')) {
      const d = pat.slice(0, -1).replace(/^\//, '');
      if (parts.slice(0, -1).some((p, i) => p === d || parts.slice(0, i + 1).join('/') === d)) return true;
    } else if (pat.includes('*') || pat.includes('?')) {
      const re = globToRegex(pat.replace(/^\//, ''));
      if (re.test(name) || re.test(path)) return true;
    } else {
      const p = pat.replace(/^\//, '');
      if (name === p || path === p || path.startsWith(p + '/')) return true;
    }
  }
  return false;
}

export function computeStatus(env, repo, root) {
  const H = repo.headTree(), I = repo.index, W = workTree(env, root);
  const conflicts = repo.op?.conflicts || [];
  const staged = [], unstaged = [], untracked = [];
  for (const p of union(H, I)) {
    if (conflicts.includes(p) || H[p] === I[p]) continue;
    staged.push({ path: p, type: H[p] === undefined ? 'new file' : I[p] === undefined ? 'deleted' : 'modified' });
  }
  for (const p of Object.keys(I).sort()) {
    if (conflicts.includes(p)) continue;
    if (W[p] === undefined) unstaged.push({ path: p, type: 'deleted' });
    else if (W[p] !== I[p]) unstaged.push({ path: p, type: 'modified' });
  }
  const pats = ignorePatterns(W);
  for (const p of Object.keys(W).sort()) if (!(p in I) && !conflicts.includes(p) && !isIgnored(pats, p)) untracked.push(p);
  return { staged, unstaged, untracked, conflicts: [...conflicts], work: W, clean: !staged.length && !unstaged.length && !untracked.length && !conflicts.length };
}

// Collapse untracked files into "dir/" when nothing in that dir is tracked (like git).
function collapseUntracked(untracked, index) {
  const out = new Set();
  for (const p of untracked) {
    const top = p.split('/')[0];
    if (p.includes('/') && !Object.keys(index).some((q) => q.startsWith(top + '/'))) out.add(top + '/');
    else out.add(p);
  }
  return [...out];
}

export function trackingInfo(repo) {
  const b = repo.head.branch;
  const up = b !== undefined && repo.upstream[b];
  if (!up) return null;
  const local = repo.branches[b], remote = repo.remoteRefs[up];
  if (!remote) return { up, gone: true };
  return { up, ahead: local ? repo.between(remote, local).length : 0, behind: local ? repo.between(local, remote).length : 0 };
}

export function trackingText(repo) {
  const t = trackingInfo(repo);
  if (!t) return [];
  if (t.gone) return [`Your branch is based on '${t.up}', but the upstream is gone.`, `  (use "git branch --unset-upstream" to fixup)`];
  if (t.ahead && t.behind) return [`Your branch and '${t.up}' have diverged,`, `and have ${t.ahead} and ${t.behind} different commits each, respectively.`, `  (use "git pull" if you want to integrate the remote branch with yours)`];
  if (t.ahead) return [`Your branch is ahead of '${t.up}' by ${plural(t.ahead, 'commit')}.`, `  (use "git push" to publish your local commits)`];
  if (t.behind) return [`Your branch is behind '${t.up}' by ${plural(t.behind, 'commit')}, and can be fast-forwarded.`, `  (use "git pull" to update your local branch)`];
  return [`Your branch is up to date with '${t.up}'.`];
}

const pad = (type) => (type + ':').padEnd(12);

export function statusText(env, repo, root) {
  const st = computeStatus(env, repo, root);
  const L = [];
  const op = repo.op;
  if (op?.type === 'rebase') {
    L.push(`rebase in progress; onto ${short(op.onto)}`);
    L.push(`You are currently rebasing branch '${op.branch}' on '${short(op.onto)}'.`);
    L.push(st.conflicts.length ? '  (fix conflicts and then run "git rebase --continue")' : '  (all conflicts fixed: run "git rebase --continue")');
    L.push('  (use "git rebase --skip" to skip this patch)', '  (use "git rebase --abort" to check out the original branch)');
  } else if (repo.head.branch !== undefined) {
    L.push(`On branch ${repo.head.branch}`);
  } else {
    L.push(C.red(`HEAD detached at ${short(repo.head.detached)}`));
  }
  if (!op || op.type !== 'rebase') L.push(...trackingText(repo));
  if (op?.type === 'merge') {
    if (st.conflicts.length) L.push('You have unmerged paths.', '  (fix conflicts and run "git commit")', '  (use "git merge --abort" to abort the merge)');
    else L.push('All conflicts fixed but you are still merging.', '  (use "git commit" to conclude merge)');
  }
  if (op?.type === 'cherry-pick' || op?.type === 'revert') {
    const verb = op.type === 'revert' ? 'reverting' : 'cherry-picking';
    L.push(`You are currently ${verb} commit ${short(op.commit)}.`);
    L.push(st.conflicts.length ? `  (fix conflicts and run "git ${op.type} --continue")` : `  (all conflicts fixed: run "git ${op.type} --continue")`);
    L.push(`  (use "git ${op.type} --abort" to cancel the ${op.type} operation)`);
  }
  const noCommits = !repo.headId();
  if (noCommits) L.push('', 'No commits yet');
  if (st.staged.length) {
    L.push('', 'Changes to be committed:', noCommits ? '  (use "git rm --cached <file>..." to unstage)' : '  (use "git restore --staged <file>..." to unstage)');
    for (const s of st.staged) L.push('\t' + C.green(pad(s.type) + s.path));
  }
  if (st.conflicts.length) {
    L.push('', 'Unmerged paths:', '  (use "git add <file>..." to mark resolution)');
    for (const p of st.conflicts) L.push('\t' + C.red('both modified:   ' + p));
  }
  if (st.unstaged.length) {
    L.push('', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)', '  (use "git restore <file>..." to discard changes in working directory)');
    for (const s of st.unstaged) L.push('\t' + C.red(pad(s.type) + s.path));
  }
  if (st.untracked.length) {
    L.push('', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)');
    for (const p of collapseUntracked(st.untracked, repo.index)) L.push('\t' + C.red(p));
  }
  L.push('');
  if (st.staged.length) L.pop();
  else if (st.unstaged.length || st.conflicts.length) L.push('no changes added to commit (use "git add" and/or "git commit -a")');
  else if (st.untracked.length) L.push('nothing added to commit but untracked files present (use "git add" to track)');
  else if (noCommits) L.push('nothing to commit (create/copy files and use "git add" to track)');
  else L.push('nothing to commit, working tree clean');
  return { text: L.join('\n'), st };
}

// Three-way merge of whole trees. Returns {index, work, conflicts, messages}.
export function mergeTrees(base, ours, theirs, labels) {
  const index = {}, work = {}, conflicts = [], messages = [];
  for (const p of union(base, ours, theirs)) {
    const b = base[p], o = ours[p], t = theirs[p];
    let iv, wv;
    if (o === t) iv = wv = o;
    else if (b === o) iv = wv = t;
    else if (b === t) iv = wv = o;
    else if (o === undefined || t === undefined) {
      iv = wv = o ?? t;
      conflicts.push(p);
      const del = o === undefined ? 'HEAD' : labels.theirs, mod = o === undefined ? labels.theirs : 'HEAD';
      messages.push(`CONFLICT (modify/delete): ${p} deleted in ${del} and modified in ${mod}.  Version ${mod} of ${p} left in tree.`);
    } else {
      messages.push(`Auto-merging ${p}`);
      const m = merge3(b ?? '', o, t, labels);
      wv = m.text;
      iv = m.conflict ? o : m.text;
      if (m.conflict) {
        conflicts.push(p);
        messages.push(`CONFLICT (${b === undefined ? 'add/add' : 'content'}): Merge conflict in ${p}`);
      }
    }
    if (iv !== undefined) index[p] = iv;
    if (wv !== undefined) work[p] = wv;
  }
  return { index, work, conflicts, messages };
}
