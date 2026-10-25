// `git` entry point: dispatch subcommands, help, typo suggestions.
import { levenshtein } from '../util.js';
import { ok, fail, makeCtx } from './core.js';
import * as L from './commands.js';
import * as R from './remote.js';

const CMDS = {
  init: L.init, status: L.status, add: L.add, commit: L.commit, log: L.log, show: L.show, diff: L.diff,
  restore: L.restore, rm: L.rm, mv: L.mv, branch: L.branch, switch: L.switchCmd, checkout: L.checkout,
  merge: L.merge, reset: L.reset, revert: L.revert, 'cherry-pick': L.cherryPick, rebase: L.rebase,
  stash: L.stash, tag: L.tag, config: L.config, reflog: L.reflog,
  remote: R.remote, clone: R.clone, fetch: R.fetch, pull: R.pull, push: R.push,
};
const NO_REPO_NEEDED = new Set(['init', 'clone', 'config', 'help', 'version']);
const NOT_IN_GAME = ['bisect', 'blame', 'worktree', 'submodule', 'grep', 'gc', 'am', 'apply', 'archive', 'bundle', 'describe', 'format-patch', 'notes', 'shortlog', 'sparse-checkout', 'maintenance', 'clean', 'range-diff'];

export const SUBCOMMANDS = [...Object.keys(CMDS), 'help'].sort();

export const USAGE = {
  init: 'git init [<directory>]', status: 'git status [-s]', add: 'git add <pathspec>... | git add . | git add -A',
  commit: 'git commit [-a] [-m <msg>] [--amend]', log: 'git log [--oneline] [--graph] [--all] [-n <number>] [<revision>]',
  show: 'git show [<commit>]', diff: 'git diff [--staged] [<commit> [<commit>]] [-- <path>...]',
  restore: 'git restore [--staged] [--source=<tree>] <pathspec>...', rm: 'git rm [--cached] [-r] <file>...', mv: 'git mv <source> <destination>',
  branch: 'git branch [-a] [-v] | git branch <name> [<start>] | git branch -d <name> | git branch -m <old> <new>',
  switch: 'git switch <branch> | git switch -c <new-branch> [<start>] | git switch --detach <commit>',
  checkout: 'git checkout <branch> | git checkout -b <new-branch> | git checkout <commit> | git checkout -- <file>',
  merge: 'git merge <branch> [--no-ff] [-m <msg>] | git merge --abort', reset: 'git reset [--soft | --mixed | --hard] [<commit>] | git reset <file>',
  revert: 'git revert <commit> [--no-edit] | --continue | --abort', 'cherry-pick': 'git cherry-pick <commit>... | --continue | --abort',
  rebase: 'git rebase <branch> | --continue | --abort | --skip', stash: 'git stash [push -m <msg> | list | pop | apply | drop | show]',
  tag: 'git tag [<name> [<commit>]] | git tag -a <name> -m <msg> | git tag -d <name>', config: 'git config [--global] <key> [<value>] | git config --list',
  reflog: 'git reflog', remote: 'git remote [-v] | git remote add <name> <url> | git remote remove <name>', clone: 'git clone <url> [<directory>]',
  fetch: 'git fetch [<remote>] [--all] [--prune]', pull: 'git pull [--rebase | --no-rebase] [<remote> [<branch>]]',
  push: 'git push [-u] [<remote> [<branch>]] | git push --tags | git push origin --delete <branch>',
};

const HELP = `usage: git [-v | --version] [-h | --help] <command> [<args>]

These are common Git commands used in various situations:

start a working area
   clone     Clone a repository into a new directory
   init      Create an empty Git repository or reinitialize an existing one

work on the current change
   add       Add file contents to the index
   mv        Move or rename a file, a directory, or a symlink
   restore   Restore working tree files
   rm        Remove files from the working tree and from the index

examine the history and state
   diff      Show changes between commits, commit and working tree, etc
   log       Show commit logs
   show      Show various types of objects
   status    Show the working tree status

grow, mark and tweak your common history
   branch    List, create, or delete branches
   commit    Record changes to the repository
   merge     Join two or more development histories together
   rebase    Reapply commits on top of another base tip
   reset     Reset current HEAD to the specified state
   switch    Switch branches
   tag       Create, list, delete or verify a tag object

collaborate
   fetch     Download objects and refs from another repository
   pull      Fetch from and integrate with another repository or a local branch
   push      Update remote refs along with associated objects

Also available in Git Quest: checkout, stash, cherry-pick, revert, remote, config, reflog
'git <command> -h' shows a quick usage line for any command.`;

export function git(env, args) {
  const [sub, ...rest] = args;
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    if (rest[0] && USAGE[rest[0]]) return ok(`usage: ${USAGE[rest[0]]}`);
    return ok(HELP, '📖 That is git\'s built-in help. Each command also has a manual page: git help <command> (opens a browser/pager in real life).');
  }
  if (sub === '--version' || sub === '-v' || sub === 'version') return ok('git version 2.50.1 (Git Quest edition)');
  const fn = CMDS[sub];
  if (!fn) {
    if (NOT_IN_GAME.includes(sub)) return fail(`🍄 'git ${sub}' is a real git command, but it isn't part of Git Quest yet.`);
    const best = Object.keys(CMDS).map((c) => [c, levenshtein(sub, c)]).sort((a, b) => a[1] - b[1])[0];
    return fail(`git: '${sub}' is not a git command. See 'git --help'.${best[1] <= 2 ? `\n\nThe most similar command is\n\t${best[0]}` : ''}`,
      best[1] <= 2 ? `Typo? Did you mean git ${best[0]}?` : 'Unknown git command. Type git help to see the common ones.');
  }
  if (rest.includes('-h') && USAGE[sub] && sub !== 'commit' && sub !== 'branch') return ok(`usage: ${USAGE[sub]}`);
  if (rest.includes('--help')) return ok(`usage: ${USAGE[sub] || 'git ' + sub}`);
  const ctx = makeCtx(env);
  if (!ctx.repo && !NO_REPO_NEEDED.has(sub))
    return fail('fatal: not a git repository (or any of the parent directories): .git', '📂 You are not inside a git project folder. cd into one (look for folders containing .git), or run git init to make this folder one.');
  return fn(ctx, rest);
}
