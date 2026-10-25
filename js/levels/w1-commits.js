// World 1: init, status, add, commit, diff.
import { F, baseRepo } from './common.js';

const project = ['mkdir kart-stats', 'cd kart-stats', { file: 'README.md', text: F.readme }, { file: 'laps.py', text: F.laps }];

export default {
  id: 1, name: 'First Coins', icon: '🪙',
  blurb: 'Create a repository and save your first snapshots (commits).',
  levels: [
    {
      id: '1-1', title: 'Press Start',
      story: 'You have a little Python project, kart-stats, that analyses Mario Kart lap times. Right now git knows nothing about it.',
      lesson: `<p>A <b>repository</b> (repo) is a project folder whose history git tracks. Think of it like a CAD vault: every saved revision is kept with a note, and you can always go back.</p>
<p><code>git init</code> turns the current folder into a repo by creating a hidden <code>.git</code> folder. That folder IS the history: delete it and the history is gone.</p>
<p>You run <code>git init</code> once per project. (For projects that already exist on GitHub you use <code>git clone</code> instead: World 5.)</p>`,
      setup: [...project, 'cd ~'],
      goals: [
        { t: 'cd into kart-stats', c: (s) => s.in('kart-stats') },
        { t: 'Run git status and read the error (no repo yet!)', c: (s) => s.said(/not a git repository/) },
        { t: 'Turn the folder into a repository with git init', c: (s) => !!s.repo() },
        { t: 'Spot the hidden .git folder with ls -a', c: (s) => !!s.repo() && s.lastOk(/^ls\s+-\w*a/), seq: true },
      ],
      hints: ['cd kart-stats', 'git status', 'git init', 'ls -a'],
      solution: ['cd kart-stats', 'git status', 'git init', 'ls -a'],
      learn: [['git init', 'Turn the current folder into a git repository (creates .git).']],
      quiz: [{ q: 'Which command turns the current folder into a git repository?', a: ['git init'] }],
    },
    {
      id: '1-2', title: 'The Item Bag', start: 'kart-stats',
      story: 'Git does not save files automatically. You choose what goes into each snapshot by putting it in the item bag: the staging area.',
      lesson: `<p>Every file lives in one of three places (see the panel at the bottom right):</p>
<ol><li><b>Working directory</b>: the files you edit</li><li><b>Staging area</b> 🎒: what you have <i>chosen</i> for the next snapshot</li><li><b>Repository</b> 🪙: the saved snapshots (commits)</li></ol>
<p><code>git status</code> tells you where everything stands: <span class="red">red</span> = not staged, <span class="green">green</span> = staged.</p>
<p><code>git add file</code> stages one file; <code>git add .</code> stages everything in this folder.</p>`,
      setup: [...project, { file: 'data.csv', text: F.data }, 'git init'],
      goals: [
        { t: 'Check git status: everything is untracked (red)', c: (s) => s.ranOk(/^git status/) },
        { t: 'Stage only README.md', c: (s) => 'README.md' in (s.repo()?.index || {}) },
        { t: 'Run git status again: README.md is green now', c: (s) => s.lastOk(/^git status/) && 'README.md' in s.repo().index, seq: true },
        { t: 'Stage everything else with git add .', c: (s) => ['laps.py', 'data.csv'].every((p) => p in s.repo().index) },
      ],
      hints: ['git status', 'git add README.md', 'git status', 'git add .'],
      solution: ['git status', 'git add README.md', 'git status', 'git add .'],
      learn: [['git status', 'Show what is changed, staged and untracked.'], ['git add <file>', 'Stage a file for the next commit.'], ['git add .', 'Stage all changes in the current folder.']],
      quiz: [{ q: 'Stage every change in the current folder.', a: ['git add .', 'git add -A', 'git add --all'] }, { q: 'Which command shows staged vs unstaged files?', a: ['git status'] }],
    },
    {
      id: '1-3', title: 'First Coin', start: 'kart-stats', noIdentity: true,
      story: 'Your files are in the item bag. Time to save the very first snapshot! But git has never met you...',
      lesson: `<p>A <b>commit</b> is a permanent snapshot of everything staged, with a message saying <i>why</i>. Like a drawing revision with a change note.</p>
<p><code>git commit -m "Add kart stats project"</code></p>
<p>Every commit is signed with your name and email. On a new computer git will refuse until you introduce yourself once:</p>
<pre>git config --global user.name "Your Name"
git config --global user.email "you@example.com"</pre>
<p>Use your real name here: we'll stamp it on your commits in later levels.</p>`,
      setup: [...project, 'git init', 'git add .'],
      goals: [
        { t: 'Tell git your name (user.name)', c: (s) => !!s.env.getConfig('user.name', s.repo()) },
        { t: 'Tell git your email (user.email)', c: (s) => !!s.env.getConfig('user.email', s.repo()) },
        { t: 'Make your first commit with a message', c: (s) => !!s.repo().headId() },
        { t: 'See it in the history with git log', c: (s) => s.ranOk(/^git log/) && !!s.repo().headId() },
      ],
      hints: ['Try git commit -m "Add kart stats project" and read the error.', 'git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"', 'git commit -m "Add kart stats project" then git log'],
      solution: ['git config --global user.name "Player"', 'git config --global user.email "player@example.com"', 'git commit -m "Add kart stats project"', 'git log'],
      learn: [['git config --global user.name "Name"', 'Set your name for all commits (once per computer).'], ['git commit -m "msg"', 'Save the staged changes as a snapshot.'], ['git log', 'Show the commit history (press q to quit in a real terminal).']],
      quiz: [{ q: 'Commit staged changes with the message "Fix typo".', a: ['git commit -m "Fix typo"', "git commit -m 'Fix typo'"] }, { q: 'Which command shows the commit history?', a: ['git log'] }],
    },
    {
      id: '1-4', title: 'Spot the Difference', start: 'kart-stats',
      story: 'You added an average calculation to laps.py. Before saving, check exactly what changed.',
      lesson: `<p><code>git diff</code> shows changes you have <b>not staged</b> yet: <span class="green">+ green</span> lines added, <span class="red">- red</span> lines removed.</p>
<p>After <code>git add</code>, plain <code>git diff</code> goes quiet. To see what is <b>staged</b> use <code>git diff --staged</code>. Reviewing the diff before committing is a great habit, especially when an AI wrote the code!</p>`,
      setup: [...baseRepo(), 'cd kart-stats', { file: 'laps.py', text: F.lapsAvg }],
      goals: [
        { t: 'See what changed with git diff', c: (s) => s.ranOk(/^git diff\s*$/) },
        { t: 'Stage laps.py', c: (s) => s.repo().index['laps.py'] === F.lapsAvg + '\n' },
        { t: 'View the staged changes with git diff --staged', c: (s) => s.ranOk(/^git diff --(staged|cached)/), seq: true },
        { t: 'Commit the change', c: (s) => s.count(s.repo()) >= 4 && s.clean() },
      ],
      hints: ['git diff', 'git add laps.py', 'git diff --staged', 'git commit -m "Add average calculation"'],
      solution: ['git diff', 'git add laps.py', 'git diff --staged', 'git commit -m "Add average calculation"'],
      learn: [['git diff', 'Show unstaged changes line by line.'], ['git diff --staged', 'Show what is staged for the next commit.']],
      quiz: [{ q: 'Show the changes that are already staged.', a: ['git diff --staged', 'git diff --cached'] }],
    },
    {
      id: '1-5', title: 'BOSS: Coin Rush', start: 'kart-stats', boss: true,
      story: 'Show what you have learned: add three more snapshots to the project, all by yourself. Any changes you like!',
      lesson: `<p>The daily loop you will use a thousand times:</p>
<pre>edit files  →  git status  →  git add …  →  git commit -m "…"</pre>
<p>Shortcut: <code>git commit -am "msg"</code> stages <b>already-tracked</b> files and commits in one go (new files still need <code>git add</code>).</p>
<p>Good messages say <i>what and why</i> in the imperative: "Add best lap", "Fix average rounding".</p>`,
      setup: [...baseRepo(), 'cd kart-stats'],
      goals: [
        { t: 'Make commit #4', c: (s) => s.count(s.repo()) >= 4 },
        { t: 'Make commit #5', c: (s) => s.count(s.repo()) >= 5 },
        { t: 'Make commit #6', c: (s) => s.count(s.repo()) >= 6 },
        { t: 'Leave the working tree clean', c: (s) => s.count(s.repo()) >= 6 && s.clean() },
        { t: 'Admire your history with git log --oneline', c: (s) => s.lastOk(/^git log .*--oneline|^git log --oneline/) && s.count(s.repo()) >= 6, seq: true },
      ],
      hints: ['Make a change: echo "Rainbow Road" >> tracks.txt', 'git add . && git commit -m "Add Rainbow Road"', 'Repeat with other changes. git commit -am "msg" works for tracked files.', 'git log --oneline'],
      solution: ['echo "Rainbow Road" >> tracks.txt', 'git commit -am "Add Rainbow Road"', 'echo "best = min(laps)" >> laps.py', 'git commit -am "Add best lap"', 'echo "Mushroom Cup data" > notes.md', 'git add notes.md', 'git commit -m "Add notes"', 'git log --oneline'],
      learn: [['git commit -am "msg"', 'Stage all tracked changes and commit in one step.'], ['git log --oneline', 'Compact history: one line per commit.']],
      quiz: [{ q: 'Stage all tracked files and commit with message "Update laps" in one command.', a: ['git commit -am "Update laps"', "git commit -am 'Update laps'", 'git commit -a -m "Update laps"'] }],
    },
  ],
};
