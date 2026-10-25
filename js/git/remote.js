// Remote commands talking to the pretend GitHub (env.remotes: url -> bare Repo).
import { C, short, plural } from '../util.js';
import { join, basename } from '../vfs.js';
import { Repo, copyCommits } from './repo.js';
import { ok, fail, parse } from './core.js';
import { doMerge, startRebase } from './commands.js';

const NOT_REPO = (name) => `fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`;
const NOT_FOUND = (url) => `remote: Repository not found.\nfatal: repository '${url}' not found`;

function transfer(n) {
  const objs = Math.max(3, n * 3);
  return [`Enumerating objects: ${objs + 2}, done.`, `Counting objects: 100% (${objs + 2}/${objs + 2}), done.`, 'Delta compression using up to 8 threads',
    `Compressing objects: 100% (${objs - 1}/${objs - 1}), done.`, `Writing objects: 100% (${objs}/${objs}), ${objs * 97} bytes | ${objs * 97}.00 KiB/s, done.`, `Total ${objs} (delta 1), reused 0 (delta 0), pack-reused 0`];
}

export function remote(ctx, args) {
  const { repo, env } = ctx;
  const o = parse(args);
  const [sub, name, url] = o.pos;
  if (!sub) {
    const names = Object.keys(repo.remotes);
    if (o.flags.has('-v')) return ok(names.flatMap((n) => [`${n}\t${repo.remotes[n]} (fetch)`, `${n}\t${repo.remotes[n]} (push)`]).join('\n'), '🏰 "origin" is just a nickname for the URL of the GitHub copy of this project.');
    return ok(names.join('\n'), names.length ? '🏰 These are the nicknames of remote copies (usually just "origin").' : 'No remotes yet. This repo only lives on your computer.');
  }
  if (sub === 'add') {
    if (!name || !url) return fail('usage: git remote add [<options>] <name> <url>');
    if (repo.remotes[name]) return fail(`error: remote ${name} already exists.`);
    repo.remotes[name] = url;
    return ok('', `🔗 Linked "${name}" → ${url}. Nothing was uploaded yet; that is what git push is for.${env.remotes[url] ? '' : ' (Heads-up: no repository exists at that URL on our pretend GitHub.)'}`);
  }
  if (sub === 'remove' || sub === 'rm') {
    if (!repo.remotes[name]) return fail(`error: No such remote: '${name}'`);
    delete repo.remotes[name];
    for (const r of Object.keys(repo.remoteRefs)) if (r.startsWith(name + '/')) delete repo.remoteRefs[r];
    return ok('');
  }
  if (sub === 'get-url') return repo.remotes[name] ? ok(repo.remotes[name]) : fail(`error: No such remote '${name}'`);
  if (sub === 'set-url') {
    if (!repo.remotes[name]) return fail(`error: No such remote '${name}'`);
    repo.remotes[name] = url;
    return ok('');
  }
  return fail(`error: unknown subcommand: \`${sub}'`);
}

export function clone(ctx, args) {
  const { env, fs } = ctx;
  const o = parse(args);
  const url = o.pos[0];
  if (!url) return fail('fatal: You must specify a repository to clone.\n\nusage: git clone [<options>] [--] <repo> [<dir>]');
  const dirName = o.pos[1] || basename(url).replace(/\.git$/, '');
  const abs = fs.resolve(env.cwd, dirName);
  const R = env.remotes[url];
  if (!R) return fail(`Cloning into '${dirName}'...\n${NOT_FOUND(url)}`, 'No repository at that URL. Check for typos (copy-paste is your friend).');
  if (fs.get(abs) && (fs.get(abs).type !== 'dir' || fs.list(abs).length)) return fail(`fatal: destination path '${dirName}' already exists and is not an empty directory.`);
  fs.mkdirp(abs);
  const repo = new Repo();
  fs.get(abs).children['.git'] = { type: 'dir', children: {}, repo };
  repo.remotes.origin = url;
  const n = copyCommits(R, repo, [...Object.values(R.branches), ...Object.values(R.tags)]);
  for (const [b, id] of Object.entries(R.branches)) repo.remoteRefs[`origin/${b}`] = id;
  Object.assign(repo.tags, R.tags);
  const def = R.branches[R.head.branch] ? R.head.branch : Object.keys(R.branches)[0];
  const lines = [`Cloning into '${dirName}'...`];
  if (def) {
    repo.remoteHead.origin = def;
    repo.branches[def] = R.branches[def];
    repo.head = { branch: def };
    repo.upstream[def] = `origin/${def}`;
    repo.index = repo.tree(R.branches[def]);
    for (const [p, c] of Object.entries(repo.index)) fs.setFile(abs, p, c);
    repo.log(R.branches[def], `clone: from ${url}`);
    const objs = n * 3;
    lines.push(`remote: Enumerating objects: ${objs}, done.`, `remote: Counting objects: 100% (${objs}/${objs}), done.`, `remote: Compressing objects: 100% (${n * 2}/${n * 2}), done.`,
      `remote: Total ${objs} (delta 1), reused ${objs} (delta 1), pack-reused 0`, `Receiving objects: 100% (${objs}/${objs}), done.`, 'Resolving deltas: 100% (1/1), done.');
  } else {
    lines.push('warning: You appear to have cloned an empty repository.');
  }
  return ok(lines.join('\n'), `🏰 You downloaded the whole castle, history included, into ./${dirName}. "origin" now points to GitHub, and red origin/... flags show where GitHub's branches are. Next: cd ${dirName}`);
}

function lookupRemote(ctx, name) {
  const url = ctx.repo.remotes[name];
  if (!url) return { err: fail(NOT_REPO(name), `There is no remote called "${name}". See git remote -v.`) };
  const R = ctx.env.remotes[url];
  if (!R) return { err: fail(NOT_FOUND(url)) };
  return { url, R };
}

export function doFetch(ctx, name, { prune = false } = {}) {
  const { repo } = ctx;
  const { url, R, err } = lookupRemote(ctx, name);
  if (err) return { err };
  const lines = [];
  let n = 0;
  for (const [b, id] of Object.entries(R.branches)) {
    const key = `${name}/${b}`, old = repo.remoteRefs[key];
    if (old === id) continue;
    n += copyCommits(R, repo, [id]);
    if (!old) lines.push(` * [new branch]      ${b.padEnd(10)} -> ${key}`);
    else if (repo.isAncestor(old, id)) lines.push(`   ${short(old)}..${short(id)}  ${b.padEnd(10)} -> ${key}`);
    else lines.push(` + ${short(old)}...${short(id)} ${b.padEnd(10)} -> ${key}  (forced update)`);
    repo.remoteRefs[key] = id;
  }
  for (const [t, id] of Object.entries(R.tags)) {
    if (repo.tags[t]) continue;
    n += copyCommits(R, repo, [id]);
    repo.tags[t] = id;
    lines.push(` * [new tag]         ${t.padEnd(10)} -> ${t}`);
  }
  if (prune) {
    for (const key of Object.keys(repo.remoteRefs)) {
      if (key.startsWith(name + '/') && !R.branches[key.slice(name.length + 1)]) {
        delete repo.remoteRefs[key];
        lines.push(` - [deleted]         (none)     -> ${key}`);
      }
    }
  }
  if (R.head.branch) repo.remoteHead[name] = R.head.branch;
  if (!lines.length) return { lines: [] };
  const objs = Math.max(3, n * 3);
  return {
    lines: [`remote: Enumerating objects: ${objs}, done.`, `remote: Counting objects: 100% (${objs}/${objs}), done.`, `remote: Total ${objs} (delta 0), reused 0 (delta 0), pack-reused 0`,
      `Unpacking objects: 100% (${objs}/${objs}), ${objs * 96} bytes | ${objs * 48}.00 KiB/s, done.`, `From ${url}`, ...lines],
  };
}

export function fetch(ctx, args) {
  const o = parse(args);
  const names = o.flags.has('--all') ? Object.keys(ctx.repo.remotes) : [o.pos[0] || Object.keys(ctx.repo.remotes)[0] || 'origin'];
  const out = [];
  for (const n of names) {
    const r = doFetch(ctx, n, { prune: o.flags.has('--prune') || o.flags.has('-p') });
    if (r.err) return r.err;
    out.push(...r.lines);
  }
  return ok(out.join('\n'), out.length
    ? '📡 Fetched! The red origin/... flags moved to match GitHub. Your own branches did NOT move: fetch only downloads. Use merge or pull to bring the changes in.'
    : '📡 Fetched: nothing new on GitHub.');
}

const DIVERGENT = `hint: You have divergent branches and need to specify how to reconcile them.
hint: You can do so by running one of the following commands sometime before
hint: your next pull:
hint:
hint:   git config pull.rebase false  # merge
hint:   git config pull.rebase true   # rebase
hint:   git config pull.ff only       # fast-forward only
hint:
hint: You can replace "git config" with "git config --global" to set a default
hint: preference for all repositories. You can also pass --rebase, --no-rebase,
hint: or --ff-only on the command line to override the configured default per
hint: invocation.
fatal: Need to specify how to reconcile divergent branches.`;

export function pull(ctx, args) {
  const { repo, env } = ctx;
  const o = parse(args);
  if (repo.op) return fail('error: You have not concluded your merge (MERGE_HEAD exists).\nhint: Please, commit your changes before merging.\nfatal: Exiting because of unfinished merge.');
  const branch = repo.head.branch;
  if (branch === undefined) return fail('You are not currently on a branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n');
  let remoteName, rbranch;
  if (o.pos.length) {
    remoteName = o.pos[0];
    rbranch = o.pos[1] || (repo.upstream[branch]?.startsWith(remoteName + '/') ? repo.upstream[branch].slice(remoteName.length + 1) : null);
  } else if (repo.upstream[branch]) {
    const up = repo.upstream[branch];
    remoteName = up.slice(0, up.indexOf('/'));
    rbranch = up.slice(up.indexOf('/') + 1);
  }
  if (!remoteName || !rbranch) {
    return fail(`There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=origin/<branch> ${branch}\n`,
      `Your branch doesn't track a GitHub branch yet. Try: git pull origin ${branch}  (or push once with -u to set tracking).`);
  }
  const f = doFetch(ctx, remoteName);
  if (f.err) return f.err;
  const key = `${remoteName}/${rbranch}`;
  const target = repo.remoteRefs[key];
  if (!target) return fail([...f.lines, `fatal: couldn't find remote ref ${rbranch}`].join('\n'));
  const ours = repo.headId();
  const withPrefix = (r) => ({ ...r, out: [...f.lines, r.out].filter(Boolean).join('\n') });
  if (ours && (ours === target || repo.isAncestor(target, ours))) return withPrefix(ok('Already up to date.', '👍 Already up to date: GitHub has nothing you don\'t have.'));
  if (!ours || repo.isAncestor(ours, target)) {
    const r = withPrefix(doMerge(ctx, target, key));
    if (!r.err) r.coach = '⬇️ pull = fetch + merge. GitHub had new commits and your branch fast-forwarded to include them.';
    return r;
  }
  let mode = o.flags.has('--rebase') || o.flags.has('-r') ? 'rebase' : o.flags.has('--no-rebase') ? 'merge' : o.flags.has('--ff-only') ? 'ff' : null;
  if (!mode) {
    const pr = env.getConfig('pull.rebase', repo), ff = env.getConfig('pull.ff', repo);
    mode = pr === 'true' ? 'rebase' : pr === 'false' ? 'merge' : ff === 'only' ? 'ff' : null;
  }
  if (!mode) return withPrefix(fail(DIVERGENT, '🔀 Both you and GitHub have new commits ("divergent"). Git wants you to choose: merge them (git pull --no-rebase) or replay yours on top (git pull --rebase). Merge is the simplest choice.'));
  if (mode === 'ff') return withPrefix(fail('fatal: Not possible to fast-forward, aborting.'));
  if (mode === 'rebase') return startRebase(ctx, target, key, f.lines);
  const r = doMerge(ctx, target, key, { message: `Merge branch '${rbranch}' of ${repo.remotes[remoteName]}`, prefix: f.lines });
  return r;
}

export function push(ctx, args) {
  const { repo, env } = ctx;
  const o = parse(args);
  const setUp = o.flags.has('-u') || o.flags.has('--set-upstream');
  const force = o.flags.has('-f') || o.flags.has('--force') || o.flags.has('--force-with-lease');
  const branch = repo.head.branch;
  if (!Object.keys(repo.remotes).length && !o.pos.length)
    return fail('fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>\n', 'This repo is not linked to GitHub yet. Add a remote first: git remote add origin <url>');
  let remoteName = o.pos[0];
  let specs = o.pos.slice(1);
  if (!remoteName) {
    const up = branch !== undefined && repo.upstream[branch];
    if (!up && !o.flags.has('--tags')) {
      if (branch === undefined) return fail('fatal: You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push origin HEAD:<name-of-remote-branch>\n');
      return fail(`fatal: The current branch ${branch} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream origin ${branch}\n\nTo have this happen automatically for branches without a tracking\nupstream, see 'push.autoSetupRemote' in 'git help config'.\n`,
        `🚩 GitHub doesn't know this branch yet. The first push needs: git push -u origin ${branch}  (-u = remember this link, so next time plain "git push" works).`);
    }
    remoteName = up ? up.slice(0, up.indexOf('/')) : 'origin';
  }
  const { url, R, err } = lookupRemote(ctx, remoteName);
  if (err) return err;
  const del = o.flags.has('--delete') || o.flags.has('-d');
  const out = [], rows = [], rejected = [];
  let objects = 0, created = [];
  if (del) {
    for (const b of specs) {
      if (!R.branches[b]) return fail(`error: unable to delete '${b}': remote ref does not exist\nerror: failed to push some refs to '${url}'`);
      delete R.branches[b];
      delete repo.remoteRefs[`${remoteName}/${b}`];
      rows.push(` - [deleted]         ${b}`);
    }
    return ok([`To ${url}`, ...rows].join('\n'), `🗑 Deleted the branch on GitHub.`);
  }
  if (!specs.length && !o.flags.has('--tags')) {
    if (branch === undefined) return fail('fatal: You are not currently on a branch.');
    const up = repo.upstream[branch];
    specs = [up && up.startsWith(remoteName + '/') ? `${branch}:${up.slice(remoteName.length + 1)}` : branch];
  }
  for (const spec of specs) {
    let [src, dst] = spec.includes(':') ? spec.split(':') : [spec, spec];
    if (src === 'HEAD') src = branch;
    if (dst === 'HEAD') dst = branch;
    if (repo.tags[src] && !repo.branches[src]) {
      if (R.tags[src] === repo.tags[src]) continue;
      objects += copyCommits(repo, R, [repo.tags[src]]);
      R.tags[src] = repo.tags[src];
      rows.push(` * [new tag]         ${src} -> ${src}`);
      continue;
    }
    const local = repo.branches[src];
    if (!local) return fail(`error: src refspec ${src} does not match any\nerror: failed to push some refs to '${url}'`, src === branch ? 'This branch has no commits yet. Make a commit first.' : `There is no local branch called "${src}".`);
    const remoteId = R.branches[dst];
    if (remoteId === local) { rows.push(null); }
    else if (remoteId && !force && !repo.isAncestor(remoteId, local)) {
      rejected.push({ src, dst, fetchFirst: !repo.commits[remoteId] });
    } else {
      objects += copyCommits(repo, R, [local]);
      if (!R.branches[dst] && !Object.keys(R.branches).length) R.head = { branch: dst };
      if (!remoteId) { rows.push(` * [new branch]      ${src} -> ${dst}`); created.push(dst); }
      else if (force && !repo.isAncestor(remoteId, local)) rows.push(` + ${short(remoteId)}...${short(local)} ${src} -> ${dst} (forced update)`);
      else rows.push(`   ${short(remoteId)}..${short(local)}  ${src} -> ${dst}`);
      R.branches[dst] = local;
      repo.remoteRefs[`${remoteName}/${dst}`] = local;
      if (!repo.remoteHead[remoteName]) repo.remoteHead[remoteName] = R.head.branch;
    }
    if (setUp && !rejected.length) repo.upstream[src] = `${remoteName}/${dst}`;
  }
  if (o.flags.has('--tags')) {
    for (const [t, id] of Object.entries(repo.tags)) {
      if (R.tags[t] === id) continue;
      objects += copyCommits(repo, R, [id]);
      R.tags[t] = id;
      rows.push(` * [new tag]         ${t} -> ${t}`);
    }
  }
  const real = rows.filter(Boolean);
  if (!real.length && !rejected.length) return ok('Everything up-to-date', '👍 GitHub already has all your commits.');
  if (real.length) {
    out.push(...transfer(Math.max(1, objects)));
    for (const b of created) {
      if (url.includes('github.com')) out.push('remote: ', `remote: Create a pull request for '${b}' on GitHub by visiting:`, `remote:      ${url.replace(/\.git$/, '')}/pull/new/${b}`, 'remote: ');
    }
  }
  out.push(`To ${url}`, ...real);
  for (const r of rejected) out.push(` ${C.red('! [rejected]')}        ${r.src} -> ${r.dst} (${r.fetchFirst ? 'fetch first' : 'non-fast-forward'})`);
  if (setUp && !rejected.length) for (const s of specs) { const src = s.split(':')[0] === 'HEAD' ? branch : s.split(':')[0]; if (repo.branches[src]) out.push(`branch '${src}' set up to track '${remoteName}/${s.split(':')[1] || src}'.`); }
  if (rejected.length) {
    out.push(`error: failed to push some refs to '${url}'`);
    out.push(...(rejected[0].fetchFirst
      ? ['hint: Updates were rejected because the remote contains work that you do not', 'hint: have locally. This is usually caused by another repository pushing to', "hint: the same ref. If you want to integrate the remote changes, use", "hint: 'git pull' before pushing again.", "hint: See the 'Note about fast-forwards' in 'git push --help' for details."]
      : ['hint: Updates were rejected because the tip of your current branch is behind', 'hint: its remote counterpart. If you want to integrate the remote changes,', "hint: use 'git pull' before pushing again.", "hint: See the 'Note about fast-forwards' in 'git push --help' for details."]));
    return fail(out.join('\n'), '⛔ Rejected! GitHub has commits you don\'t have (someone else pushed). Git won\'t let you overwrite them. Run git pull first, then push again.');
  }
  return ok(out.join('\n'), `⬆️ Pushed! GitHub (the castle 🏰) now has your commits${created.length ? ` and a new branch "${created.join(', ')}"` : ''}. The red origin/... flag caught up with your branch.`);
}
