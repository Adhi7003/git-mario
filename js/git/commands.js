// Local git commands. Each takes (ctx, args) and returns {out, err?, coach?, editor?}.
import { C, short, plural, union, firstLine, gitDate } from '../util.js';
import { join, dirname, basename } from '../vfs.js';
import { Repo } from './repo.js';
import { statusText, computeStatus, trackingText, mergeTrees, ignorePatterns, isIgnored } from './status.js';
import {
  ok, fail, parse, matchPaths, sameTree, summaryLines, fileStatLines, diffTrees, moveTo, hardReset, dirtyPaths,
  applyResult, pickResult, hasIdentity, IDENTITY_ERROR, makeCommit, editorFor, decorations, opBlock, validBranch,
} from './core.js';

// ---------- init / status / add / commit ----------

export function init(ctx, args) {
  const { env, fs } = ctx;
  const o = parse(args, ['-b', '--initial-branch']);
  const dir = o.pos[0] ? fs.resolve(env.cwd, o.pos[0]) : env.cwd;
  fs.mkdirp(dir);
  const gitDir = join(dir, '.git');
  if (fs.get(gitDir)?.repo) return ok(`Reinitialized existing Git repository in ${gitDir}/`, 'This folder was already a repository, so nothing changed.');
  const branch = o.vals['-b']?.[0] || o.vals['--initial-branch']?.[0] || env.getConfig('init.defaultBranch') || 'main';
  fs.get(dir).children['.git'] = { type: 'dir', children: {}, repo: new Repo({ branch }) };
  return ok(`Initialized empty Git repository in ${gitDir}/`,
    `🏁 Level start! A hidden .git folder now stores this project's whole history. Try "ls -a" to spot it. Your first branch is called "${branch}".`);
}

export function status(ctx, args) {
  const { repo, env, root } = ctx;
  const o = parse(args);
  if (o.flags.has('-s') || o.flags.has('--short')) {
    const st = computeStatus(env, repo, root);
    const codes = {};
    const L = { 'new file': 'A', modified: 'M', deleted: 'D' };
    for (const s of st.staged) codes[s.path] = [L[s.type], ' '];
    for (const s of st.unstaged) codes[s.path] = [(codes[s.path] || [' '])[0], L[s.type]];
    const lines = Object.keys(codes).sort().map((p) => C.green(codes[p][0]) + C.red(codes[p][1]) + ' ' + p);
    for (const p of st.conflicts) lines.push(C.red('UU') + ' ' + p);
    for (const p of st.untracked) lines.push(C.red('??') + ' ' + p);
    return ok(lines.join('\n'), 'Short status: left column = staged (green), right column = not staged (red), ?? = untracked.');
  }
  const { text, st } = statusText(env, repo, root);
  let coach = '🔍 status is your radar. Run it whenever you are unsure what git thinks is going on.';
  if (st.conflicts.length) coach = '⚔️ Bowser alert! Open the conflicted files, keep the lines you want, delete the <<<<<<< ======= >>>>>>> markers, then git add them.';
  else if (st.staged.length) coach = '🎒 Green files are staged (in the item bag) and will go into the next commit.';
  else if (st.unstaged.length || st.untracked.length) coach = '🔴 Red files have changes git is NOT saving yet. Use git add to stage them.';
  return ok(text, coach);
}

export function add(ctx, args) {
  const { repo } = ctx;
  const o = parse(args);
  const all = o.flags.has('-A') || o.flags.has('--all');
  const specs = o.pos.length ? o.pos : all ? [ctx.root] : [];
  if (!specs.length) return fail("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\nhint: Disable this message with \"git config set advice.addEmptyPathspec false\"", 'Tell git what to stage: a file name, or "." for everything in this folder.');
  const W = ctx.work();
  const m = matchPaths(ctx, specs, union(W, repo.index));
  if (m.outside) return fail(`fatal: ${m.outside}: '${m.outside}' is outside repository at '${ctx.root}'`);
  if (m.missing.length) return fail(`fatal: pathspec '${m.missing[0]}' did not match any files`, 'Check the file name with ls. Names are case-sensitive.');
  const pats = ignorePatterns(W);
  const ignored = [];
  let n = 0;
  for (const p of m.paths) {
    if (W[p] !== undefined) {
      if (!(p in repo.index) && isIgnored(pats, p) && !o.flags.has('-f')) {
        if (specs.some((s) => ctx.rel(s) === p)) ignored.push(p);
        continue;
      }
      if (repo.index[p] !== W[p]) n++;
      repo.index[p] = W[p];
    } else if (p in repo.index) { delete repo.index[p]; n++; }
    if (repo.op?.conflicts) repo.op.conflicts = repo.op.conflicts.filter((c) => c !== p);
  }
  if (ignored.length) return fail(`The following paths are ignored by one of your .gitignore files:\n${ignored.join('\n')}\nhint: Use -f if you really want to add them.`, '🙈 That file is listed in .gitignore, so git refuses to track it. That is usually what you want for secrets!');
  return ok('', n ? `🎒 Staged ${plural(n, 'change')}: they are now in the item bag, ready for the next commit. (git add prints nothing when it works.)` : 'Nothing new to stage: those files were already staged.');
}

export function commit(ctx, args) {
  const { repo, env } = ctx;
  const o = parse(args, ['-m', '--message']);
  if (!hasIdentity(env, repo)) return fail(IDENTITY_ERROR, '👤 Git needs to know who you are before it can sign your commits. Set user.name and user.email (see the commands above).');
  if (repo.op?.conflicts?.length)
    return fail("error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.", 'Resolve each conflicted file, then git add it, then commit.');
  const amend = o.flags.has('--amend');
  if (o.flags.has('-a') || o.flags.has('--all')) {
    const W = ctx.work();
    for (const p of Object.keys(repo.index)) {
      if (W[p] === undefined) delete repo.index[p];
      else repo.index[p] = W[p];
    }
  }
  if (amend && !repo.headId()) return fail('fatal: You have nothing to amend.');
  const parentTree = amend ? repo.tree(repo.commits[repo.headId()].parents[0]) : repo.headTree();
  if (!amend && !repo.op && sameTree(repo.index, parentTree) && !o.flags.has('--allow-empty')) {
    return fail(statusText(env, repo, ctx.root).text, 'Nothing is staged, so there is nothing to commit. Use git add first.');
  }
  const msgs = [...(o.vals['-m'] || []), ...(o.vals['--message'] || [])];
  if (msgs.some((m) => m === undefined)) return fail("error: switch `m' requires a value");
  if (msgs.length) return makeCommit(ctx, msgs.join('\n\n'), { amend });
  if (o.flags.has('--no-edit')) return makeCommit(ctx, amend ? repo.commits[repo.headId()].message : repo.op?.message || '', { amend });
  const st = computeStatus(env, repo, ctx.root);
  const template = [
    amend ? repo.commits[repo.headId()].message : repo.op?.message || '',
    '# Please enter the commit message for your changes. Lines starting',
    "# with '#' will be ignored, and an empty message aborts the commit.",
    '#',
    `# On branch ${repo.head.branch ?? 'HEAD (detached)'}`,
    '# Changes to be committed:',
    ...st.staged.map((s) => `#\t${(s.type + ':').padEnd(12)}${s.path}`),
  ].join('\n');
  return editorFor(template, (text) => makeCommit(ctx, text, { amend }));
}

// ---------- history ----------

function graphRows(repo, list) {
  const colors = [C.red, C.green, C.yellow, C.blue, C.cyan];
  const draw = (arr) => arr.map((ch, i) => (ch === ' ' ? ' ' : colors[Math.floor(i / 2) % 5](ch))).join('').replace(/\s+$/, '');
  let cols = [];
  const rows = [];
  for (const id of list) {
    const idxs = cols.map((c, i) => (c === id ? i : -1)).filter((i) => i >= 0);
    if (idxs.length > 1) {
      const drop = idxs.slice(1);
      const arr = Array(cols.length * 2).fill(' ');
      cols.forEach((c, i) => {
        if (drop.includes(i) || i > drop[0]) arr[2 * i - 1] = '/';
        else arr[2 * i] = '|';
      });
      rows.push({ prefix: draw(arr) });
      cols = cols.filter((_, i) => !drop.includes(i));
    }
    let col = cols.indexOf(id);
    if (col < 0) { cols.push(id); col = cols.length - 1; }
    const arr = Array(cols.length * 2).fill(' ');
    cols.forEach((_, i) => (arr[2 * i] = i === col ? '*' : '|'));
    rows.push({ id, prefix: draw(arr) });
    const parents = repo.commits[id].parents.filter((p) => repo.commits[p]);
    if (!parents.length) cols.splice(col, 1);
    else {
      cols[col] = parents[0];
      if (parents[1] && !cols.includes(parents[1])) {
        const n = cols.length;
        const e = Array((n + 1) * 2).fill(' ');
        for (let i = 0; i < n; i++) {
          if (i <= col) e[2 * i] = '|';
          else e[2 * i + 1] = '\\';
        }
        e[2 * col + 1] = '\\';
        cols.splice(col + 1, 0, parents[1]);
        rows.push({ prefix: draw(e) });
      }
    }
    rows[rows.length - 1].cont = draw(Array(cols.length * 2).fill(' ').map((_, i) => (i % 2 === 0 ? '|' : ' ')));
  }
  return rows;
}

export function logEntry(repo, id, { oneline = false } = {}) {
  const c = repo.commits[id];
  const deco = decorations(repo, id);
  if (oneline) return [`${C.yellow(short(id))}${deco ? ' ' + deco : ''} ${firstLine(c.message)}`];
  const lines = [C.yellow(`commit ${id}`) + (deco ? ' ' + deco : '')];
  if (c.parents.length > 1) lines.push(`Merge: ${c.parents.map(short).join(' ')}`);
  lines.push(`Author: ${c.author}`, `Date:   ${gitDate(c.time)}`, '', ...c.message.split('\n').map((l) => '    ' + l));
  return lines;
}

export function log(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['-n', '--max-count']);
  const all = o.flags.has('--all');
  if (!repo.headId() && !all) return fail(`fatal: your current branch '${repo.head.branch}' does not have any commits yet`, 'No commits yet! Make your first commit and then look at the log.');
  let ids;
  if (all) ids = new Set(repo.refTips().flatMap((t) => [...repo.ancestors(t)]));
  else if (o.pos.length) {
    ids = new Set();
    for (const p of o.pos) {
      if (p.includes('..')) {
        const [a, b] = p.split('..');
        const ra = repo.resolve(a || 'HEAD'), rb = repo.resolve(b || 'HEAD');
        if (!ra || !rb) return fail(`fatal: ambiguous argument '${p}': unknown revision or path not in the working tree.`);
        repo.between(ra, rb).forEach((x) => ids.add(x));
      } else {
        const r = repo.resolve(p);
        if (!r) return fail(`fatal: ambiguous argument '${p}': unknown revision or path not in the working tree.`);
        repo.ancestors(r).forEach((x) => ids.add(x));
      }
    }
  } else ids = repo.ancestors(repo.headId());
  let list = [...ids].sort((a, b) => repo.commits[b].time - repo.commits[a].time);
  const limit = parseInt((o.vals['-n'] || o.vals['--max-count'] || [])[0], 10);
  if (limit >= 0) list = list.slice(0, limit);
  const oneline = o.flags.has('--oneline');
  const out = [];
  if (o.flags.has('--graph')) {
    for (const row of graphRows(repo, list)) {
      if (!row.id) { out.push(row.prefix); continue; }
      const entry = logEntry(repo, row.id, { oneline });
      out.push(`${row.prefix} ${entry[0]}`);
      for (const l of entry.slice(1)) out.push(`${row.cont} ${l}`.replace(/\s+$/, ''));
      if (!oneline) out.push(row.cont);
    }
  } else {
    list.forEach((id, i) => {
      out.push(...logEntry(repo, id, { oneline }));
      if (!oneline && i < list.length - 1) out.push('');
    });
  }
  return ok(out.join('\n'), oneline
    ? '📜 One line per commit: short id + message. Newest at the top. Copy a short id to use it in other commands.'
    : '📜 Newest commit first. In a real terminal long logs open in a "pager": scroll with arrows/space and press q to quit. Try --oneline for a compact view.');
}

export function show(ctx, args) {
  const { repo } = ctx;
  const o = parse(args);
  const rev = o.pos[0] || 'HEAD';
  const id = repo.resolve(rev);
  if (!id) return fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`);
  const c = repo.commits[id];
  const out = [];
  if (repo.tagMessages[rev]) out.push(C.yellow(`tag ${rev}`), `Tagger: ${c.author}`, '', repo.tagMessages[rev], '');
  out.push(...logEntry(repo, id));
  if (c.parents.length <= 1) {
    const d = diffTrees(repo.tree(c.parents[0]), c.tree);
    if (d.length) out.push('', ...d);
  }
  return ok(out.join('\n'), '🔎 show = the commit details plus exactly what changed in it (green + lines added, red - lines removed).');
}

export function diff(ctx, args) {
  const { repo } = ctx;
  const o = parse(args);
  const staged = o.flags.has('--staged') || o.flags.has('--cached');
  const revs = [], paths = [...(o.dashdash || [])];
  for (const p of o.pos) {
    if (!paths.length && (p.includes('..') || repo.resolve(p))) revs.push(p);
    else paths.push(p);
  }
  const W = ctx.work();
  const tracked = (keys) => Object.fromEntries([...new Set(keys)].filter((p) => W[p] !== undefined).map((p) => [p, W[p]]));
  let A, B;
  if (revs.length === 1 && revs[0].includes('..')) {
    const [a, b] = revs[0].split('..');
    A = repo.tree(repo.resolve(a || 'HEAD')); B = repo.tree(repo.resolve(b || 'HEAD'));
  } else if (staged) {
    A = repo.tree(revs[0] ? repo.resolve(revs[0]) : repo.headId()); B = repo.index;
  } else if (revs.length === 2) {
    A = repo.tree(repo.resolve(revs[0])); B = repo.tree(repo.resolve(revs[1]));
  } else if (revs.length === 1) {
    A = repo.tree(repo.resolve(revs[0])); B = tracked([...Object.keys(repo.index), ...Object.keys(A)]);
  } else {
    A = repo.index; B = tracked(Object.keys(repo.index));
  }
  let filter = null;
  if (paths.length) {
    const m = matchPaths(ctx, paths, union(A, B));
    filter = m.paths;
  }
  if (o.flags.has('--stat')) return ok(fileStatLines(A, B).join('\n'));
  if (o.flags.has('--name-only')) return ok(union(A, B).filter((p) => A[p] !== B[p] && (!filter || filter.includes(p))).join('\n'));
  const out = diffTrees(A, B, filter);
  return ok(out.join('\n'), out.length
    ? (staged ? '🎒 This is what is staged: exactly what your next commit will contain.' : '🔬 Red "-" lines were removed, green "+" lines were added. Plain git diff shows changes you have NOT staged yet.')
    : (staged ? 'Empty output: nothing is staged right now.' : 'Empty output means there are no unstaged changes. (Staged changes need git diff --staged.)'));
}

export function reflog(ctx) {
  const { repo } = ctx;
  if (!repo.reflog.length) return ok('');
  return ok(repo.reflog.map((r, i) => `${C.yellow(short(r.id))} HEAD@{${i}}: ${r.reason}`).join('\n'),
    '🕰 The reflog remembers everywhere HEAD has been, even "lost" commits after a reset. It is your safety net!');
}

// ---------- files ----------

export function restore(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['--source', '-s']);
  const stagedF = o.flags.has('--staged') || o.flags.has('-S');
  const worktree = o.flags.has('--worktree') || o.flags.has('-W') || !stagedF;
  const specs = [...o.pos, ...(o.dashdash || [])];
  if (!specs.length) return fail('fatal: you must specify path(s) to restore');
  const srcRev = (o.vals['--source'] || o.vals['-s'] || [])[0];
  let srcTree;
  if (srcRev) {
    const id = repo.resolve(srcRev);
    if (!id) return fail(`fatal: could not resolve ${srcRev}`);
    srcTree = repo.tree(id);
  } else srcTree = stagedF ? repo.headTree() : repo.index;
  const W = ctx.work();
  const m = matchPaths(ctx, specs, union(srcTree, repo.index));
  if (m.missing.length) return fail(`error: pathspec '${m.missing[0]}' did not match any file(s) known to git`, 'restore only works on files git already tracks. Untracked files are not in git yet.');
  for (const p of m.paths) {
    if (stagedF) {
      if (srcTree[p] === undefined) delete repo.index[p];
      else repo.index[p] = srcTree[p];
    }
    if (worktree) {
      const v = stagedF || srcRev ? srcTree[p] : repo.index[p];
      if (W[p] !== v) ctx.write(p, v);
    }
  }
  return ok('', stagedF && !o.flags.has('--worktree')
    ? '↩️ Unstaged: the file is back out of the item bag. Your edits in the file are still there.'
    : '⏪ The file was reset to its last saved version. Careful: uncommitted edits to it are gone for good!');
}

export function rm(ctx, args) {
  const { repo } = ctx;
  const o = parse(args);
  const cached = o.flags.has('--cached');
  const m = matchPaths(ctx, [...o.pos, ...(o.dashdash || [])], Object.keys(repo.index));
  if (!o.pos.length) return fail('usage: git rm [<options>] [--] <file>...');
  if (m.missing.length) return fail(`fatal: pathspec '${m.missing[0]}' did not match any files`);
  if (!o.flags.has('-r') && o.pos.some((s) => ctx.env.fs.isDir(ctx.env.fs.resolve(ctx.env.cwd, s)))) return fail(`fatal: not removing '${o.pos[0]}' recursively without -r`);
  for (const p of m.paths) {
    delete repo.index[p];
    if (!cached) ctx.write(p, undefined);
  }
  return ok(m.paths.map((p) => `rm '${p}'`).join('\n'), cached ? 'Git stops tracking the file but leaves it on disk (handy after adding a .gitignore).' : 'File deleted AND the deletion is staged for the next commit.');
}

export function mv(ctx, args) {
  const { repo, env } = ctx;
  const o = parse(args);
  if (o.pos.length !== 2) return fail('usage: git mv [<options>] <source>... <destination>');
  const src = ctx.rel(o.pos[0]);
  let dst = ctx.rel(o.pos[1]);
  if (!(src in repo.index)) return fail(`fatal: not under version control, source=${o.pos[0]}, destination=${o.pos[1]}`);
  if (env.fs.isDir(join(ctx.root, dst))) dst = dst ? `${dst}/${basename(src)}` : basename(src);
  const W = ctx.work();
  ctx.write(dst, W[src]);
  ctx.write(src, undefined);
  repo.index[dst] = repo.index[src];
  delete repo.index[src];
  return ok('', 'Renamed the file and staged the rename in one step.');
}

// ---------- branches ----------

function checkoutTarget(ctx, { branch, id }, verb) {
  const { repo } = ctx;
  const oldId = repo.headId(), oldBranch = repo.head.branch;
  if (id && id !== oldId) {
    const err = moveTo(ctx, id, 'checkout');
    if (err) return { err };
  }
  let warn = '';
  if (oldBranch === undefined && oldId && !(branch === undefined && id === oldId)) {
    const reach = new Set();
    for (const t of [...Object.values(repo.branches), ...Object.values(repo.tags), ...Object.values(repo.remoteRefs)]) repo.ancestors(t).forEach((x) => reach.add(x));
    if (!reach.has(oldId)) {
      const lost = [...repo.ancestors(oldId)].filter((x) => !reach.has(x));
      warn = `Warning: you are leaving ${plural(lost.length, 'commit')} behind, not connected to\nany of your branches:\n\n  ${repo.describe(oldId)}\n\nIf you want to keep ${lost.length === 1 ? 'it' : 'them'} by creating a new branch, this may be a good time\nto do so with:\n\n git branch <new-branch-name> ${short(oldId)}\n\n`;
    } else warn = `Previous HEAD position was ${repo.describe(oldId)}\n`;
  }
  if (oldBranch !== undefined && oldBranch !== branch) repo.prevBranch = oldBranch;
  repo.head = branch !== undefined ? { branch } : { detached: id };
  if (id) repo.log(id, `${verb}: moving from ${oldBranch ?? short(oldId || '')} to ${branch ?? short(id)}`);
  return { warn };
}

const switchCoach = (name) => `🍄 Mario (HEAD) jumped to "${name}". Your files now match that branch, and new commits will be added there.`;

function switchTo(ctx, name, verb) {
  const { repo } = ctx;
  if (name === '-') {
    name = repo.prevBranch;
    if (!name) return fail('fatal: invalid reference: @{-1}');
  }
  const track = () => { const t = trackingText(repo); return t.length ? '\n' + t.join('\n') : ''; };
  if (repo.head.branch === name) return ok(`Already on '${name}'${track()}`, 'You are already on that branch.');
  if (repo.branches[name] !== undefined) {
    const r = checkoutTarget(ctx, { branch: name, id: repo.branches[name] }, verb);
    if (r.err) return fail(r.err, '🛑 You have unsaved changes that would be lost. Commit them, or put them aside with git stash.');
    return ok(`${r.warn}Switched to branch '${name}'${track()}`, switchCoach(name));
  }
  const remoteRef = Object.keys(repo.remoteRefs).find((r) => r.slice(r.indexOf('/') + 1) === name);
  if (remoteRef) {
    const id = repo.remoteRefs[remoteRef];
    const r = checkoutTarget(ctx, { branch: name, id }, verb);
    if (r.err) return fail(r.err);
    repo.branches[name] = id;
    repo.upstream[name] = remoteRef;
    return ok(`branch '${name}' set up to track '${remoteRef}'.\nSwitched to a new branch '${name}'`, `Git saw "${remoteRef}" on the remote and made a local branch "${name}" that tracks it.`);
  }
  return null;
}

function createAndSwitch(ctx, name, start, verb, force = false) {
  const { repo } = ctx;
  if (!validBranch(name)) return fail(`fatal: '${name}' is not a valid branch name`);
  if (repo.branches[name] !== undefined && !force) return fail(`fatal: a branch named '${name}' already exists`, `That branch exists already. Switch to it with: git switch ${name}`);
  const id = start ? repo.resolve(start) : repo.headId();
  if (start && !id) return fail(`fatal: invalid reference: ${start}`);
  if (!id) {
    repo.head = { branch: name };
    return ok(`Switched to a new branch '${name}'`, switchCoach(name));
  }
  const r = checkoutTarget(ctx, { branch: name, id }, verb);
  if (r.err) return fail(r.err);
  repo.branches[name] = id;
  let extra = '';
  if (start && repo.remoteRefs[start]) {
    repo.upstream[name] = start;
    extra = `branch '${name}' set up to track '${start}'.\n`;
  }
  return ok(`${extra}Switched to a new branch '${name}'`, `🌱 Created branch "${name}" and jumped onto it in one move. New commits go to this new lane.`);
}

export function branch(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['-m', '-M', '-u', '--set-upstream-to']);
  const del = o.flags.has('-d') || o.flags.has('--delete') || o.flags.has('-D');
  if (del) {
    const out = [];
    for (const name of o.pos) {
      const id = repo.branches[name];
      if (id === undefined) return fail(`error: branch '${name}' not found`);
      if (repo.head.branch === name) return fail(`error: cannot delete branch '${name}' used by worktree at '${ctx.root}'`, 'You cannot delete the branch you are standing on. Switch to another branch first.');
      const up = repo.upstream[name] && repo.remoteRefs[repo.upstream[name]];
      const merged = repo.isAncestor(id, repo.headId()) || (up && repo.isAncestor(id, up));
      if (!merged && !o.flags.has('-D') && !o.flags.has('-f'))
        return fail(`error: the branch '${name}' is not fully merged\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'`, '🛡 Git protects you: this branch has commits that are not merged anywhere. -D would force-delete them.');
      delete repo.branches[name];
      delete repo.upstream[name];
      out.push(`Deleted branch ${name} (was ${short(id)}).`);
    }
    return ok(out.join('\n'), '🧹 Branch label removed. The commits stay safe as long as another branch contains them.');
  }
  const mv = o.vals['-m'] || o.vals['-M'];
  if (mv) {
    const [a, b] = o.pos.length ? [mv[0], o.pos[0]] : [repo.head.branch, mv[0]];
    if (repo.branches[a] === undefined && repo.head.branch !== a) return fail(`error: refname refs/heads/${a} not found\nfatal: branch rename failed`);
    if (repo.branches[a] !== undefined) { repo.branches[b] = repo.branches[a]; delete repo.branches[a]; }
    if (repo.upstream[a]) { repo.upstream[b] = repo.upstream[a]; delete repo.upstream[a]; }
    if (repo.head.branch === a) repo.head = { branch: b };
    return ok('', `Renamed branch "${a}" to "${b}".`);
  }
  const up = (o.vals['-u'] || o.vals['--set-upstream-to'] || [])[0];
  if (up) {
    if (!repo.remoteRefs[up]) return fail(`fatal: the requested upstream branch '${up}' does not exist`);
    const b = o.pos[0] || repo.head.branch;
    repo.upstream[b] = up;
    return ok(`branch '${b}' set up to track '${up}'.`);
  }
  if (o.pos.length && !o.flags.has('--list')) {
    const [name, start] = o.pos;
    if (!validBranch(name)) return fail(`fatal: '${name}' is not a valid branch name`);
    if (repo.branches[name] !== undefined) return fail(`fatal: a branch named '${name}' already exists`);
    const id = start ? repo.resolve(start) : repo.headId();
    if (!id) return fail(`fatal: not a valid object name: '${start || repo.head.branch}'`, 'You need at least one commit before you can create branches.');
    repo.branches[name] = id;
    if (start && repo.remoteRefs[start]) repo.upstream[name] = start;
    return ok('', `🚩 New branch "${name}" planted at ${short(id)}. Note: you are still on ${repo.head.branch ?? 'the same commit'}. Use git switch ${name} to jump onto it.`);
  }
  const vv = args.includes('-vv');
  const verbose = o.flags.has('-v') || vv;
  const lines = [];
  const showLocal = !o.flags.has('-r');
  const showRemote = o.flags.has('-a') || o.flags.has('-r');
  if (showLocal) {
    if (repo.head.branch === undefined) lines.push(`* ${C.green(`(HEAD detached at ${short(repo.head.detached)})`)}`);
    const names = Object.keys(repo.branches).sort();
    const w = Math.max(0, ...names.map((n) => n.length));
    for (const n of names) {
      const cur = repo.head.branch === n;
      let line = (cur ? '* ' + C.green(n.padEnd(verbose ? w : 0)) : '  ' + n.padEnd(verbose ? w : 0));
      if (verbose) {
        let trk = '';
        if (vv && repo.upstream[n]) {
          const r = repo.remoteRefs[repo.upstream[n]];
          const a = r ? repo.between(r, repo.branches[n]).length : 0, b = r ? repo.between(repo.branches[n], r).length : 0;
          trk = `[${C.blue(repo.upstream[n])}${a || b ? ': ' + [a && `ahead ${a}`, b && `behind ${b}`].filter(Boolean).join(', ') : ''}] `;
        }
        line += ` ${C.yellow(short(repo.branches[n]))} ${trk}${firstLine(repo.commits[repo.branches[n]].message)}`;
      }
      lines.push(line);
    }
  }
  if (showRemote) {
    const pre = o.flags.has('-r') ? '' : 'remotes/';
    for (const [rn, b] of Object.entries(repo.remoteHead)) if (repo.remoteRefs[`${rn}/${b}`]) lines.push('  ' + C.red(`${pre}${rn}/HEAD`) + ` -> ${rn}/${b}`);
    for (const r of Object.keys(repo.remoteRefs).sort()) lines.push('  ' + C.red(pre + r));
  }
  return ok(lines.join('\n'), showRemote
    ? '🏰 Red "remotes/origin/..." entries are your bookmarks of where branches were on GitHub the last time you talked to it.'
    : '🚩 The * marks the branch you are on (where Mario stands).');
}

export function switchCmd(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['-c', '-C', '--create']);
  const blocked = opBlock(repo);
  if (blocked) return fail(blocked);
  const create = (o.vals['-c'] || o.vals['--create'] || o.vals['-C'] || [])[0];
  if (create !== undefined) return createAndSwitch(ctx, create, o.pos[0], 'switch', !!o.vals['-C']);
  const name = o.pos[0];
  if (!name) return fail('fatal: missing branch or commit argument');
  if (o.flags.has('--detach') || o.flags.has('-d')) {
    const id = repo.resolve(name);
    if (!id) return fail(`fatal: invalid reference: ${name}`);
    const r = checkoutTarget(ctx, { id }, 'checkout');
    if (r.err) return fail(r.err);
    return ok(`${r.warn}HEAD is now at ${repo.describe(id)}`, '🎈 Detached HEAD: Mario is floating on a commit, not on a branch. Look around, then git switch back to a branch.');
  }
  const r = switchTo(ctx, name, 'switch');
  if (r) return r;
  if (repo.resolve(name)) return fail(`fatal: a branch is expected, got commit '${name}'\nhint: If you want to detach HEAD at the commit, try again with the --detach option.`);
  return fail(`fatal: invalid reference: ${name}`, `No branch called "${name}". List branches with git branch, or create it with git switch -c ${name}.`);
}

const DETACHED_NOTE = (rev) => `Note: switching to '${rev}'.

You are in 'detached HEAD' state. You can look around, make experimental
changes and commit them, and you can discard any commits you make in this
state without impacting any branches by switching back to a branch.

If you want to create a new branch to retain commits you create, you may
do so (now or later) by using -c with the switch command. Example:

  git switch -c <new-branch-name>

Or undo this operation with:

  git switch -

Turn off this advice by setting config variable advice.detachedHead to false

`;

function checkoutFiles(ctx, specs, rev) {
  const { repo } = ctx;
  let src = repo.index;
  if (rev) {
    const id = repo.resolve(rev);
    if (!id) return fail(`fatal: invalid reference: ${rev}`);
    src = repo.tree(id);
  }
  const m = matchPaths(ctx, specs, Object.keys(src));
  if (m.missing.length) return fail(`error: pathspec '${m.missing[0]}' did not match any file(s) known to git`);
  const W = ctx.work();
  for (const p of m.paths) {
    if (rev) repo.index[p] = src[p];
    if (W[p] !== src[p]) ctx.write(p, src[p]);
  }
  return ok(`Updated ${plural(m.paths.length, 'path')} from ${rev ? short(repo.resolve(rev)) : 'the index'}`, '⏪ Files restored. (Modern git prefers "git restore <file>" for this.)');
}

export function checkout(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['-b', '-B']);
  const create = (o.vals['-b'] || o.vals['-B'] || [])[0];
  if (create !== undefined) {
    const blocked = opBlock(repo);
    if (blocked) return fail(blocked);
    return createAndSwitch(ctx, create, o.pos[0], 'checkout', !!o.vals['-B']);
  }
  if (o.dashdash) return checkoutFiles(ctx, o.dashdash, o.pos[0]);
  const name = o.pos[0];
  if (!name) return ok(trackingText(repo).join('\n'));
  const isRef = name === '-' || repo.branches[name] !== undefined || Object.keys(repo.remoteRefs).some((r) => r.slice(r.indexOf('/') + 1) === name);
  if (isRef) {
    const blocked = opBlock(repo);
    if (blocked) return fail(blocked);
    return switchTo(ctx, name, 'checkout');
  }
  const id = repo.resolve(name);
  if (id) {
    const blocked = opBlock(repo);
    if (blocked) return fail(blocked);
    const wasAttached = repo.head.branch !== undefined;
    if (!wasAttached && id === repo.headId()) return ok(`HEAD is now at ${repo.describe(id)}`);
    const r = checkoutTarget(ctx, { id }, 'checkout');
    if (r.err) return fail(r.err, '🛑 Commit or stash your changes before time-travelling.');
    return ok(`${wasAttached ? DETACHED_NOTE(name) : r.warn}HEAD is now at ${repo.describe(id)}`,
      '🎈 Time travel! Mario now stands on an old commit ("detached HEAD"). Your files show the project as it was then. Use git switch main to come back to the present.');
  }
  return checkoutFiles(ctx, o.pos, null);
}

// ---------- merge / rebase / cherry-pick / revert / reset ----------

const MERGE_TEMPLATE = `# Please enter a commit message to explain why this merge is necessary,
# especially if it merges an updated upstream into a topic branch.
#
# Lines starting with '#' will be ignored, and an empty message aborts
# the commit.`;

function defaultMergeMsg(repo, name) {
  const into = repo.head.branch && !['main', 'master'].includes(repo.head.branch) ? ` into ${repo.head.branch}` : '';
  if (repo.remoteRefs[name]) return `Merge remote-tracking branch '${name}'${into}`;
  if (repo.branches[name]) return `Merge branch '${name}'${into}`;
  return `Merge commit '${name}'${into}`;
}

export function doMerge(ctx, theirs, name, opts = {}) {
  const { repo } = ctx;
  const ours = repo.headId();
  if (!ours) {
    const err = moveTo(ctx, theirs, 'merge');
    if (err) return fail(err);
    repo.setHeadId(theirs, `merge ${name}: Fast-forward`);
    return ok(`Fast-forward`, 'Your empty branch now points at the merged commits.');
  }
  if (ours === theirs || repo.isAncestor(theirs, ours)) return ok('Already up to date.', '👍 Nothing to merge: everything on that branch is already part of yours.');
  if (repo.isAncestor(ours, theirs) && !opts.noFF) {
    const before = repo.headTree();
    const err = moveTo(ctx, theirs, 'merge');
    if (err) return fail(err, '🛑 Commit or stash your local changes before merging.');
    repo.setHeadId(theirs, `merge ${name}: Fast-forward`);
    return ok([`Updating ${short(ours)}..${short(theirs)}`, 'Fast-forward', ...fileStatLines(before, repo.tree(theirs))].join('\n'),
      `⏩ Fast-forward! ${repo.head.branch ?? 'HEAD'} had no new commits of its own, so git simply slid the flag forward to ${short(theirs)}. No merge commit needed.`);
  }
  if (opts.ffOnly) return fail('fatal: Not possible to fast-forward, aborting.');
  const H = repo.headTree();
  const res = mergeTrees(repo.tree(repo.mergeBase(ours, theirs)), H, repo.tree(theirs), { ours: 'HEAD', theirs: name });
  const touched = union(H, res.work).filter((p) => H[p] !== res.work[p]);
  const dirty = dirtyPaths(ctx, touched);
  if (dirty.length) return fail(`error: Your local changes to the following files would be overwritten by merge:\n${dirty.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`, '🛑 Commit or stash your local changes before merging.');
  applyResult(ctx, res);
  const message = opts.message || defaultMergeMsg(repo, name);
  repo.op = { type: 'merge', theirs, name, message, conflicts: res.conflicts, orig: ours };
  const lines = [...(opts.prefix || []), ...res.messages];
  if (res.conflicts.length) {
    lines.push('Automatic merge failed; fix conflicts and then commit the result.');
    return fail(lines.join('\n'), `🐢 BOWSER! Both branches changed the same lines in ${res.conflicts.join(', ')}. Open the file (nano ${res.conflicts[0]}), keep what you want, delete the <<<<<<< ======= >>>>>>> marker lines, save, then git add + git commit.`);
  }
  const finish = (msg) => {
    const r = makeCommit(ctx, msg);
    if (r.err) return r;
    return ok([...lines, "Merge made by the 'ort' strategy.", ...fileStatLines(H, repo.headTree())].join('\n'),
      `🔀 Merge commit created! It has TWO parents, joining the two lanes like a warp pipe.`);
  };
  if (opts.message || opts.noEdit) return finish(message);
  const ed = editorFor(`${message}\n${MERGE_TEMPLATE}`, finish, {
    title: 'MERGE_MSG',
    onCancel: () => fail("Not committing merge; use 'git commit' to complete the merge."),
    coach: '📝 Git opened an editor for the merge commit message. The default is fine: just Save. (Real terminal: in Vim type :wq then Enter. Add --no-edit to skip this.)',
  });
  ed.out = lines.join('\n');
  return ed;
}

export function merge(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['-m']);
  if (o.flags.has('--abort')) {
    if (repo.op?.type !== 'merge') return fail('fatal: There is no merge to abort (MERGE_HEAD missing).');
    hardReset(ctx, repo.op.orig);
    repo.op = null;
    return ok('', '🛡 Merge cancelled. Everything is back exactly as it was before you ran git merge.');
  }
  if (o.flags.has('--continue')) {
    if (repo.op?.type !== 'merge') return fail('fatal: There is no merge in progress (MERGE_HEAD missing).');
    return commit(ctx, []);
  }
  if (repo.op) return fail(repo.op.conflicts?.length
    ? "error: Merging is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict."
    : 'fatal: You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.');
  let name = o.pos[0];
  if (!name) {
    name = repo.upstream[repo.head.branch];
    if (!name) return fail('fatal: No remote for the current branch.', 'Tell git which branch to merge in, e.g. git merge feature');
  }
  const theirs = repo.resolve(name);
  if (!theirs) return fail(`merge: ${name} - not something we can merge`, `There is no branch or commit called "${name}". Check with git branch -a.`);
  return doMerge(ctx, theirs, name, { message: o.vals['-m']?.[0], noFF: o.flags.has('--no-ff'), noEdit: o.flags.has('--no-edit'), ffOnly: o.flags.has('--ff-only') });
}

export function reset(ctx, args) {
  const { repo } = ctx;
  const o = parse(args);
  const mode = o.flags.has('--hard') ? 'hard' : o.flags.has('--soft') ? 'soft' : 'mixed';
  let rev = 'HEAD', paths = [...(o.dashdash || [])];
  for (const p of o.pos) {
    if (!paths.length && rev === 'HEAD' && repo.resolve(p) && p !== '.') rev = p;
    else paths.push(p);
  }
  const id = repo.resolve(rev);
  if (!id) {
    if (!repo.headId() && paths.length) { for (const p of matchPaths(ctx, paths, Object.keys(repo.index)).paths) delete repo.index[p]; return ok(''); }
    return fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.`);
  }
  if (paths.length) {
    if (mode !== 'mixed') return fail(`fatal: Cannot do ${mode} reset with paths.`);
    const T = repo.tree(id);
    const m = matchPaths(ctx, paths, union(T, repo.index));
    for (const p of m.paths) {
      if (T[p] === undefined) delete repo.index[p];
      else repo.index[p] = T[p];
    }
    return ok('', '↩️ Unstaged. (Same as git restore --staged.)');
  }
  repo.setHeadId(id, `reset: moving to ${rev}`);
  repo.op = null;
  if (mode === 'hard') {
    hardReset(ctx, id);
    return ok(`HEAD is now at ${repo.describe(id)}`, `💥 reset --hard: the branch jumped to ${short(id)} AND your files were overwritten to match. Commits after it are now faded "ghosts" (recoverable via git reflog for a while).`);
  }
  if (mode === 'soft') return ok('', `🪶 reset --soft: the branch moved back to ${short(id)} but your changes are still STAGED. Perfect for redoing a commit.`);
  repo.index = repo.tree(id);
  const W = ctx.work();
  const lines = Object.keys(repo.index).filter((p) => W[p] !== repo.index[p]).map((p) => `${W[p] === undefined ? 'D' : 'M'}\t${p}`);
  return ok(lines.length ? `Unstaged changes after reset:\n${lines.join('\n')}` : '', `🔙 reset (mixed): the branch moved to ${short(id)}, changes are kept in your files but unstaged.`);
}

function pickHints(kind) {
  return kind === 'rebase'
    ? ['hint: Resolve all conflicts manually, mark them as resolved with', 'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".', 'hint: You can instead skip this commit: run "git rebase --skip".', 'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".']
    : ['hint: After resolving the conflicts, mark them with', 'hint: "git add/rm <pathspec>", then run', `hint: "git ${kind} --continue".`, `hint: You can instead skip this commit with "git ${kind} --skip".`, `hint: To abort and get back to the state before "git ${kind}",`, `hint: run "git ${kind} --abort".`];
}

function runPicks(ctx, ids, kind, opts = {}) {
  const { repo } = ctx;
  const out = [];
  const orig = opts.orig || repo.headId();
  while (ids.length) {
    const c = repo.commits[ids.shift()];
    if (c.parents.length > 1) return fail(`error: commit ${c.id} is a merge but no -m option was given.\nfatal: ${kind} failed`);
    const H = repo.headTree();
    const res = pickResult(ctx, c, kind === 'revert');
    const touched = union(H, res.work).filter((p) => H[p] !== res.work[p]);
    if (dirtyPaths(ctx, touched).length) return fail(`error: your local changes would be overwritten by ${kind}.\nhint: commit your changes or stash them to proceed.\nfatal: ${kind} failed`);
    applyResult(ctx, res);
    const message = kind === 'revert' ? `Revert "${firstLine(c.message)}"\n\nThis reverts commit ${c.id}.` : c.message;
    repo.op = { type: kind, commit: c.id, message, conflicts: res.conflicts, orig, queue: ids };
    if (res.conflicts.length) {
      out.push(...res.messages, `error: could not ${kind === 'revert' ? 'revert' : 'apply'} ${short(c.id)}... ${firstLine(c.message)}`, ...pickHints(kind));
      return fail(out.join('\n'), `🐢 Conflict while ${kind === 'revert' ? 'reverting' : 'cherry-picking'}. Fix the file(s), git add them, then git ${kind} --continue.`);
    }
    if (sameTree(repo.index, H)) {
      repo.op = null;
      out.push(`The previous ${kind} is now empty, possibly due to conflict resolution.`);
      continue;
    }
    if (kind === 'revert' && !opts.noEdit && !ids.length) {
      const ed = editorFor(`${message}\n\n# Please enter the commit message for your changes.`, (text) => {
        const r = makeCommit(ctx, text);
        return r.err ? r : ok([...out, r.out].join('\n'), revertCoach);
      }, { coach: '📝 Git opened an editor with a ready-made "Revert ..." message. Just Save. (Add --no-edit to skip the editor.)' });
      return ed;
    }
    const r = makeCommit(ctx, message);
    out.push(r.out);
  }
  repo.op = null;
  return ok(out.join('\n'), kind === 'revert' ? revertCoach : '🍒 Cherry-picked! Git copied that commit\'s change onto your branch as a brand-new commit (new id, same change).');
}
const revertCoach = '↩️ Revert made a NEW commit that undoes the old one. History is not rewritten, so this is safe on shared branches.';

function sequencer(ctx, kind, o) {
  const { repo } = ctx;
  const none = `error: no ${kind} in progress\nfatal: ${kind} failed`;
  if (o.flags.has('--abort')) {
    if (repo.op?.type !== kind) return fail(none);
    repo.setHeadId(repo.op.orig);
    hardReset(ctx, repo.op.orig);
    repo.op = null;
    return ok('', `${kind} cancelled; you are back where you started.`);
  }
  if (o.flags.has('--skip')) {
    if (repo.op?.type !== kind) return fail(none);
    const { queue, orig } = repo.op;
    hardReset(ctx, repo.headId());
    repo.op = null;
    return runPicks(ctx, queue, kind, { orig, noEdit: true });
  }
  if (o.flags.has('--continue')) {
    if (repo.op?.type !== kind) return fail(none);
    if (repo.op.conflicts.length) return fail(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`);
    const { queue, orig, message } = repo.op;
    const r = makeCommit(ctx, message);
    if (r.err) return r;
    const rest = runPicks(ctx, queue, kind, { orig, noEdit: true });
    return { ...rest, out: [r.out, rest.out].filter(Boolean).join('\n') };
  }
  return null;
}

export function cherryPick(ctx, args) {
  const { repo } = ctx;
  const o = parse(args);
  const seq = sequencer(ctx, 'cherry-pick', o);
  if (seq) return seq;
  if (repo.op) return fail('error: cherry-pick is already in progress\nhint: try "git cherry-pick (--continue | --abort | --skip)"\nfatal: cherry-pick failed');
  if (!o.pos.length) return fail('usage: git cherry-pick [--edit] [-n] [-m <parent-number>] [-s] [-x] [--ff]\n                       [-S[<keyid>]] <commit>...');
  const ids = [];
  for (const r of o.pos) {
    if (r.includes('..')) {
      const [a, b] = r.split('..');
      const ra = repo.resolve(a), rb = repo.resolve(b || 'HEAD');
      if (!ra || !rb) return fail(`fatal: bad revision '${r}'`);
      ids.push(...repo.between(ra, rb).reverse());
    } else {
      const id = repo.resolve(r);
      if (!id) return fail(`fatal: bad revision '${r}'`, 'Use a commit id from git log --oneline --all (the yellow short hash).');
      ids.push(id);
    }
  }
  return runPicks(ctx, ids, 'cherry-pick');
}

export function revert(ctx, args) {
  const { repo } = ctx;
  const o = parse(args);
  const seq = sequencer(ctx, 'revert', o);
  if (seq) return seq;
  if (repo.op) return fail('error: revert is already in progress\nhint: try "git revert (--continue | --abort | --skip)"\nfatal: revert failed');
  if (!o.pos.length) return fail('usage: git revert [--[no-]edit] [-n] [-m <parent-number>] [-s] [-S[<keyid>]] <commit>...');
  const ids = [];
  for (const r of o.pos) {
    const id = repo.resolve(r);
    if (!id) return fail(`fatal: bad revision '${r}'`);
    ids.push(id);
  }
  return runPicks(ctx, ids, 'revert', { noEdit: o.flags.has('--no-edit') });
}

function continueRebase(ctx, out = []) {
  const { repo, env } = ctx;
  const op = repo.op;
  while (op.todo.length) {
    const c = repo.commits[op.todo.shift()];
    op.current = c.id;
    const res = pickResult(ctx, c);
    applyResult(ctx, res);
    if (res.conflicts.length) {
      op.conflicts = res.conflicts;
      op.message = c.message;
      out.push(...res.messages, `error: could not apply ${short(c.id)}... ${firstLine(c.message)}`, ...pickHints('rebase'), `Could not apply ${short(c.id)}... ${firstLine(c.message)}`);
      return fail(out.join('\n'), `🐢 Conflict while replaying "${firstLine(c.message)}". Fix the file, git add it, then git rebase --continue (or git rebase --abort to bail out).`);
    }
    if (!sameTree(repo.index, repo.headTree())) {
      const id = repo.createCommit(env, repo.index, [repo.headId()], c.message);
      repo.setHeadId(id, `rebase: ${firstLine(c.message)}`);
    }
  }
  if (op.branch !== undefined) {
    repo.branches[op.branch] = repo.headId();
    repo.head = { branch: op.branch };
  }
  repo.op = null;
  out.push(`Successfully rebased and updated refs/heads/${op.branch}.`);
  return ok(out.join('\n'), '🌈 Rebased! Your commits were replayed on top of the new base as NEW commits (new ids). The old ones are faded ghosts now. History is a straight line.');
}

export function startRebase(ctx, ontoId, upstreamName, prefix = []) {
  const { repo } = ctx;
  const st = computeStatus(ctx.env, repo, ctx.root);
  if (st.unstaged.length) return fail([...prefix, 'error: cannot rebase: You have unstaged changes.', 'error: Please commit or stash them.'].join('\n'));
  if (st.staged.length) return fail([...prefix, 'error: cannot rebase: Your index contains uncommitted changes.', 'error: Please commit or stash them.'].join('\n'));
  const head = repo.headId();
  const name = repo.head.branch;
  if (head === ontoId || repo.isAncestor(ontoId, head)) return ok([...prefix, `Current branch ${name ?? 'HEAD'} is up to date.`].join('\n'), 'Nothing to do: your branch already sits on top of that one.');
  if (repo.isAncestor(head, ontoId)) {
    moveTo(ctx, ontoId, 'rebase');
    repo.setHeadId(ontoId, `rebase (finish): ${upstreamName}`);
    return ok([...prefix, `Successfully rebased and updated refs/heads/${name}.`].join('\n'), '⏩ Your branch had no commits of its own, so rebase just fast-forwarded it.');
  }
  const todo = repo.between(ontoId, head).filter((id) => repo.commits[id].parents.length < 2).reverse();
  repo.op = { type: 'rebase', branch: name, orig: head, onto: ontoId, todo, conflicts: [] };
  moveTo(ctx, ontoId, 'rebase');
  repo.head = { detached: ontoId };
  return continueRebase(ctx, [...prefix]);
}

export function rebase(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['--onto']);
  const op = repo.op?.type === 'rebase' ? repo.op : null;
  if (o.flags.has('--abort')) {
    if (!op) return fail('fatal: No rebase in progress?');
    repo.head = op.branch !== undefined ? { branch: op.branch } : { detached: op.orig };
    repo.setHeadId(op.orig, 'rebase (abort)');
    hardReset(ctx, op.orig);
    repo.op = null;
    return ok('', '🛡 Rebase aborted. Your branch is exactly as it was before.');
  }
  if (o.flags.has('--continue') || o.flags.has('--skip')) {
    if (!op) return fail('fatal: No rebase in progress?');
    if (o.flags.has('--skip')) hardReset(ctx, repo.headId());
    else {
      if (op.conflicts.length) return fail('error: you must edit all merge conflicts and then\nmark them as resolved using git add\n' + op.conflicts.map((p) => `${p}: needs merge`).join('\n'));
      if (!sameTree(repo.index, repo.headTree())) {
        const id = repo.createCommit(ctx.env, repo.index, [repo.headId()], op.message);
        repo.setHeadId(id, `rebase (continue): ${firstLine(op.message)}`);
      }
    }
    op.conflicts = [];
    return continueRebase(ctx);
  }
  if (o.flags.has('-i') || o.flags.has('--interactive')) return fail('🍄 Interactive rebase (-i) opens a todo-list editor. It is not part of Git Quest yet. Try a plain "git rebase <branch>".');
  if (repo.op) return fail(op ? 'fatal: It seems that there is already a rebase-merge directory, and\nI wonder if you are in the middle of another rebase.' : opBlock(repo));
  let upstream = o.pos[0];
  if (!upstream) {
    upstream = repo.upstream[repo.head.branch];
    if (!upstream) return fail('There is no tracking information for the current branch.\nPlease specify which branch you want to rebase against.\n\n    git rebase <branch>\n');
  }
  const ontoId = repo.resolve(upstream);
  if (!ontoId) return fail(`fatal: invalid upstream '${upstream}'`);
  return startRebase(ctx, ontoId, upstream);
}

// ---------- stash / tag / config ----------

export function stash(ctx, args) {
  const { repo, env } = ctx;
  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'push';
  const rest = args[0] && !args[0].startsWith('-') ? args.slice(1) : args;
  const o = parse(rest, ['-m', '--message']);
  const pick = () => {
    const ref = o.pos[0] || 'stash@{0}';
    const n = parseInt((ref.match(/\{(\d+)\}/) || [, ref])[1], 10);
    return isNaN(n) || !repo.stash[n] ? null : n;
  };
  if (sub === 'push' || sub === 'save') {
    if (!repo.headId()) return fail('You do not have the initial commit yet');
    const st = computeStatus(env, repo, ctx.root);
    const withUntracked = o.flags.has('-u') || o.flags.has('--include-untracked');
    if (!st.staged.length && !st.unstaged.length && !(withUntracked && st.untracked.length)) return ok('No local changes to save', 'Nothing to stash: your working directory is already clean.');
    const W = ctx.work();
    const H = repo.headTree();
    const tracked = union(H, repo.index);
    const work = {};
    for (const p of tracked) if (W[p] !== undefined) work[p] = W[p];
    const untracked = {};
    if (withUntracked) for (const p of st.untracked) untracked[p] = W[p];
    const label = (o.vals['-m'] || o.vals['--message'] || [])[0] || (sub === 'save' ? o.pos.join(' ') : '');
    const where = repo.head.branch ?? '(no branch)';
    const msg = label ? `On ${where}: ${label}` : `WIP on ${where}: ${repo.describe(repo.headId())}`;
    repo.stash.unshift({ base: repo.headId(), index: { ...repo.index }, work, untracked, msg });
    hardReset(ctx, repo.headId());
    for (const p of Object.keys(untracked)) ctx.write(p, undefined);
    return ok(`Saved working directory and index state ${msg}`, '📦 Your unfinished changes went into the reserve item box (stash). Working directory is clean again, so you can switch branches safely.');
  }
  if (sub === 'list') return ok(repo.stash.map((s, i) => `stash@{${i}}: ${s.msg}`).join('\n'), repo.stash.length ? '📦 Newest stash is stash@{0}.' : 'The stash is empty.');
  if (sub === 'show') {
    const n = pick();
    if (n === null) return fail('No stash entries found.');
    return ok(fileStatLines(repo.tree(repo.stash[n].base), repo.stash[n].work).join('\n'));
  }
  if (sub === 'drop' || sub === 'clear') {
    if (sub === 'clear') { repo.stash = []; return ok(''); }
    const n = pick();
    if (n === null) return fail('No stash entries found.');
    repo.stash.splice(n, 1);
    return ok(`Dropped stash@{${n}}`);
  }
  if (sub === 'pop' || sub === 'apply') {
    const n = pick();
    if (n === null) return fail('No stash entries found.');
    const s = repo.stash[n];
    const B = repo.tree(s.base), H = repo.headTree();
    const touched = union(B, s.work).filter((p) => B[p] !== s.work[p]);
    const dirty = dirtyPaths(ctx, touched);
    if (dirty.length) return fail(`error: Your local changes to the following files would be overwritten by merge:\n${dirty.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting\nThe stash entry is kept in case you need it again.`);
    const res = mergeTrees(B, H, s.work, { ours: 'Updated upstream', theirs: 'Stashed changes' });
    const conflicts = res.conflicts;
    for (const p of touched) {
      ctx.write(p, res.work[p]);
      if (B[p] === undefined && res.work[p] !== undefined && !conflicts.includes(p)) repo.index[p] = res.work[p];
      if (res.work[p] === undefined) delete repo.index[p];
    }
    for (const [p, c] of Object.entries(s.untracked || {})) ctx.write(p, c);
    if (conflicts.length) {
      return fail([...res.messages, 'On branch ' + (repo.head.branch ?? 'HEAD'), 'The stash entry is kept in case you need it again.'].join('\n'), 'Conflict while re-applying the stash. Fix the markers in the file, then git add it.');
    }
    const out = [statusText(env, repo, ctx.root).text];
    if (sub === 'pop') {
      repo.stash.splice(n, 1);
      out.push(`Dropped refs/stash@{${n}} (${short(s.base)}${'0'.repeat(33)})`);
    }
    return ok(out.join('\n'), sub === 'pop' ? '📦→ Your stashed changes are back in your files, and the stash entry was removed.' : '📦 Changes re-applied; the stash entry is kept (use pop to apply+remove).');
  }
  return fail(`error: unknown subcommand: \`${sub}'\nusage: git stash list | show | drop | pop | apply | push | clear`);
}

export function tag(ctx, args) {
  const { repo } = ctx;
  const o = parse(args, ['-m']);
  if (o.flags.has('-d')) {
    const out = [];
    for (const t of o.pos) {
      if (!repo.tags[t]) return fail(`error: tag '${t}' not found.`);
      out.push(`Deleted tag '${t}' (was ${short(repo.tags[t])})`);
      delete repo.tags[t];
      delete repo.tagMessages[t];
    }
    return ok(out.join('\n'));
  }
  if (!o.pos.length || o.flags.has('-l')) return ok(Object.keys(repo.tags).sort().join('\n'), '🏷 Tags are permanent name-plates for important commits, like releases.');
  const [name, rev] = o.pos;
  if (repo.tags[name] && !o.flags.has('-f')) return fail(`fatal: tag '${name}' already exists`);
  const id = repo.resolve(rev || 'HEAD');
  if (!id) return fail(`fatal: Failed to resolve '${rev || 'HEAD'}' as a valid ref.`);
  if (o.flags.has('-a') && !o.vals['-m']) return fail('🍄 Annotated tags open an editor for a message. Add -m "message" to give it inline.');
  repo.tags[name] = id;
  if (o.vals['-m']) repo.tagMessages[name] = o.vals['-m'][0];
  return ok('', `🏷 Tagged ${short(id)} as "${name}". Tags are NOT pushed automatically: use git push origin ${name} (or --tags).`);
}

export function config(ctx, args) {
  const { repo, env } = ctx;
  const o = parse(args);
  const global = o.flags.has('--global') || o.flags.has('--system');
  if (o.flags.has('--list') || o.flags.has('-l')) {
    const all = { ...env.config, ...(global || !repo ? {} : repo.config) };
    const lines = Object.entries(all).map(([k, v]) => `${k}=${v}`);
    if (!global && repo) lines.push('core.bare=false', ...Object.entries(repo.remotes).map(([n, u]) => `remote.${n}.url=${u}`));
    return ok(lines.join('\n'));
  }
  const [key, ...vals] = o.pos;
  if (!key) return fail('usage: git config [<options>]');
  const k = key.toLowerCase();
  if (o.flags.has('--unset')) {
    delete (global || !repo ? env.config : repo.config)[k];
    return ok('');
  }
  if (!vals.length) {
    const v = global ? env.config[k] : env.getConfig(k, repo);
    return v === undefined ? fail('') : ok(v);
  }
  if (!global && !repo) return fail('fatal: not in a git directory', 'Use --global to set it for every project, or cd into a repository first.');
  (global ? env.config : repo.config)[k] = vals.join(' ');
  env.hooks.onConfig?.(k, vals.join(' '), global);
  const coach = k.startsWith('user.')
    ? `👤 Saved ${key} = "${vals.join(' ')}" ${global ? 'for every repository on this computer (--global)' : 'for this repository only'}. It will be stamped on your commits.`
    : `⚙️ Setting ${key} saved.`;
  return ok('', coach);
}
