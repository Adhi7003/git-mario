// The git object model: commits, refs, HEAD, index, remotes, stash and in-progress operations.
import { sha, short, firstLine } from '../util.js';

export class Repo {
  constructor({ bare = false, branch = 'main' } = {}) {
    this.bare = bare;
    this.commits = {};      // id -> {id, parents, tree, message, author, time}
    this.branches = {};     // name -> id
    this.tags = {};         // name -> id
    this.tagMessages = {};  // name -> message (annotated tags)
    this.head = { branch }; // or {detached: id}
    this.index = {};        // path -> content (staged snapshot)
    this.remotes = {};      // name -> url
    this.remoteRefs = {};   // 'origin/main' -> id
    this.remoteHead = {};   // remote name -> default branch
    this.upstream = {};     // branch -> 'origin/main'
    this.stash = [];
    this.op = null;         // in-progress merge / rebase / cherry-pick / revert
    this.config = {};
    this.reflog = [];
    this.prevBranch = null;
  }

  headId() { return this.head.branch !== undefined ? this.branches[this.head.branch] || null : this.head.detached; }
  tree(id) { return id ? { ...this.commits[id].tree } : {}; }
  headTree() { return this.tree(this.headId()); }
  branchName() { return this.head.branch; }

  setHeadId(id, reason) {
    if (this.head.branch !== undefined) this.branches[this.head.branch] = id;
    else this.head.detached = id;
    if (reason) this.log(id, reason);
  }
  log(id, reason) { this.reflog.unshift({ id, reason }); }

  createCommit(env, tree, parents, message) {
    const time = env.tick();
    const author = env.author(this);
    const id = sha(JSON.stringify([tree, parents, message, author, time]));
    this.commits[id] = { id, parents: [...parents], tree: { ...tree }, message, author, time };
    return id;
  }

  // Resolve a revision like HEAD, HEAD~2, main^, origin/main, v1.0, a1b2c3d.
  resolve(rev) {
    if (!rev) return null;
    const m = rev.match(/^(.*?)((?:[~^]\d*)*)$/);
    const base = m[1] || 'HEAD';
    let id = this.resolveName(base);
    if (!id) return null;
    for (const t of m[2].match(/[~^]\d*/g) || []) {
      const n = t.length > 1 ? parseInt(t.slice(1), 10) : 1;
      if (t[0] === '~') {
        for (let i = 0; i < n && id; i++) id = this.commits[id].parents[0] || null;
      } else if (n > 0) id = this.commits[id].parents[n - 1] || null;
      if (!id) return null;
    }
    return id;
  }

  resolveName(name) {
    if (name === 'HEAD' || name === '@') return this.headId();
    const n = name.replace(/^refs\/(heads|tags)\//, '').replace(/^(refs\/)?remotes\//, '');
    if (this.branches[n]) return this.branches[n];
    if (this.tags[n]) return this.tags[n];
    if (this.remoteRefs[n]) return this.remoteRefs[n];
    if (this.remotes[n] && this.remoteRefs[`${n}/${this.remoteHead[n] || 'main'}`]) return this.remoteRefs[`${n}/${this.remoteHead[n] || 'main'}`];
    if (/^[0-9a-f]{4,40}$/.test(name)) {
      const hits = Object.keys(this.commits).filter((id) => id.startsWith(name));
      if (hits.length === 1) return hits[0];
    }
    return null;
  }

  ancestors(id) {
    const seen = new Set();
    const stack = id ? [id] : [];
    while (stack.length) {
      const c = stack.pop();
      if (seen.has(c) || !this.commits[c]) continue;
      seen.add(c);
      stack.push(...this.commits[c].parents);
    }
    return seen;
  }
  isAncestor(a, b) { return this.ancestors(b).has(a); }

  mergeBase(a, b) {
    const A = this.ancestors(a);
    let best = null;
    for (const id of this.ancestors(b)) if (A.has(id) && (!best || this.commits[id].time > this.commits[best].time)) best = id;
    return best;
  }

  // Commits reachable from b but not from a (newest first).
  between(a, b) {
    const A = this.ancestors(a);
    return [...this.ancestors(b)].filter((id) => !A.has(id)).sort((x, y) => this.commits[y].time - this.commits[x].time);
  }

  describe(id) { return `${short(id)} ${firstLine(this.commits[id].message)}`; }

  // Every ref tip (used to find reachable vs abandoned commits).
  refTips() {
    const tips = [...Object.values(this.branches), ...Object.values(this.tags), ...Object.values(this.remoteRefs)];
    if (this.headId()) tips.push(this.headId());
    for (const s of this.stash) tips.push(s.base);
    if (this.op?.orig) tips.push(this.op.orig);
    return tips.filter(Boolean);
  }
}

// Copy commit objects (and their ancestors) from one repo's store into another's.
export function copyCommits(from, to, tipIds) {
  let n = 0;
  for (const tip of tipIds) {
    for (const id of from.ancestors(tip)) {
      if (!to.commits[id]) { to.commits[id] = from.commits[id]; n++; }
    }
  }
  return n;
}
