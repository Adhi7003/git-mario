// World 5: GitHub remotes: clone, push, fetch, pull, PR workflow.
import { URL, historyRepo, remoteAndClone, luigiPushes } from './common.js';
import { mergeTrees } from '../git/status.js';

const synced = (s) => { const r = s.repo(), R = s.remote(); return !!R && r.branches.main === R.branches.main; };

export default {
  id: 5, name: 'Cloud Castle', icon: '🏰',
  blurb: 'Work with GitHub: clone, push, pull, and team up with Luigi.',
  levels: [
    {
      id: '5-1', title: 'Copy the Castle', remote: URL,
      story: 'The kart-stats project lives on GitHub (the castle 🏰). Download your own copy to work on.',
      lesson: `<p>A <b>remote</b> is another copy of the repo, usually on GitHub. <code>git clone &lt;url&gt;</code> downloads the whole project <b>with its history</b> into a new folder, and remembers the URL under the nickname <b>origin</b>.</p>
<p>In the graph, red dashed flags like <code>origin/main</code> are bookmarks: "where main was on GitHub the last time we talked". The castle panel shows GitHub's actual state.</p>`,
      setup: remoteAndClone(['git branch experiment']).slice(0, -1),
      goals: [
        { t: `Clone ${URL}`, c: (s) => !!s.repo() },
        { t: 'cd into the new kart-stats folder', c: (s) => s.in('kart-stats') },
        { t: 'See where it came from: git remote -v', c: (s) => s.ranOk(/^git remote -v/) },
        { t: 'See every branch, including GitHub\'s: git branch -a', c: (s) => s.ranOk(/^git branch (-a|--all)/) },
      ],
      hints: [`git clone ${URL}`, 'cd kart-stats', 'git remote -v', 'git branch -a'],
      solution: [`git clone ${URL}`, 'cd kart-stats', 'git remote -v', 'git branch -a'],
      learn: [['git clone <url>', 'Download a repository (with history) from GitHub.'], ['git remote -v', 'Show the remote nicknames and URLs.'], ['git branch -a', 'List local and remote-tracking branches.']],
      quiz: [{ q: 'Download the repo at https://github.com/peach/castle.git', a: ['git clone https://github.com/peach/castle.git'] }],
    },
    {
      id: '5-2', title: 'Raise the Flag', start: 'kart-stats', remote: URL,
      story: 'You improved the README. Upload your commit so the team can see it.',
      lesson: `<p>Commits are created <b>locally</b>. GitHub doesn't see them until you <code>git push</code>.</p>
<p><code>git status</code> tells you how you compare: "ahead of 'origin/main' by 1 commit" = you have something to push.</p>`,
      setup: remoteAndClone(),
      goals: [
        { t: 'Commit a change (edit README.md)', c: (s) => { const r = s.repo(); return r.between(r.remoteRefs['origin/main'], r.branches.main).length > 0 || (synced(s) && s.count(r) > 5); } },
        { t: 'git status: "ahead by 1 commit"', c: (s) => s.lastOk(/^git status/) && s.said(/ahead of 'origin\/main'/), seq: true },
        { t: 'Push it to GitHub', c: (s) => synced(s) && s.count(s.repo()) > 5, seq: true },
      ],
      hints: ['echo "## Results" >> README.md', 'git commit -am "Add results section"', 'git status', 'git push'],
      solution: ['echo "## Results" >> README.md', 'git commit -am "Add results section"', 'git status', 'git push'],
      learn: [['git push', 'Upload your commits to GitHub.']],
      quiz: [{ q: 'Upload your local commits to the remote.', a: ['git push', 'git push origin main', 'git push origin'] }],
    },
    {
      id: '5-3', title: 'Messages from Luigi', start: 'kart-stats', remote: URL,
      story: 'Luigi pushed new lap times to GitHub while you were away. Find out what changed, then bring it in.',
      lesson: `<p><code>git fetch</code> <b>downloads</b> news from GitHub and moves the red <code>origin/…</code> flags, but does <b>not</b> touch your branch or files. Safe to run anytime.</p>
<p><code>git pull</code> = <code>git fetch</code> + <code>git merge</code>: it downloads <b>and</b> updates your branch.</p>`,
      setup: [...remoteAndClone(), ...luigiPushes(['echo "Luigi: 30.9" >> laps.py', 'git commit -am "Add Luigi lap time"'])],
      goals: [
        { t: 'git fetch: download the news', c: (s) => s.ranOk(/^git fetch/) && s.repo().remoteRefs['origin/main'] === s.remote().branches.main },
        { t: 'git status: you are "behind by 1"', c: (s) => s.lastOk(/^git status/) && s.said(/behind 'origin\/main'/), seq: true },
        { t: "Read Luigi's commit: git log origin/main --oneline", c: (s) => s.ranOk(/^git log .*origin\/main/) },
        { t: 'Bring it into main with git pull', c: (s) => synced(s), seq: true },
      ],
      hints: ['git fetch', 'git status', 'git log origin/main --oneline', 'git pull'],
      solution: ['git fetch', 'git status', 'git log origin/main --oneline', 'git pull'],
      learn: [['git fetch', 'Download remote changes without touching your branch.'], ['git pull', 'Fetch + merge: update your branch from GitHub.']],
      quiz: [{ q: 'Download remote news WITHOUT changing your branch or files.', a: ['git fetch', 'git fetch origin'] }],
    },
    {
      id: '5-4', title: 'Rejected!', start: 'kart-stats', remote: URL,
      story: 'You and Luigi worked at the same time. He pushed first. Now GitHub will bounce your push. Learn the fix.',
      lesson: `<p>GitHub rejects a push when it has commits you don't have: it won't let you overwrite Luigi's work.</p>
<p>Fix: <code>git pull</code>, then <code>git push</code> again. When both sides have new commits, modern git asks <i>how</i> to combine them. Choose merge with <code>git pull --no-rebase</code> (or set it once: <code>git config pull.rebase false</code>).</p>
<p>⚠️ Never "fix" this with <code>git push --force</code> on a shared branch: that deletes Luigi's commits.</p>`,
      setup: [...remoteAndClone(), ...luigiPushes(['echo "Luigi: 30.9" >> laps.py', 'git commit -am "Add Luigi lap time"'])],
      goals: [
        { t: 'Commit your own change to README.md', c: (s) => { const r = s.repo(); return r.between(r.remoteRefs['origin/main'], r.branches.main).length > 0; } },
        { t: 'Try git push... REJECTED!', c: (s) => s.said(/\[rejected\]/) },
        { t: "Pull Luigi's work (git pull --no-rebase)", c: (s) => { const r = s.repo(); return s.contains(r, 'main', s.remote().branches.main) || synced(s); }, seq: true },
        { t: 'Push again: success!', c: (s) => synced(s), seq: true },
      ],
      hints: ['echo "Player was here" >> README.md && git commit -am "Update README"', 'git push (it will be rejected)', 'git pull --no-rebase (then Save the merge message)', 'git push'],
      solution: ['echo "Player was here" >> README.md', 'git commit -am "Update README"', 'git push', 'git pull --no-rebase', 'git push'],
      learn: [['! [rejected] (fetch first)', 'GitHub has commits you lack: pull, then push.'], ['git pull --no-rebase', 'Pull and combine with a merge commit.']],
      quiz: [{ q: 'Your push was rejected because the remote has new commits. What do you run first?', a: ['git pull', 'git pull --no-rebase', 'git pull --rebase'] }],
    },
    {
      id: '5-5', title: 'New Castle', start: 'kart-stats', remote: URL,
      story: 'Your local project has never been on GitHub. You just created an empty repo there. Connect the two and upload.',
      lesson: `<p>For a project that started on your computer:</p>
<pre>git remote add origin &lt;url&gt;     # remember GitHub's address as "origin"
git push -u origin main          # first upload; -u links main ↔ origin/main</pre>
<p>Thanks to <code>-u</code> (upstream), later pushes and pulls are just <code>git push</code> / <code>git pull</code>. GitHub shows these exact commands when you create an empty repo.</p>`,
      setup: [...historyRepo(), `@emptyremote ${URL}`],
      goals: [
        { t: 'Check git remote -v: no remotes yet', c: (s) => s.ranOk(/^git remote( -v)?\s*$/) },
        { t: `Link GitHub: git remote add origin ${URL}`, c: (s) => s.repo().remotes.origin === URL },
        { t: 'First push with -u: git push -u origin main', c: (s) => synced(s) && s.repo().upstream.main === 'origin/main' },
        { t: 'Make another commit and upload it with plain git push', c: (s) => synced(s) && s.lastOk(/^git push\s*$/) && s.count(s.repo()) > 5, seq: true },
      ],
      hints: ['git remote -v', `git remote add origin ${URL}`, 'git push -u origin main', 'echo "v2" >> README.md && git commit -am "Update README" && git push'],
      solution: ['git remote -v', `git remote add origin ${URL}`, 'git push -u origin main', 'echo "v2" >> README.md', 'git commit -am "Update README"', 'git push'],
      learn: [['git remote add origin <url>', 'Link a local repo to a GitHub URL.'], ['git push -u origin main', 'First push; remembers the link so plain git push works later.']],
      quiz: [{ q: 'First push of branch main to origin, also setting the upstream.', a: ['git push -u origin main', 'git push --set-upstream origin main'] }],
    },
    {
      id: '5-6', title: 'Pull Request Party', start: 'kart-stats', remote: URL,
      story: 'Teams never push straight to main. Build your feature on a branch, push it, open a Pull Request on GitHub, merge it there, then sync.',
      lesson: `<p>The <b>Pull Request</b> (PR) workflow used by almost every team (and by AI coding agents!):</p>
<ol><li><code>git switch -c speed-boost</code> and commit</li><li><code>git push -u origin speed-boost</code></li><li>On GitHub: open a PR, get it reviewed, click <b>Merge</b> (use the button above)</li><li><code>git switch main</code> + <code>git pull</code> to get the merged result</li><li><code>git branch -d speed-boost</code></li></ol>`,
      setup: remoteAndClone(),
      actions: [{
        id: 'merge-pr', label: '🌐 GitHub: Merge pull request',
        enabled: (s) => { const R = s.remote(); return !!R.branches['speed-boost'] && !R.isAncestor(R.branches['speed-boost'], R.branches.main); },
        run: (env) => {
          const R = env.remotes[URL];
          const main = R.branches.main, feat = R.branches['speed-boost'];
          const res = mergeTrees(R.tree(R.mergeBase(main, feat)), R.tree(main), R.tree(feat), { ours: 'main', theirs: 'speed-boost' });
          R.branches.main = R.createCommit(env, res.index, [main, feat], 'Merge pull request #1 from player/speed-boost\n\nAdd speed boost');
          return '🎉 GitHub merged Pull Request #1 into main. Your local main does not know yet: switch to main and pull!';
        },
      }],
      goals: [
        { t: 'Create and switch to branch speed-boost', c: (s) => s.repo().head.branch === 'speed-boost' },
        { t: 'Commit your feature on it', c: (s) => { const r = s.repo(); return !!r.branches['speed-boost'] && r.between(r.remoteRefs['origin/main'], r.branches['speed-boost']).length > 0; } },
        { t: 'Push the branch: git push -u origin speed-boost', c: (s) => !!s.remote().branches['speed-boost'] },
        { t: 'Merge the Pull Request on GitHub (button above)', c: (s) => { const R = s.remote(); return R.commits[R.branches.main].parents.length === 2; } },
        { t: 'Switch to main and pull the merged result', c: (s) => s.repo().head.branch === 'main' && synced(s), seq: true },
        { t: 'Delete your local speed-boost branch', c: (s) => !s.repo().branches['speed-boost'], seq: true },
      ],
      hints: ['git switch -c speed-boost', 'echo "boost = 1.5" > boost.py && git add . && git commit -m "Add speed boost"', 'git push -u origin speed-boost, then click the GitHub button', 'git switch main && git pull && git branch -d speed-boost'],
      solution: ['git switch -c speed-boost', 'echo "boost = 1.5" > boost.py', 'git add .', 'git commit -m "Add speed boost"', 'git push -u origin speed-boost', '@action merge-pr', 'git switch main', 'git pull', 'git branch -d speed-boost'],
      learn: [['git push -u origin <branch>', 'Publish a new branch to GitHub (needed before opening a PR).'], ['Pull Request', 'A GitHub page asking to merge your branch into main, with review.']],
      quiz: [{ q: 'Publish your new branch feature-x to GitHub and set its upstream.', a: ['git push -u origin feature-x', 'git push --set-upstream origin feature-x'] }],
    },
  ],
};
