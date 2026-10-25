// A small zsh-like shell: quoting, &&, ;, > and >> redirects, * globs, and the basic file commands.
import { C, stripAnsi } from './util.js';
import { HOME, join, dirname, basename, tilde } from './vfs.js';
import { git } from './git/index.js';

export function tokenize(line) {
  const toks = [];
  let cur = null, quote = null, glob = false;
  const push = () => { if (cur !== null) toks.push({ t: 'w', v: cur, glob }); cur = null; glob = false; };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && '"\\$`'.includes(line[i + 1] ?? '')) cur += line[++i];
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur = cur ?? ''; continue; }
    if (ch === '\\') { cur = (cur ?? '') + (line[++i] ?? ''); continue; }
    if (ch === '#' && cur === null) break;
    if (/\s/.test(ch)) { push(); continue; }
    if (ch === '&' && line[i + 1] === '&') { push(); toks.push({ t: 'op', v: '&&' }); i++; continue; }
    if (ch === '|' && line[i + 1] === '|') { push(); toks.push({ t: 'op', v: '||' }); i++; continue; }
    if (ch === ';' || ch === '|' || ch === '&') { push(); toks.push({ t: 'op', v: ch }); continue; }
    if (ch === '>') {
      push();
      if (line[i + 1] === '>') { toks.push({ t: 'op', v: '>>' }); i++; } else toks.push({ t: 'op', v: '>' });
      continue;
    }
    if (ch === '*' || ch === '?') glob = true;
    cur = (cur ?? '') + ch;
  }
  if (quote) return { error: quote };
  push();
  return { toks };
}

function expandGlob(env, word) {
  const abs = env.fs.resolve(env.cwd, word);
  const dir = dirname(abs), pat = basename(abs);
  const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  const names = (env.fs.list(dir) || []).filter((n) => re.test(n) && (pat.startsWith('.') || !n.startsWith('.')));
  const prefix = word.includes('/') ? word.slice(0, word.lastIndexOf('/') + 1) : '';
  return names.map((n) => prefix + n);
}

const ERR = { ENOENT: 'No such file or directory', EEXIST: 'File exists', ENOTDIR: 'Not a directory', EISDIR: 'Is a directory' };

const ok = (out = '', coach) => ({ out, coach });
const fail = (out, coach) => ({ out, err: true, coach });

const BUILTINS = {
  pwd: (env) => ok(env.cwd, `📍 You are here: ${env.cwd}. In the prompt this shows as ${tilde(env.cwd)} (~ means your home folder).`),

  ls: (env, args) => {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const all = flags.includes('a'), long = flags.includes('l');
    const targets = args.filter((a) => !a.startsWith('-'));
    const out = [];
    for (const t of targets.length ? targets : ['.']) {
      const abs = env.fs.resolve(env.cwd, t);
      const node = env.fs.get(abs);
      if (!node) return fail(`ls: ${t}: No such file or directory`);
      if (targets.length > 1) out.push(`${t}:`);
      if (node.type === 'file') { out.push(t); continue; }
      let names = env.fs.list(abs);
      if (node.repo) names = ['HEAD', 'config', 'description', 'hooks', 'index', 'info', 'logs', 'objects', 'refs'];
      if (!all) names = names.filter((n) => !n.startsWith('.'));
      else names = ['.', '..', ...names];
      const fmt = (n) => {
        const child = n === '.' || n === '..' || node.repo ? { type: n === 'HEAD' || n === 'config' || n === 'description' || n === 'index' ? 'file' : 'dir' } : node.children[n];
        return child.type === 'dir' ? C.boldBlue(n) : n;
      };
      if (long) {
        out.push(`total ${names.length * 8}`);
        for (const n of names) {
          const child = node.children?.[n];
          const isDir = n === '.' || n === '..' || child?.type === 'dir';
          const size = child?.type === 'file' ? child.content.length : 96;
          out.push(`${isDir ? 'drwxr-xr-x' : '-rw-r--r--'}  1 player  staff  ${String(size).padStart(5)} Oct  2 09:00 ${fmt(n)}`);
        }
      } else if (names.length) out.push(names.map(fmt).join('  '));
    }
    const hidden = all && (env.fs.list(env.cwd) || []).some((n) => n.startsWith('.'));
    return ok(out.join('\n'), all
      ? (hidden ? '👀 -a shows hidden "dot files" too. .git is where git keeps all its history (never edit it by hand!).' : '-a shows hidden files (names starting with a dot).')
      : '📂 Blue names are folders, white names are files. Hidden files (starting with .) need ls -a.');
  },

  cd: (env, args) => {
    let t = args[0];
    if (t === '-') t = env.prevCwd;
    const abs = env.fs.resolve(env.cwd, t);
    const node = env.fs.get(abs);
    if (!node) return fail(`cd: no such file or directory: ${args[0]}`, 'That folder does not exist here. Use ls to see what is around you, or pwd to see where you are.');
    if (node.type !== 'dir') return fail(`cd: not a directory: ${args[0]}`);
    env.prevCwd = env.cwd;
    env.cwd = abs;
    const coach = !t || t === '~' ? '🏠 Back home (~).' : t.includes('..') ? '⬆️ .. means "the parent folder" (one level up).' : `🚪 Entered ${tilde(abs)}. Notice the prompt changed.`;
    return ok('', coach);
  },

  mkdir: (env, args) => {
    const p = args.includes('-p');
    for (const a of args.filter((x) => x !== '-p')) {
      const abs = env.fs.resolve(env.cwd, a);
      if (p) { env.fs.mkdirp(abs); continue; }
      const e = env.fs.mkdir(abs);
      if (e) return fail(`mkdir: ${a}: ${ERR[e]}`);
    }
    return ok('', '📁 Folder created. (Most terminal commands print nothing when they succeed.)');
  },

  touch: (env, args) => {
    if (!args.length) return fail('usage: touch file ...');
    for (const a of args) {
      const abs = env.fs.resolve(env.cwd, a);
      if (env.fs.get(abs)) continue;
      const e = env.fs.write(abs, '');
      if (e) return fail(`touch: ${a}: ${ERR[e]}`);
    }
    return ok('', '📄 Empty file created.');
  },

  cat: (env, args) => {
    const out = [];
    for (const a of args) {
      const abs = env.fs.resolve(env.cwd, a);
      if (abs.endsWith('/.git/HEAD') && env.fs.get(dirname(abs))?.repo) {
        const r = env.fs.get(dirname(abs)).repo;
        out.push(r.head.branch !== undefined ? `ref: refs/heads/${r.head.branch}` : r.head.detached);
        continue;
      }
      const n = env.fs.get(abs);
      if (!n) return fail(`cat: ${a}: No such file or directory`);
      if (n.type === 'dir') return fail(`cat: ${a}: Is a directory`);
      out.push(n.content.replace(/\n$/, ''));
    }
    return ok(out.join('\n'), '🐱 cat prints a file\'s contents.');
  },

  echo: (env, args) => {
    const n = args[0] === '-n';
    return { out: (n ? args.slice(1) : args).join(' '), raw: true, noNewline: n };
  },

  rm: (env, args) => {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const rec = /r|R/.test(flags), force = flags.includes('f');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (!targets.length) return fail('usage: rm [-f | -i] [-dPRrvWx] file ...');
    let gitGone = false;
    for (const a of targets) {
      const abs = env.fs.resolve(env.cwd, a);
      const n = env.fs.get(abs);
      if (!n) { if (force) continue; return fail(`rm: ${a}: No such file or directory`); }
      if (n.type === 'dir' && !rec) return fail(`rm: ${a}: is a directory`, 'To delete a folder and everything inside, use rm -r (careful: there is no trash can in the terminal!).');
      if (n.repo || (n.type === 'dir' && JSON.stringify(Object.keys(n.children)).includes('.git'))) gitGone = true;
      if (env.cwd === abs || env.cwd.startsWith(abs + '/')) env.cwd = dirname(abs);
      env.fs.remove(abs);
    }
    return ok('', gitGone ? '☠️ You deleted a .git folder: that project\'s entire history is gone. (In real life, this is unrecoverable!)' : '🗑 Deleted. The terminal has no trash can, so be careful with rm.');
  },

  mv: (env, args) => {
    if (args.length !== 2) return fail('usage: mv source target');
    const src = env.fs.resolve(env.cwd, args[0]);
    let dst = env.fs.resolve(env.cwd, args[1]);
    if (!env.fs.get(src)) return fail(`mv: rename ${args[0]} to ${args[1]}: No such file or directory`);
    if (env.fs.isDir(dst)) dst = join(dst, basename(src));
    const e = env.fs.move(src, dst);
    if (e) return fail(`mv: rename ${args[0]} to ${args[1]}: ${ERR[e]}`);
    return ok('', '🚚 mv moves OR renames (renaming = moving to a new name).');
  },

  cp: (env, args) => {
    const rec = args.some((a) => /^-[rR]/.test(a));
    const [a, b] = args.filter((x) => !x.startsWith('-'));
    if (!a || !b) return fail('usage: cp [-r] source_file target_file');
    const src = env.fs.resolve(env.cwd, a);
    let dst = env.fs.resolve(env.cwd, b);
    const n = env.fs.get(src);
    if (!n) return fail(`cp: ${a}: No such file or directory`);
    if (env.fs.isDir(dst)) dst = join(dst, basename(src));
    if (n.type === 'dir') {
      if (!rec) return fail(`cp: ${a} is a directory (not copied).`);
      const files = env.fs.walkFiles(src);
      env.fs.mkdirp(dst);
      for (const [p, c] of Object.entries(files)) env.fs.setFile(dst, p, c);
    } else {
      const e = env.fs.write(dst, n.content);
      if (e) return fail(`cp: ${b}: ${ERR[e]}`);
    }
    return ok('', '📑 Copied.');
  },

  tree: (env, args) => {
    const abs = env.fs.resolve(env.cwd, args[0] || '.');
    if (!env.fs.isDir(abs)) return fail(`${args[0]} [error opening dir]`);
    const out = [C.boldBlue(args[0] || '.')];
    let dirs = 0, files = 0;
    const walk = (a, pre) => {
      const names = env.fs.list(a).filter((n) => !n.startsWith('.'));
      names.forEach((n, i) => {
        const last = i === names.length - 1;
        const child = env.fs.get(join(a, n));
        out.push(`${pre}${last ? '└── ' : '├── '}${child.type === 'dir' ? C.boldBlue(n) : n}`);
        if (child.type === 'dir') { dirs++; walk(join(a, n), pre + (last ? '    ' : '│   ')); } else files++;
      });
    };
    walk(abs, '');
    out.push('', `${dirs} directories, ${files} files`);
    return ok(out.join('\n'), '🌳 tree draws folders and files as a map.');
  },

  clear: () => ({ out: '', clear: true }),
  history: (env) => ok(env.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h.cmd}`).join('\n'), 'Tip: press ↑ to bring back earlier commands instead of retyping them.'),
  whoami: () => ok('player'),
  date: () => ok('Fri Oct  2 09:00:00 UTC 2026'),
  exit: () => ok('🍄 Nice try! There is no escaping the Mushroom Kingdom. (In a real terminal, exit closes the window.)'),
  man: (env, args) => ok(`🍄 Manual pages open in a pager in a real terminal (press q to quit). Here, try: git help${args[1] ? ' ' + args[1] : ''}`),
  python: () => fail('🐍 Python is resting in this game: we only practice terminal + git here.'),
  python3: () => fail('🐍 Python is resting in this game: we only practice terminal + git here.'),
  code: (env, args) => openEditor(env, args, 'code'),
  nano: (env, args) => openEditor(env, args, 'nano'),
  vim: (env, args) => openEditor(env, args, 'vim'),
  vi: (env, args) => openEditor(env, args, 'vim'),
  open: (env, args) => openEditor(env, args, 'open'),
  git: (env, args) => git(env, args),
  hint: (env) => (env.hooks.hint ? env.hooks.hint() : ok('No hints in sandbox mode. Experiment freely!')),
  help: () => ok([
    C.bold('Terminal commands in Git Quest'),
    '  pwd                 print where you are',
    '  ls [-a] [-l] [dir]  list files (-a includes hidden files)',
    '  cd <dir>            change directory (cd .. = up, cd ~ = home, cd - = back)',
    '  mkdir [-p] <dir>    make a directory',
    '  touch <file>        create an empty file',
    '  echo "text" > f     write text to a file  (>> appends)',
    '  cat <file>          show a file',
    '  nano <file>         edit a file in a small editor',
    '  mv / cp / rm [-r]   move/rename, copy, delete',
    '  tree                draw the folder structure',
    '  clear               clear the screen (or Ctrl+L)',
    '  history             list previous commands (or press ↑)',
    '  hint                get a hint for the current level',
    '  git help            list git commands',
    '',
    'Chain commands with && (run next only if previous succeeded). Press Tab to auto-complete.',
  ].join('\n')),
};

function openEditor(env, args, which) {
  const file = args.find((a) => !a.startsWith('-'));
  if (!file) return fail(`usage: ${which} <file>`);
  const abs = env.fs.resolve(env.cwd, file);
  const n = env.fs.get(abs);
  if (n?.type === 'dir') return fail(`${file} is a directory`);
  if (!env.fs.isDir(dirname(abs))) return fail(`${which}: ${file}: No such file or directory`);
  const note = which === 'vim' ? '🧙 Real Vim is a boss of its own (i = type, Esc then :wq = save & quit). Here we open a friendly editor instead.'
    : which === 'code' ? '💻 In real life "code file" opens VS Code (needs the "code" command installed). Here we open the built-in editor.'
      : '📝 nano is a simple terminal editor. Ctrl+O saves, Ctrl+X exits (same here).';
  return {
    out: '', coach: note,
    editor: {
      title: tilde(abs), content: n ? n.content : '', file: true,
      onSave: (text) => {
        env.fs.write(abs, text === '' || text.endsWith('\n') ? text : text + '\n');
        return ok('', `💾 Saved ${basename(abs)}.`);
      },
      onCancel: () => ok(''),
    },
  };
}

export const COMMANDS = Object.keys(BUILTINS).sort();

// Run one line. Returns {chunks:[{text, err}], coach, editor, clear}.
export function runLine(env, line) {
  const res = { chunks: [], coach: null, editor: null, clear: false, err: false };
  if (!line.trim()) return res;
  const tk = tokenize(line);
  if (tk.error) {
    res.chunks.push({ text: `zsh: unmatched ${tk.error}`, err: true });
    res.coach = `You opened a ${tk.error} quote but never closed it. (A real terminal would show "dquote>" and wait for more input. Press Ctrl+C to escape.)`;
    res.err = true;
    return res;
  }
  // Split into segments joined by && ; ||
  const segs = [];
  let cur = { words: [], redirect: null, joiner: null };
  const toks = tk.toks;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'op' && (t.v === '&&' || t.v === ';' || t.v === '||')) { segs.push(cur); cur = { words: [], redirect: null, joiner: t.v }; continue; }
    if (t.t === 'op' && (t.v === '>' || t.v === '>>')) {
      const target = toks[++i];
      if (!target || target.t !== 'w') { res.chunks.push({ text: "zsh: parse error near `\\n'", err: true }); res.err = true; return res; }
      cur.redirect = { append: t.v === '>>', file: target.v };
      continue;
    }
    if (t.t === 'op') {
      res.chunks.push({ text: `🍄 Pipes (|) and background jobs (&) aren't supported in Git Quest. Run one command at a time.`, err: true });
      res.err = true;
      return res;
    }
    cur.words.push(t);
  }
  segs.push(cur);

  let lastErr = false;
  for (const seg of segs) {
    if (seg.joiner === '&&' && lastErr) continue;
    if (seg.joiner === '||' && !lastErr) continue;
    const words = [];
    for (const w of seg.words) {
      if (w.glob) {
        const m = expandGlob(env, w.v);
        if (!m.length) { res.chunks.push({ text: `zsh: no matches found: ${w.v}`, err: true }); lastErr = true; words.length = 0; break; }
        words.push(...m);
      } else words.push(w.v.replace(/^~(?=\/|$)/, HOME));
    }
    if (!words.length) continue;
    const [cmd, ...args] = words;
    const fn = BUILTINS[cmd];
    let r;
    if (!fn) {
      r = fail(`zsh: command not found: ${cmd}`, /^(gti|gi|got|gt)$/.test(cmd) ? 'Typo! You meant git 😉' : `"${cmd}" isn't a command here. Type help to see what is available.`);
    } else {
      try { r = fn(env, args); } catch (e) { console.error(e); r = fail(`🐛 Oops, the game engine tripped on that command: ${e.message}`); }
    }
    if (seg.redirect) {
      const abs = env.fs.resolve(env.cwd, seg.redirect.file);
      const text = stripAnsi(r.out || '');
      const content = r.noNewline || text === '' ? text : text + '\n';
      const e = env.fs.isDir(abs) ? 'EISDIR' : env.fs.write(abs, content, seg.redirect.append);
      if (e) r = fail(`zsh: ${ERR[e].toLowerCase()}: ${seg.redirect.file}`);
      else r = { ...r, out: '', coach: cmd === 'echo' ? (seg.redirect.append ? `➕ >> APPENDED a line to ${seg.redirect.file}.` : `✍️ > wrote into ${seg.redirect.file} (replacing what was there). Use >> to add to the end instead.`) : r.coach };
    }
    if (r.out) res.chunks.push({ text: r.out, err: !!r.err });
    if (r.coach) res.coach = r.coach;
    if (r.clear) res.clear = true;
    lastErr = !!r.err;
    res.err = lastErr;
    if (r.editor) { res.editor = r.editor; break; }
  }
  env.history.push({ cmd: line.trim(), out: stripAnsi(res.chunks.map((c) => c.text).join('\n')), err: res.err });
  return res;
}

export function prompt(env) {
  const found = env.findRepo();
  let branch = '';
  if (found) {
    const r = found.repo;
    let b = r.head.branch !== undefined ? r.head.branch : (r.head.detached || '').slice(0, 7);
    const op = r.op && { merge: '|MERGING', rebase: `|REBASE ${(r.op.done || 0)}`, 'cherry-pick': '|CHERRY-PICKING', revert: '|REVERTING' }[r.op.type];
    if (r.op?.type === 'rebase') b = r.op.branch ?? b;
    branch = ` (${b}${op ? (r.op.type === 'rebase' ? '|REBASE' : op) : ''})`;
  }
  return { user: 'player@mushroom', path: tilde(env.cwd), branch };
}
