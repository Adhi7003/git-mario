// World 2: history, detached HEAD, restore, amend, .gitignore.
import { F, historyRepo } from './common.js';

const repo = [...historyRepo(), 'cd kart-stats'];

export default {
  id: 2, name: 'Time Travel', icon: '⏳',
  blurb: 'Read history, visit the past, and undo small mistakes.',
  levels: [
    {
      id: '2-1', title: "Ship's Log", start: 'kart-stats',
      story: 'The project already has five commits. Learn to read its history like a captain\'s log.',
      lesson: `<p><code>git log</code> lists commits newest first. Each has a unique <b>id</b> (hash) like <code>a1b2c3d…</code>. You only need the first 7 characters.</p>
<p><code>git log --oneline</code> is the compact view. <code>git show &lt;id&gt;</code> shows one commit and exactly what it changed.</p>
<p>Relative names save typing: <code>HEAD</code> = the commit you are on, <code>HEAD~1</code> = its parent, <code>HEAD~2</code> = two back.</p>`,
      setup: repo,
      goals: [
        { t: 'View the full history with git log', c: (s) => s.ranOk(/^git log\s*$/) },
        { t: 'Compact view: git log --oneline', c: (s) => s.ranOk(/^git log --oneline/) },
        { t: 'Inspect "Add average calculation" with git show <id>', c: (s) => { const r = s.repo(); const target = s.findMsg(r, /^Add average calculation$/)[0]?.id; return s.env.history.some((h) => { const m = h.cmd.match(/^git show\s+(\S+)/); return m && r.resolve(m[1]) === target; }); } },
        { t: 'Show the latest commit with plain git show', c: (s) => s.ranOk(/^git show(\s+HEAD)?\s*$/) },
      ],
      hints: ['git log', 'git log --oneline', 'Copy the yellow id next to "Add average calculation": git show <id>  (or git show HEAD~2)', 'git show'],
      solution: ['git log', 'git log --oneline', 'git show HEAD~2', 'git show'],
      learn: [['git show <id>', 'Show one commit and its changes.'], ['HEAD~n', 'The commit n steps before HEAD (e.g. HEAD~1 = previous).']],
      quiz: [{ q: 'Show the details of the commit just before the current one (use a relative name).', a: ['git show HEAD~1', 'git show HEAD~', 'git show HEAD^'] }],
    },
    {
      id: '2-2', title: 'Warp to the Past', start: 'kart-stats',
      story: 'Someone asks: "What did laps.py look like in the very first version?" Take the time machine.',
      lesson: `<p><code>git checkout &lt;id&gt;</code> moves Mario (HEAD) onto an old commit and makes your files look exactly like they did then.</p>
<p>Because Mario is now standing on a commit instead of a branch, git calls this <b>"detached HEAD"</b>. It is safe for looking around. Read git's long warning: it is friendly advice.</p>
<p>Come back to the present with <code>git switch main</code>.</p>`,
      setup: repo,
      goals: [
        { t: 'Travel to the commit "Add lap times" (detached HEAD)', c: (s) => { const r = s.repo(); return r.head.detached && r.head.detached === s.findMsg(r, /^Add lap times$/)[0]?.id; } },
        { t: 'While there, cat laps.py to see the old version', c: (s) => s.repo().head.detached && s.lastOk(/^cat\s+laps\.py/), seq: true },
        { t: 'Return to the present: git switch main', c: (s) => s.repo().head.branch === 'main', seq: true },
      ],
      hints: ['git log --oneline to find the id of "Add lap times"', 'git checkout <id>  (or git checkout HEAD~3)', 'cat laps.py', 'git switch main'],
      solution: ['git log --oneline', 'git checkout HEAD~3', 'cat laps.py', 'git switch main'],
      learn: [['git checkout <id>', 'Visit an old commit (detached HEAD).'], ['git switch main', 'Go back to the main branch.']],
      quiz: [{ q: 'You are in detached HEAD. Go back to the main branch.', a: ['git switch main', 'git checkout main'] }],
    },
    {
      id: '2-3', title: 'Undo a Mistake', start: 'kart-stats',
      story: 'Oops! laps.py got wiped by accident, and a file with secrets got staged. Rescue the project before anything is committed.',
      lesson: `<p><code>git restore file</code> throws away unstaged edits and brings back the last saved version. (Careful: those edits are gone.)</p>
<p><code>git restore --staged file</code> takes a file <b>out of the item bag</b> but keeps your edits. It is the undo for <code>git add</code>.</p>
<p>git status even prints these hints for you. Read it!</p>`,
      setup: [...repo, { file: 'laps.py', text: 'OOPS I DELETED EVERYTHING' }, { file: 'secrets.txt', text: 'API_KEY=12345' }, 'git add secrets.txt'],
      goals: [
        { t: 'Inspect the damage with git status', c: (s) => s.ranOk(/^git status/) },
        { t: 'Bring laps.py back with git restore', c: (s) => s.file('kart-stats/laps.py') === F.lapsBest + '\n' },
        { t: 'Unstage secrets.txt with git restore --staged', c: (s) => !('secrets.txt' in s.repo().index) && s.exists('kart-stats/secrets.txt') },
        { t: 'Delete secrets.txt and end with a clean status', c: (s) => !s.exists('kart-stats/secrets.txt') && s.clean() },
      ],
      hints: ['git status', 'git restore laps.py', 'git restore --staged secrets.txt', 'rm secrets.txt'],
      solution: ['git status', 'git restore laps.py', 'git restore --staged secrets.txt', 'rm secrets.txt', 'git status'],
      learn: [['git restore <file>', 'Discard unstaged edits to a file.'], ['git restore --staged <file>', 'Unstage a file (undo git add), keep the edits.']],
      quiz: [{ q: 'You staged notes.txt by accident. Unstage it.', a: ['git restore --staged notes.txt', 'git reset notes.txt', 'git reset HEAD notes.txt'] }],
    },
    {
      id: '2-4', title: 'Fix the Last Commit', start: 'kart-stats',
      story: 'You just committed with a typo in the message ("Add tarck list") and forgot to include cups.txt. Polish that commit before anyone sees it.',
      lesson: `<p><code>git commit --amend -m "New message"</code> <b>replaces</b> the last commit with a fixed one: new message, plus anything you staged.</p>
<p>It does not add a new commit; it swaps the last one (new id!). Golden rule: only amend commits you have <b>not pushed</b> yet.</p>`,
      setup: [...repo, { file: 'tracks.txt', text: F.tracks }, 'git add tracks.txt', 'git commit -m "Add tarck list"', { file: 'cups.txt', text: 'Mushroom Cup\nFlower Cup' }],
      goals: [
        { t: 'Stage the forgotten cups.txt', c: (s) => 'cups.txt' in s.repo().index },
        { t: 'Amend: message "Add track list", including cups.txt', c: (s) => { const r = s.repo(); return s.msg(r) === 'Add track list' && 'cups.txt' in s.tree(r) && s.count(r) === 6; } },
        { t: 'Check git log --oneline: still 6 commits, typo gone', c: (s) => s.lastOk(/^git log/) && s.msg(s.repo()) === 'Add track list', seq: true },
      ],
      hints: ['git add cups.txt', 'git commit --amend -m "Add track list"', 'git log --oneline'],
      solution: ['git add cups.txt', 'git commit --amend -m "Add track list"', 'git log --oneline'],
      learn: [['git commit --amend -m "msg"', 'Replace the last commit (fix message / add forgotten files).']],
      quiz: [{ q: 'Fix the last commit\'s message to "Add tests".', a: ['git commit --amend -m "Add tests"', "git commit --amend -m 'Add tests'"] }],
    },
    {
      id: '2-5', title: 'Keep Secrets Secret', start: 'kart-stats',
      story: 'Your AI coding project has a .env file with an API key, and Python created a __pycache__ folder. Neither must ever reach GitHub!',
      lesson: `<p>A file named <code>.gitignore</code> lists things git should pretend not to see. One pattern per line:</p>
<pre>.env
__pycache__/
*.log</pre>
<p>Ignored files vanish from <code>git status</code> and <code>git add .</code> skips them. For AI/agent projects, <b>always</b> ignore <code>.env</code> before your first commit: leaked API keys get abused within minutes.</p>`,
      setup: [...repo, { file: '.env', text: 'ANTHROPIC_API_KEY=sk-ant-not-a-real-key' }, { file: '__pycache__/laps.cpython-312.pyc', text: '\u0000binary\u0000' }, { file: 'notes.md', text: 'Ideas: add a lap-time chart.' }],
      goals: [
        { t: 'Create .gitignore containing .env', c: (s) => /^\.env\s*$/m.test(s.file('kart-stats/.gitignore') || '') },
        { t: 'Also ignore the __pycache__/ folder', c: (s) => /^\/?__pycache__\/?\s*$/m.test(s.file('kart-stats/.gitignore') || '') },
        { t: 'git status no longer shows .env or __pycache__', c: (s) => { const st = s.status(); return s.lastOk(/^git status/) && !st.untracked.some((p) => /\.env|__pycache__/.test(p)); }, seq: true },
        { t: 'Commit .gitignore and notes.md (but never .env!)', c: (s) => { const t = s.tree(s.repo()); return '.gitignore' in t && 'notes.md' in t && !('.env' in t); } },
      ],
      hints: ['echo ".env" > .gitignore', 'echo "__pycache__/" >> .gitignore', 'git status', 'git add . && git commit -m "Add gitignore and notes"'],
      solution: ['echo ".env" > .gitignore', 'echo "__pycache__/" >> .gitignore', 'git status', 'git add .', 'git commit -m "Add gitignore and notes"'],
      learn: [['.gitignore', 'File listing patterns git should ignore (.env, __pycache__/, *.log).']],
      quiz: [{ q: 'Add the line .env to .gitignore using echo (append).', a: ['echo ".env" >> .gitignore', "echo '.env' >> .gitignore", 'echo .env >> .gitignore'] }],
    },
  ],
};
