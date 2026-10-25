// World 4: merge conflicts.
import { baseRepo } from './common.js';

const castle = (extra = []) => [
  ...baseRepo(), 'cd kart-stats',
  { file: 'castle.txt', text: 'color: gray\nflag: red\nmoat: water' }, 'git add castle.txt', 'git commit -m "Add castle"',
  ...extra,
];
const paint = ['git switch -c paint', { file: 'castle.txt', text: 'color: pink\nflag: red\nmoat: water' }, 'git commit -am "Paint castle pink"', 'git switch main'];
const gold = [{ file: 'castle.txt', text: 'color: gold\nflag: red\nmoat: water' }, 'git commit -am "Paint castle gold"'];
const noMarkers = (t) => !!t && !/^(<<<<<<<|=======|>>>>>>>)/m.test(t);

export default {
  id: 4, name: "Bowser's Keep", icon: '🐢',
  blurb: 'Defeat merge conflicts: when two branches change the same line.',
  levels: [
    {
      id: '4-1', title: 'Bowser Blocks the Pipe', start: 'kart-stats',
      story: 'Peach painted the castle pink on a branch. Meanwhile someone on main painted it gold. Same line, two answers. Git needs YOU to decide.',
      lesson: `<p>A <b>conflict</b> happens when both branches changed the <b>same lines</b>. Like two engineers editing the same dimension on a drawing. Git stops and marks the spot in the file:</p>
<pre>&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD
color: gold        ← your branch (main)
=======
color: pink        ← the branch you're merging
&gt;&gt;&gt;&gt;&gt;&gt;&gt; paint</pre>
<p>To win: edit the file (<code>nano castle.txt</code>), keep the text you want, <b>delete the three marker lines</b>, save. Then <code>git add castle.txt</code> and <code>git commit</code>.</p>`,
      setup: castle([...paint, ...gold]),
      goals: [
        { t: 'Merge paint into main... BOWSER! (conflict)', c: (s) => s.said(/CONFLICT/) },
        { t: 'Edit castle.txt: pick a color, remove all markers', c: (s) => noMarkers(s.file('kart-stats/castle.txt')) && /color:/.test(s.file('kart-stats/castle.txt')), seq: true },
        { t: 'Mark it resolved: git add castle.txt', c: (s) => { const r = s.repo(); return !r.op?.conflicts?.length; }, seq: true },
        { t: 'Finish the merge with git commit', c: (s) => { const r = s.repo(); return r.commits[r.branches.main].parents.length === 2; }, seq: true },
      ],
      hints: ['git merge paint', 'nano castle.txt  → keep one color line, delete <<<<<<<, =======, >>>>>>> lines → Save', 'git add castle.txt', 'git commit -m "Merge paint"  (or plain git commit and save)'],
      solution: ['git merge paint', 'echo "color: pink and gold" > castle.txt', 'echo "flag: red" >> castle.txt', 'echo "moat: water" >> castle.txt', 'git add castle.txt', 'git commit -m "Merge paint: pink and gold castle"'],
      learn: [['<<<<<<< ======= >>>>>>>', 'Conflict markers: yours (HEAD) above =======, theirs below.'], ['resolve conflict', 'Edit file → remove markers → git add file → git commit.']],
      quiz: [{ q: 'You fixed the conflict in castle.txt. Which command marks it as resolved?', a: ['git add castle.txt'] }],
    },
    {
      id: '4-2', title: 'Retreat!', start: 'kart-stats',
      story: 'Sometimes a conflict appears at a bad moment. You can always retreat to safety and come back later.',
      lesson: `<p>Mid-conflict, git is in a special "merging" state (look at the prompt: <code>main|MERGING</code>).</p>
<p><code>git merge --abort</code> cancels the whole merge and puts everything back exactly as before. Nothing is lost. It is the emergency exit.</p>`,
      setup: castle([...paint, ...gold]),
      goals: [
        { t: 'Start the merge of paint (conflict!)', c: (s) => s.said(/CONFLICT/) },
        { t: 'Read git status: "both modified"', c: (s) => s.lastOk(/^git status/) && !!s.repo().op, seq: true },
        { t: 'Retreat with git merge --abort', c: (s) => s.ranOk(/^git merge --abort/) && !s.repo().op, seq: true },
        { t: 'Confirm with git status: clean again', c: (s) => s.lastOk(/^git status/) && s.clean() && !s.repo().op, seq: true },
      ],
      hints: ['git merge paint', 'git status', 'git merge --abort', 'git status'],
      solution: ['git merge paint', 'git status', 'git merge --abort', 'git status'],
      learn: [['git merge --abort', 'Cancel a merge in progress and restore the previous state.']],
      quiz: [{ q: 'Cancel a merge that hit conflicts.', a: ['git merge --abort'] }],
    },
    {
      id: '4-3', title: 'BOSS: Double Trouble', start: 'kart-stats', boss: true,
      story: 'Two branches, paint and moat, both want changes in castle.txt. Merge them both into main. One of them will fight back.',
      lesson: `<p>Merge one branch at a time. After the first merge, the second branch may conflict with what you just merged.</p>
<p>Git only marks lines that truly clash. Other changes in the same file (like the moat) are merged automatically. Keep both teams' work where you can.</p>`,
      setup: castle([...paint, 'git switch -c moat', { file: 'castle.txt', text: 'color: black\nflag: red\nmoat: lava' }, 'git commit -am "Lava moat and black walls"', 'git switch main']),
      goals: [
        { t: 'Merge paint into main', c: (s) => s.contains(s.repo(), 'main', s.findMsg(s.repo(), /^Paint castle pink$/)[0]?.id) },
        { t: 'Merge moat into main and defeat the conflict', c: (s) => { const r = s.repo(); const t = s.tree(r, 'main')['castle.txt']; return s.contains(r, 'main', s.findMsg(r, /^Lava moat/)[0]?.id) && noMarkers(t) && /lava/.test(t); } },
        { t: 'Delete both branches', c: (s) => !s.repo().branches.paint && !s.repo().branches.moat, seq: true },
      ],
      hints: ['git merge paint (a fast-forward)', 'git merge moat → conflict on the color line. The moat line merges by itself!', 'nano castle.txt, pick a color, keep "moat: lava", remove markers, then git add castle.txt && git commit', 'git branch -d paint moat'],
      solution: ['git merge paint', 'git merge moat', 'echo "color: pink" > castle.txt', 'echo "flag: red" >> castle.txt', 'echo "moat: lava" >> castle.txt', 'git add castle.txt', 'git commit -m "Merge moat"', 'git branch -d paint moat'],
      learn: [['git branch -d a b', 'Delete several branches at once.']],
      quiz: [{ q: 'After resolving and staging all conflicted files, which command finishes the merge?', a: ['git commit', 'git merge --continue'] }],
    },
  ],
};
