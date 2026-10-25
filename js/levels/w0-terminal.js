// World 0: terminal basics.
export default {
  id: 0, name: 'Terminal Town', icon: '🖥️',
  blurb: 'Learn to move around and make files using only the keyboard.',
  levels: [
    {
      id: '0-1', title: 'Where Am I?', repo: null,
      story: 'Welcome to the Mushroom Kingdom, plumber! Before any adventure, you need to know where you are standing.',
      lesson: `<p>The <b>terminal</b> is a text conversation with your computer. You type a command, press <kbd>Enter</kbd>, it answers.</p>
<p>Read the <b>prompt</b> left to right: <code>player@mushroom ~ %</code> = <i>user</i>@<i>computer</i>, current folder (<code>~</code> means your home folder), and <code>%</code> = "ready for your command". Your Mac's zsh prompt looks just like this.</p>
<p>Three commands to start: <code>pwd</code> (where am I?), <code>ls</code> (what's here?), <code>cat file</code> (show a file).</p>`,
      setup: ['mkdir castle pipes', { file: 'notes.txt', text: 'The princess is in another castle!' }, { file: 'castle/toad.txt', text: 'Toad was here.' }],
      goals: [
        { t: 'Print your current location with pwd', c: (s) => s.ranOk(/^pwd$/) },
        { t: 'List what is here with ls', c: (s) => s.ranOk(/^ls\b/) },
        { t: 'Read notes.txt with cat', c: (s) => s.ranOk(/^cat\s+(\.\/)?notes\.txt$/) },
      ],
      hints: ['Type pwd and press Enter. It stands for "print working directory".', 'ls lists files (white) and folders (blue).', 'cat notes.txt'],
      solution: ['pwd', 'ls', 'cat notes.txt'],
      learn: [['pwd', 'Print the folder you are in (print working directory).'], ['ls', 'List files and folders here.'], ['cat <file>', 'Print a file\'s contents.']],
      quiz: [{ q: 'Which command prints the folder you are currently in?', a: ['pwd'] }, { q: 'Which command lists the files in the current folder?', a: ['ls'] }],
    },
    {
      id: '0-2', title: 'Warp Pipes', repo: null,
      story: 'Peach left a message at the very top of the castle tower. Use folders like warp pipes to get there and back.',
      lesson: `<p><code>cd &lt;folder&gt;</code> = <b>change directory</b>. You can go several levels at once: <code>cd castle/tower/top</code>.</p>
<ul><li><code>cd ..</code> goes <b>up</b> one level (the parent folder)</li><li><code>cd ~</code> or just <code>cd</code> warps home</li><li><code>cd -</code> jumps back to where you just were</li></ul>
<p>Pro tip: type the first letters and press <kbd>Tab</kbd> to auto-complete names. Real engineers type half the letters!</p>`,
      setup: ['mkdir -p castle/tower/top pipes/underground', { file: 'castle/tower/top/peach.txt', text: 'Thank you Mario! Your quest is over... just kidding, it has only begun.' }, { file: 'pipes/underground/coins.txt', text: '🪙🪙🪙' }],
      goals: [
        { t: 'Enter the castle folder', c: (s) => s.cwd() === '~/castle' || s.cwd().startsWith('~/castle/') },
        { t: 'Get into castle/tower/top and cat peach.txt', c: (s) => s.ranOk(/^cat\s+.*peach\.txt$/) },
        { t: 'Go up one level with cd ..', c: (s) => s.lastOk(/^cd\s+\.\.\/?/), seq: true },
        { t: 'Warp home with cd ~ (or just cd)', c: (s) => s.in('~'), seq: true },
        { t: 'Reach pipes/underground with ONE cd command', c: (s) => s.in('pipes/underground') && s.lastOk(/^cd\s+\S*pipes\/underground/) },
      ],
      hints: ['cd castle', 'From castle: cd tower/top, then cat peach.txt', 'cd .. goes up one level. Then cd ~ goes home.', 'cd pipes/underground'],
      solution: ['cd castle', 'cd tower/top', 'cat peach.txt', 'cd ..', 'cd ~', 'cd pipes/underground'],
      learn: [['cd <folder>', 'Move into a folder.'], ['cd ..', 'Go up one folder.'], ['cd ~', 'Go to your home folder.'], ['Tab key', 'Auto-complete file and folder names.']],
      quiz: [{ q: 'Type the command that moves you up one folder.', a: ['cd ..'] }, { q: 'Type the command that takes you to your home folder.', a: ['cd ~', 'cd'] }],
    },
    {
      id: '0-3', title: 'Build a Level', repo: null,
      story: 'Time to build World 1. Make a folder for it and write down the enemies that live there.',
      lesson: `<p><code>mkdir name</code> makes a folder. <code>touch file</code> makes an empty file.</p>
<p><code>echo "text"</code> prints text. Add an arrow to send it into a file instead of the screen:</p>
<ul><li><code>echo "goomba" &gt; enemies.txt</code> <b>writes</b> (replaces the file!)</li><li><code>echo "koopa" &gt;&gt; enemies.txt</code> <b>appends</b> a new line</li></ul>
<p>Quotes keep words together. Most commands print nothing when they succeed. Silence is good news.</p>`,
      setup: [],
      goals: [
        { t: 'Create a folder called world-1', c: (s) => s.isDir('world-1') },
        { t: 'Go inside it', c: (s) => s.in('world-1') },
        { t: 'Create an empty file level.txt with touch', c: (s) => s.exists('world-1/level.txt') },
        { t: 'Write "goomba" into enemies.txt with echo and >', c: (s) => /goomba/.test(s.file('world-1/enemies.txt') || '') },
        { t: 'Append "koopa" as a 2nd line with >>', c: (s) => /goomba\s*\n\s*koopa/.test(s.file('world-1/enemies.txt') || '') },
        { t: 'Show enemies.txt with cat', c: (s) => s.lastOk(/^cat\s+.*enemies\.txt/) && /koopa/.test(s.file('world-1/enemies.txt') || '') },
      ],
      hints: ['mkdir world-1 then cd world-1', 'touch level.txt', 'echo "goomba" > enemies.txt', 'echo "koopa" >> enemies.txt  (two arrows = append)'],
      solution: ['mkdir world-1', 'cd world-1', 'touch level.txt', 'echo "goomba" > enemies.txt', 'echo "koopa" >> enemies.txt', 'cat enemies.txt'],
      learn: [['mkdir <name>', 'Make a new folder.'], ['touch <file>', 'Create an empty file.'], ['echo "x" > file', 'Write text into a file (overwrites).'], ['echo "x" >> file', 'Append a line to a file.']],
      quiz: [{ q: 'Make a folder called levels.', a: ['mkdir levels'] }, { q: 'Append the line boo to ghosts.txt (keep existing lines).', a: ['echo "boo" >> ghosts.txt', "echo 'boo' >> ghosts.txt", 'echo boo >> ghosts.txt'] }],
    },
    {
      id: '0-4', title: 'Spring Cleaning', repo: null, start: 'junk-room',
      story: 'The junk room is a mess: a typo, a hidden secret, and broken pipes everywhere. Clean it up!',
      lesson: `<p>Files starting with a dot (like <code>.secret</code> or <code>.git</code>) are <b>hidden</b>. <code>ls -a</code> shows them.</p>
<ul><li><code>mv old new</code> moves or <b>renames</b></li><li><code>cp a b</code> copies</li><li><code>rm file</code> deletes; folders need <code>rm -r folder</code></li></ul>
<p>⚠️ There is no trash can in the terminal. <code>rm</code> is forever. Press <kbd>↑</kbd> to recall previous commands and <code>clear</code> (or <kbd>Ctrl+L</kbd>) to tidy the screen.</p>`,
      setup: ['mkdir -p junk-room/broken-pipes', 'cd junk-room', { file: 'old-map.txt', text: 'outdated map' }, { file: '.secret', text: 'Warp zone: World 4-2, jump over the ceiling!' }, { file: 'mushrom.txt', text: 'Super Mushroom: makes you big' }, 'touch broken-pipes/pipe1 broken-pipes/pipe2'],
      goals: [
        { t: 'Reveal hidden files with ls -a', c: (s) => s.ranOk(/^ls\s+(-\w*a\w*)/) },
        { t: 'Read the hidden .secret file', c: (s) => s.ranOk(/^cat\s+\.secret/) },
        { t: 'Fix the typo: rename mushrom.txt to mushroom.txt', c: (s) => s.exists('junk-room/mushroom.txt') && !s.exists('junk-room/mushrom.txt') },
        { t: 'Back it up: copy mushroom.txt to backup.txt', c: (s) => s.exists('junk-room/backup.txt') },
        { t: 'Delete old-map.txt', c: (s) => !s.exists('junk-room/old-map.txt') },
        { t: 'Delete the broken-pipes folder (needs -r)', c: (s) => !s.exists('junk-room/broken-pipes') },
      ],
      hints: ['ls -a', 'cat .secret', 'mv mushrom.txt mushroom.txt', 'cp mushroom.txt backup.txt, then rm old-map.txt', 'rm -r broken-pipes'],
      solution: ['ls -a', 'cat .secret', 'mv mushrom.txt mushroom.txt', 'cp mushroom.txt backup.txt', 'rm old-map.txt', 'rm -r broken-pipes'],
      learn: [['ls -a', 'List including hidden (dot) files.'], ['mv <a> <b>', 'Move or rename.'], ['cp <a> <b>', 'Copy a file (-r for folders).'], ['rm <file>', 'Delete a file (rm -r for folders). No undo!'], ['clear / Ctrl+L', 'Clear the screen. ↑ recalls old commands.']],
      quiz: [{ q: 'Rename draft.txt to final.txt.', a: ['mv draft.txt final.txt'] }, { q: 'Show ALL files including hidden ones.', a: ['ls -a', 'ls -la', 'ls -al'] }],
    },
  ],
};
