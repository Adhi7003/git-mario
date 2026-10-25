// World 3: branches and merging.
import { baseRepo } from './common.js';

const base = [...baseRepo(), 'cd kart-stats'];

export default {
  id: 3, name: 'Branch Forest', icon: '🌳',
  blurb: 'Work on ideas in parallel lanes, then join them back together.',
  levels: [
    {
      id: '3-1', title: 'A New Path', start: 'kart-stats',
      story: 'You want to try a turbo feature without risking the working code on main. Open a new path!',
      lesson: `<p>A <b>branch</b> is a movable name tag (🚩 flag) pointing at a commit. Like a design variant: you can experiment on it while main stays untouched.</p>
<ul><li><code>git branch</code> lists branches (<b>*</b> = where you are)</li><li><code>git branch turbo</code> creates one (but you stay put!)</li><li><code>git switch turbo</code> moves Mario onto it</li></ul>
<p>Watch the graph: both flags sit on the same coin until you commit.</p>`,
      setup: base,
      goals: [
        { t: 'List branches with git branch', c: (s) => s.ranOk(/^git branch\s*$/) },
        { t: 'Create a branch called turbo', c: (s) => !!s.repo().branches.turbo },
        { t: 'Switch onto turbo', c: (s) => s.repo().head.branch === 'turbo' },
        { t: 'Run git branch again: the * moved', c: (s) => s.lastOk(/^git branch\s*$/) && s.repo().head.branch === 'turbo', seq: true },
      ],
      hints: ['git branch', 'git branch turbo', 'git switch turbo', 'git branch'],
      solution: ['git branch', 'git branch turbo', 'git switch turbo', 'git branch'],
      learn: [['git branch', 'List branches.'], ['git branch <name>', 'Create a branch (without switching).'], ['git switch <name>', 'Move onto a branch.']],
      quiz: [{ q: 'Move onto the existing branch called dev.', a: ['git switch dev', 'git checkout dev'] }],
    },
    {
      id: '3-2', title: 'Parallel Worlds', start: 'kart-stats',
      story: 'You are on turbo. Build the feature there and see how main stays exactly as it was.',
      lesson: `<p>Commits go to the branch you are standing on. The other branch doesn't move.</p>
<p>When you <code>git switch</code>, git swaps the files in your folder to match that branch. Files that only exist on turbo really disappear from disk on main, and come back when you switch again. Nothing is lost!</p>`,
      setup: [...base, 'git switch -c turbo'],
      goals: [
        { t: 'On turbo, create turbo.py and commit it', c: (s) => { const r = s.repo(); return 'turbo.py' in s.tree(r, 'turbo') && !('turbo.py' in s.tree(r, 'main')); } },
        { t: 'Switch back to main', c: (s) => s.repo().head.branch === 'main', seq: true },
        { t: 'Run ls on main: turbo.py is gone!', c: (s) => s.lastOk(/^ls/) && s.repo().head.branch === 'main', seq: true },
        { t: 'Switch to turbo again: it is back', c: (s) => s.repo().head.branch === 'turbo', seq: true },
      ],
      hints: ['echo "speed = 2" > turbo.py', 'git add turbo.py && git commit -m "Add turbo boost"', 'git switch main, then ls', 'git switch turbo'],
      solution: ['echo "speed = 2" > turbo.py', 'git add turbo.py', 'git commit -m "Add turbo boost"', 'git switch main', 'ls', 'git switch turbo'],
      learn: [['git switch <branch>', 'Switch branch: your files change to match it.']],
      quiz: [{ q: 'Which command creates a new branch called hotfix AND switches to it?', a: ['git switch -c hotfix', 'git checkout -b hotfix'] }],
    },
    {
      id: '3-3', title: 'Fast-Forward Pipe', start: 'kart-stats',
      story: 'Turbo is finished and tested. Bring it into main!',
      lesson: `<p><code>git merge turbo</code> brings turbo's commits <b>into the branch you are on</b>. So first switch to the receiving branch (main).</p>
<p>If main has no new commits of its own, git just slides the main flag forward: a <b>fast-forward</b>. No new commit needed.</p>
<p>Afterwards, delete the finished branch label with <code>git branch -d turbo</code>. The commits stay.</p>`,
      setup: [...base, 'git switch -c turbo', 'echo "speed = 2" > turbo.py', 'git add turbo.py', 'git commit -m "Add turbo boost"', 'echo "fuel = 100" >> turbo.py', 'git commit -am "Add turbo fuel"'],
      goals: [
        { t: 'Switch to main (you merge INTO the branch you stand on)', c: (s) => s.repo().head.branch === 'main' },
        { t: 'Merge turbo into main', c: (s) => { const r = s.repo(); return !!r.branches.turbo ? r.branches.main === r.branches.turbo : 'turbo.py' in s.tree(r, 'main'); } },
        { t: 'Delete the turbo branch with git branch -d', c: (s) => !s.repo().branches.turbo && 'turbo.py' in s.tree(s.repo(), 'main'), seq: true },
      ],
      hints: ['git switch main', 'git merge turbo', 'git branch -d turbo'],
      solution: ['git switch main', 'git merge turbo', 'git branch -d turbo'],
      learn: [['git merge <branch>', 'Bring another branch\'s commits into the current one.'], ['git branch -d <name>', 'Delete a merged branch.']],
      quiz: [{ q: 'You are on main. Merge the branch called feature into it.', a: ['git merge feature'] }],
    },
    {
      id: '3-4', title: 'Two Paths Meet', start: 'kart-stats',
      story: 'While Toad built Rainbow Road on its own branch, main also got a new commit. The paths have split. Join them.',
      lesson: `<p>When <b>both</b> branches have new commits, git can't fast-forward. It creates a <b>merge commit</b> with <b>two parents</b> (the ? block in the graph): the warp pipe where lanes join.</p>
<p>Git opens an editor for the merge message. The default is fine: just save. (In real life it is often Vim: type <code>:wq</code> and Enter. Or add <code>--no-edit</code>.)</p>`,
      setup: [...base, 'git switch -c rainbow-road', 'echo "Rainbow Road: 3 laps, no rails" > rainbow.txt', 'git add rainbow.txt', 'git commit -m "Add Rainbow Road"', 'git switch main', 'echo "Contributors: Player, Toad" >> README.md', 'git commit -am "Add contributors"'],
      goals: [
        { t: 'See the split: git log --oneline --graph --all', c: (s) => s.ranOk(/^git log .*--graph/) },
        { t: 'Merge rainbow-road into main (save the message)', c: (s) => { const r = s.repo(); return r.commits[r.branches.main].parents.length === 2; } },
        { t: 'Clean up: delete the rainbow-road branch', c: (s) => !s.repo().branches['rainbow-road'], seq: true },
      ],
      hints: ['git log --oneline --graph --all', 'git merge rainbow-road (then press Save in the editor)', 'git branch -d rainbow-road'],
      solution: ['git log --oneline --graph --all', 'git merge rainbow-road', 'git branch -d rainbow-road'],
      learn: [['git log --oneline --graph --all', 'Draw every branch as an ASCII graph.'], ['merge commit', 'A commit with two parents that joins two branches.']],
      quiz: [{ q: 'Show the history of ALL branches as a compact graph.', a: ['git log --oneline --graph --all', 'git log --graph --oneline --all', 'git log --all --oneline --graph', 'git log --all --graph --oneline', 'git log --oneline --all --graph', 'git log --graph --all --oneline'] }],
    },
    {
      id: '3-5', title: 'BOSS: Feature Factory', start: 'kart-stats', boss: true,
      story: 'Ship a complete feature on your own: branch, build, merge, clean up. This is the everyday AI-coding workflow.',
      lesson: `<p>The feature-branch loop:</p>
<pre>git switch -c star-power     # new branch + switch
...edit, add, commit (x2)...
git switch main
git merge star-power
git branch -d star-power</pre>
<p><code>git switch -c</code> (or the older <code>git checkout -b</code>) creates and switches in one move.</p>`,
      setup: base,
      goals: [
        { t: 'Create AND switch to star-power in one command', c: (s) => s.ranOk(/^git (switch (-c|--create)|checkout -b) star-power/) },
        { t: 'Make 2 commits on star-power', c: (s) => { const r = s.repo(); return !!r.branches['star-power'] && r.between(s.findMsg(r, /^Add track list$/)[0].id, r.branches['star-power']).length >= 2; } },
        { t: 'Merge star-power into main', c: (s) => { const r = s.repo(); return r.head.branch === 'main' && s.count(r, 'main') >= 5; }, seq: true },
        { t: 'Delete the star-power branch', c: (s) => !s.repo().branches['star-power'], seq: true },
      ],
      hints: ['git switch -c star-power', 'Make a file, add, commit. Then change it and commit again.', 'git switch main && git merge star-power', 'git branch -d star-power'],
      solution: ['git switch -c star-power', 'echo "star = True" > star.py', 'git add star.py', 'git commit -m "Add star power"', 'echo "duration = 10" >> star.py', 'git commit -am "Set star duration"', 'git switch main', 'git merge star-power', 'git branch -d star-power'],
      learn: [['git switch -c <name>', 'Create a branch and switch to it.']],
      quiz: [{ q: 'Delete the merged branch star-power.', a: ['git branch -d star-power'] }],
    },
  ],
};
