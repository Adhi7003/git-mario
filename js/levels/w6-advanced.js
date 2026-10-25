// World 6: stash, reset, revert, cherry-pick, rebase, tags, final boss.
import { URL, F, baseRepo, remoteAndClone, luigiPushes } from './common.js';

const base = [...baseRepo(), 'cd kart-stats'];
const synced = (s) => { const r = s.repo(), R = s.remote(); return !!R && r.branches.main === R.branches.main; };
const lapsWith = (first) => F.lapsBest.replace('laps = [32.1, 31.8, 33.0]', first);

export default {
  id: 6, name: 'Power-Up Palace', icon: '⭐',
  blurb: 'Advanced moves: stash, reset, revert, cherry-pick, rebase and tags.',
  levels: [
    {
      id: '6-1', title: 'Reserve Item Box', start: 'kart-stats',
      story: 'You are halfway through a chart feature in laps.py when an urgent bug report arrives on the hotfix branch. Your work is not ready to commit...',
      lesson: `<p><code>git stash</code> puts your uncommitted changes in the <b>reserve item box</b> 📦 and gives you a clean working directory.</p>
<p>Later, <code>git stash pop</code> puts them back (and empties the box). <code>git stash list</code> shows what is stored.</p>
<p>Perfect for "I need to switch branches but I'm mid-change".</p>`,
      setup: [...base, 'git switch -c hotfix', { file: 'laps.py', text: F.laps.replace('32.1', '32.0') }, 'git commit -am "Fix first lap time"', 'git switch main', 'echo "# TODO: draw a lap-time chart" >> laps.py'],
      goals: [
        { t: 'Try git switch hotfix: blocked by your changes', c: (s) => s.said(/would be overwritten by checkout/) },
        { t: 'Stash your work: git stash', c: (s) => s.repo().stash.length > 0, seq: true },
        { t: 'Now switch to hotfix works', c: (s) => s.repo().head.branch === 'hotfix', seq: true },
        { t: 'Come back to main', c: (s) => s.repo().head.branch === 'main', seq: true },
        { t: 'Get your work back with git stash pop', c: (s) => !s.repo().stash.length && /TODO: draw/.test(s.file('kart-stats/laps.py') || ''), seq: true },
      ],
      hints: ['git switch hotfix (read the error)', 'git stash', 'git switch hotfix', 'git switch main, then git stash pop'],
      solution: ['git switch hotfix', 'git stash', 'git switch hotfix', 'git switch main', 'git stash pop'],
      learn: [['git stash', 'Shelve uncommitted changes; clean working directory.'], ['git stash pop', 'Re-apply the latest stash and remove it.'], ['git stash list', 'Show stashed entries.']],
      quiz: [{ q: 'Bring back your most recent stashed changes (and remove them from the stash).', a: ['git stash pop'] }],
    },
    {
      id: '6-2', title: 'Rewind', start: 'kart-stats',
      story: 'Your last two commits were a broken experiment. Erase them. Then practise redoing a commit message.',
      lesson: `<p><code>git reset &lt;commit&gt;</code> moves the current branch back. Three strengths:</p>
<ul><li><code>--soft</code>: branch moves, changes stay <b>staged</b> (redo a commit)</li><li><code>--mixed</code> (default): changes stay in files, <b>unstaged</b></li><li><code>--hard</code>: branch moves and files are <b>overwritten</b> 💥</li></ul>
<p>Removed commits become faded ghosts. <code>git reflog</code> remembers them for a while: your safety net. Only reset commits you haven't pushed.</p>`,
      setup: [...base, 'echo "speed = -1" > turbo.py', 'git add turbo.py', 'git commit -m "WIP broken turbo"', 'echo "speed = NaN" >> turbo.py', 'git commit -am "WIP even more broken"'],
      goals: [
        { t: 'Erase the last 2 commits completely: git reset --hard HEAD~2', c: (s) => { const r = s.repo(); return s.msg(r) === 'Add track list' && s.clean(); } },
        { t: 'Peek at the safety net: git reflog', c: (s) => s.ranOk(/^git reflog/) },
        { t: 'Make a new commit, then undo it with git reset --soft HEAD~1', c: (s) => s.ranOk(/^git reset --soft/) && s.status().staged.length > 0, seq: true },
        { t: 'Re-commit the staged changes with a better message', c: (s) => { const r = s.repo(); return s.count(r) === 4 && s.clean(); }, seq: true },
      ],
      hints: ['git reset --hard HEAD~2', 'git reflog', 'echo "speed = 3" > turbo.py && git add turbo.py && git commit -m "turbo"  then  git reset --soft HEAD~1', 'git commit -m "Add turbo with speed 3"'],
      solution: ['git reset --hard HEAD~2', 'git reflog', 'echo "speed = 3" > turbo.py', 'git add turbo.py', 'git commit -m "turbo"', 'git reset --soft HEAD~1', 'git commit -m "Add turbo with speed 3"'],
      learn: [['git reset --hard <commit>', 'Move branch back and overwrite files (destructive!).'], ['git reset --soft HEAD~1', 'Undo last commit, keep changes staged.'], ['git reflog', 'History of where HEAD has been: recover lost commits.']],
      quiz: [{ q: 'Undo the last commit but keep its changes staged.', a: ['git reset --soft HEAD~1', 'git reset --soft HEAD~', 'git reset --soft HEAD^'] }],
    },
    {
      id: '6-3', title: 'Safe Undo', start: 'kart-stats', remote: URL,
      story: 'A commit that made all karts super slow is already on GitHub, and others have pulled it. Rewriting history would hurt the team. Undo it the safe way.',
      lesson: `<p><code>git revert &lt;commit&gt;</code> creates a <b>new commit</b> that does the exact opposite of the old one. History is not rewritten, so it is safe on shared branches.</p>
<p>Rule of thumb: <b>reset</b> for local, unpushed mistakes; <b>revert</b> for anything already pushed.</p>`,
      setup: remoteAndClone([{ file: 'laps.py', text: lapsWith('laps = [99.9, 99.9, 99.9]') }, 'git commit -am "Make all karts super slow"', 'echo "Peach,1,33.3" >> data.csv', 'git commit -am "Add Peach lap"']),
      goals: [
        { t: 'Find the bad commit with git log --oneline', c: (s) => s.ranOk(/^git log/) },
        { t: 'Revert "Make all karts super slow"', c: (s) => s.findMsg(s.repo(), /^Revert "Make all karts super slow"/).length > 0 && s.file('kart-stats/laps.py') === F.lapsBest + '\n' },
        { t: 'Push the fix to GitHub', c: (s) => synced(s) && /^Revert/.test(s.msg(s.remote(), 'main')), seq: true },
      ],
      hints: ['git log --oneline', 'git revert <id of the slow commit>  (it is HEAD~1)', 'Save the message, then git push'],
      solution: ['git log --oneline', 'git revert HEAD~1', 'git push'],
      learn: [['git revert <commit>', 'Make a new commit that undoes an old one (safe for shared history).']],
      quiz: [{ q: 'Safely undo the commit a1b2c3d that is already pushed.', a: ['git revert a1b2c3d'] }],
    },
    {
      id: '6-4', title: 'Cherry Picking', start: 'kart-stats',
      story: 'The experiment branch is mostly silly ideas, but one commit fixes a real bug. Take just that one.',
      lesson: `<p><code>git cherry-pick &lt;commit&gt;</code> copies a single commit's change onto your current branch as a <b>new</b> commit (new id, same change).</p>
<p>Use <code>git log --oneline &lt;branch&gt;</code> to find the id. Then you can throw the rest away with <code>git branch -D</code> (capital D = force, because it was never merged).</p>`,
      setup: [...base, 'git switch -c experiment', 'echo "kart color: purple" > purple.txt', 'git add purple.txt', 'git commit -m "Try purple karts"', { file: 'laps.py', text: F.lapsAvg }, 'git commit -am "Fix lap average bug"', 'echo "wheels: square" > wheels.txt', 'git add wheels.txt', 'git commit -m "Try square wheels"', 'git switch main'],
      goals: [
        { t: "List experiment's commits: git log --oneline experiment", c: (s) => s.ranOk(/^git log .*experiment/) },
        { t: 'Cherry-pick ONLY "Fix lap average bug" onto main', c: (s) => { const r = s.repo(); const t = s.tree(r, 'main'); return s.msg(r, 'main') === 'Fix lap average bug' && !('purple.txt' in t) && !('wheels.txt' in t); } },
        { t: 'Delete experiment (force: git branch -D)', c: (s) => !s.repo().branches.experiment, seq: true },
      ],
      hints: ['git log --oneline experiment', 'git cherry-pick <id of "Fix lap average bug">  (or experiment~1)', 'git branch -D experiment'],
      solution: ['git log --oneline experiment', 'git cherry-pick experiment~1', 'git branch -D experiment'],
      learn: [['git cherry-pick <commit>', 'Copy one commit onto the current branch.'], ['git branch -D <name>', 'Force-delete an unmerged branch.']],
      quiz: [{ q: 'Copy commit 9f8e7d6 onto your current branch.', a: ['git cherry-pick 9f8e7d6'] }],
    },
    {
      id: '6-5', title: 'Rainbow Road Rebase', start: 'kart-stats',
      story: 'Your rainbow branch started a while ago, and main has moved on. Instead of a merge bubble, replay your work on top of the latest main for a straight history.',
      lesson: `<p><code>git rebase main</code> (while on your branch) lifts your commits off, moves the branch to the tip of main, and <b>replays</b> them one by one as <b>new commits</b>.</p>
<p>Result: a straight line, and merging into main becomes a fast-forward. Watch the old coins fade into ghosts.</p>
<p>Golden rule: rebase only your own <b>unpushed</b> branches (it rewrites commit ids).</p>`,
      setup: [...base, 'git switch -c rainbow', 'echo "Rainbow Road" > rainbow.txt', 'git add rainbow.txt', 'git commit -m "Add Rainbow Road"', 'echo "music: rainbow.mp3" > music.txt', 'git add music.txt', 'git commit -m "Add Rainbow music"', 'git switch main', 'echo "Version 2" >> README.md', 'git commit -am "Bump README to v2"', { file: 'laps.py', text: F.lapsAvg }, 'git commit -am "Add average calculation"', 'git switch rainbow'],
      goals: [
        { t: 'On rainbow, rebase onto main', c: (s) => { const r = s.repo(); return !r.op && !!r.branches.rainbow && r.isAncestor(r.branches.main, r.branches.rainbow) && r.between(r.branches.main, r.branches.rainbow).every((id) => r.commits[id].parents.length === 1); } },
        { t: 'Switch to main and merge rainbow (a fast-forward!)', c: (s) => { const r = s.repo(); return r.head.branch === 'main' && r.branches.main === (r.branches.rainbow ?? r.branches.main) && 'rainbow.txt' in s.tree(r, 'main') && r.commits[r.branches.main].parents.length === 1; }, seq: true },
        { t: 'Enjoy the straight line: git log --oneline --graph', c: (s) => s.lastOk(/^git log .*--graph/), seq: true },
      ],
      hints: ['git rebase main', 'git switch main && git merge rainbow', 'git log --oneline --graph'],
      solution: ['git rebase main', 'git switch main', 'git merge rainbow', 'git log --oneline --graph'],
      learn: [['git rebase <branch>', 'Replay your commits on top of another branch (straight history).'], ['git rebase --abort / --continue', 'Bail out of, or resume, a rebase.']],
      quiz: [{ q: 'You are on feature. Replay its commits on top of main.', a: ['git rebase main'] }],
    },
    {
      id: '6-6', title: 'Tag the Release', start: 'kart-stats', remote: URL,
      story: 'Version 1.0 of kart-stats is ready! Mark this moment forever.',
      lesson: `<p>A <b>tag</b> 🏷 is a name stuck permanently to one commit, usually a release: <code>git tag v1.0</code>.</p>
<p>Tag any older commit by giving its id: <code>git tag v0.1 &lt;id&gt;</code>.</p>
<p>Tags are <b>not</b> pushed by default: <code>git push origin v1.0</code> (one) or <code>git push --tags</code> (all).</p>`,
      setup: remoteAndClone(),
      goals: [
        { t: 'Tag the current commit as v1.0', c: (s) => s.repo().tags['v1.0'] === s.repo().headId() },
        { t: 'Tag the very first commit as v0.1', c: (s) => { const r = s.repo(); return !!r.tags['v0.1'] && r.commits[r.tags['v0.1']].parents.length === 0; } },
        { t: 'List your tags with git tag', c: (s) => s.ranOk(/^git tag\s*$/) },
        { t: 'Push both tags to GitHub', c: (s) => { const R = s.remote(); return !!R.tags['v1.0'] && !!R.tags['v0.1']; } },
      ],
      hints: ['git tag v1.0', 'git log --oneline to find the first commit id, then git tag v0.1 <id>  (or HEAD~4)', 'git tag', 'git push --tags'],
      solution: ['git tag v1.0', 'git tag v0.1 HEAD~4', 'git tag', 'git push --tags'],
      learn: [['git tag <name> [<commit>]', 'Name a commit permanently (releases).'], ['git push --tags', 'Upload tags to GitHub.']],
      quiz: [{ q: 'Upload all your tags to GitHub.', a: ['git push --tags', 'git push origin --tags'] }],
    },
    {
      id: '6-7', title: "FINAL BOSS: Bowser's Castle", start: 'kart-stats', remote: URL, boss: true,
      story: 'Your turbo branch is ready, but Luigi changed the very same line on GitHub. Fetch, rebase, defeat the conflict, ship it, and tag v2.0. Everything you have learned, in one run!',
      lesson: `<p>The full professional loop:</p>
<pre>git fetch                       # what's new on GitHub?
git rebase origin/main          # put my work on top of it
  (fix conflict → git add → git rebase --continue)
git switch main && git pull     # update main
git merge turbo                 # fast-forward
git push                        # ship
git tag v2.0 && git push origin v2.0</pre>
<p>Stuck? <code>git status</code> always tells you where you are. <code>git rebase --abort</code> is your escape hatch.</p>`,
      setup: [...remoteAndClone(), 'cd kart-stats', 'git switch -c turbo', { file: 'laps.py', text: lapsWith('laps = [32.1, 31.8, 33.0, 29.5]') }, 'git commit -am "Add turbo lap"', 'cd ~',
        ...luigiPushes([{ file: 'laps.py', text: lapsWith('laps = [32.1, 31.8, 33.0, 30.9]') }, 'git commit -am "Add Luigi lap"'])],
      goals: [
        { t: 'Fetch the latest from GitHub', c: (s) => s.repo().remoteRefs['origin/main'] === s.remote().branches.main },
        { t: 'Rebase turbo onto origin/main and defeat the conflict', c: (s) => { const r = s.repo(); return !r.op && !!r.branches.turbo && r.isAncestor(s.remote().branches.main, r.branches.turbo) && !/<<<<<<</.test(s.tree(r, 'turbo')['laps.py']); } },
        { t: 'Switch to main and pull', c: (s) => { const r = s.repo(); return r.head.branch === 'main' && s.contains(r, 'main', s.remote().branches.main); }, seq: true },
        { t: 'Merge turbo into main and push', c: (s) => { const r = s.repo(); return synced(s) && s.contains(r, 'main', r.branches.turbo); }, seq: true },
        { t: 'Tag v2.0 and push the tag', c: (s) => s.remote().tags['v2.0'] === s.remote().branches.main, seq: true },
      ],
      hints: ['git fetch', 'git rebase origin/main → conflict in laps.py. nano laps.py, keep both lap times, remove markers', 'git add laps.py && git rebase --continue', 'git switch main && git pull && git merge turbo && git push', 'git tag v2.0 && git push origin v2.0'],
      solution: ['git fetch', 'git rebase origin/main',
        'echo "laps = [32.1, 31.8, 33.0, 30.9, 29.5]" > laps.py', 'echo "print(\\"Laps:\\", laps)" >> laps.py', 'echo "average = sum(laps) / len(laps)" >> laps.py', 'echo "print(\\"Average lap:\\", average)" >> laps.py', 'echo "print(\\"Best lap:\\", min(laps))" >> laps.py',
        'git add laps.py', 'git rebase --continue', 'git switch main', 'git pull', 'git merge turbo', 'git push', 'git tag v2.0', 'git push origin v2.0'],
      learn: [['git rebase origin/main', 'Replay your branch on top of the latest GitHub main.']],
      quiz: [{ q: 'A rebase stopped on a conflict. You fixed and staged the file. Resume the rebase.', a: ['git rebase --continue'] }],
    },
  ],
};
