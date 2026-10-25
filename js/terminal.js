// Terminal UI: output with ANSI colors, prompt, input history (↑/↓), Tab completion, Ctrl+L / Ctrl+C.
import { COMMANDS } from './shell.js';
import { SUBCOMMANDS } from './git/index.js';

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CODE = { 1: 'b', 2: 'dim', 31: 'red', 32: 'green', 33: 'yellow', 34: 'blue', 36: 'cyan' };

export function ansiToHtml(text) {
  let out = '', open = 0;
  for (const part of text.split(/(\x1b\[[\d;]*m)/)) {
    const m = part.match(/^\x1b\[([\d;]*)m$/);
    if (!m) { out += esc(part); continue; }
    const codes = m[1].split(';').filter(Boolean).map(Number);
    if (!codes.length || codes.includes(0)) { out += '</span>'.repeat(open); open = 0; continue; }
    out += `<span class="${codes.map((c) => 'a-' + (CODE[c] || c)).join(' ')}">`;
    open++;
  }
  return out + '</span>'.repeat(open);
}

export class Terminal {
  constructor(el, { getEnv, onCommand }) {
    this.el = el;
    this.getEnv = getEnv;
    this.onCommand = onCommand;
    this.history = [];
    this.hIdx = 0;
    this.busy = false;
    el.innerHTML = `<div class="term-out" aria-live="polite"></div>
      <div class="term-line"><span class="term-prompt"></span><input class="term-input" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Terminal input"></div>`;
    this.out = el.querySelector('.term-out');
    this.input = el.querySelector('.term-input');
    this.promptEl = el.querySelector('.term-prompt');
    el.addEventListener('mouseup', () => { if (!window.getSelection().toString()) this.focus(); });
    this.input.addEventListener('keydown', (e) => this.onKey(e));
  }

  focus() { this.input.focus({ preventScroll: true }); }

  setPrompt(p) { this.prompt = p; this.promptEl.innerHTML = promptHtml(p); }

  print(text, cls = '') {
    const div = document.createElement('div');
    div.className = 'term-block ' + cls;
    div.innerHTML = ansiToHtml(text);
    this.out.appendChild(div);
    this.scroll();
  }

  printHtml(html, cls = '') {
    const div = document.createElement('div');
    div.className = 'term-block ' + cls;
    div.innerHTML = html;
    this.out.appendChild(div);
    this.scroll();
  }

  echo(cmd) { this.printHtml(`${promptHtml(this.prompt)}<span class="term-cmd">${esc(cmd)}</span>`, 'echo'); }

  clear() { this.out.innerHTML = ''; }
  scroll() { this.el.scrollTop = this.el.scrollHeight; }

  onKey(e) {
    const inp = this.input;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.busy) return;
      const cmd = inp.value;
      inp.value = '';
      this.echo(cmd);
      if (cmd.trim()) { this.history.push(cmd); }
      this.hIdx = this.history.length;
      this.onCommand(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.hIdx > 0) { this.hIdx--; inp.value = this.history[this.hIdx]; requestAnimationFrame(() => inp.setSelectionRange(inp.value.length, inp.value.length)); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.hIdx < this.history.length) { this.hIdx++; inp.value = this.history[this.hIdx] ?? ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    } else if ((e.key === 'l' || e.key === 'L') && e.ctrlKey) {
      e.preventDefault();
      this.clear();
    } else if ((e.key === 'c' || e.key === 'C') && e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.printHtml(`${promptHtml(this.prompt)}<span class="term-cmd">${esc(inp.value)}</span>^C`, 'echo');
      inp.value = '';
    }
  }

  complete() {
    const env = this.getEnv();
    const inp = this.input;
    const before = inp.value.slice(0, inp.selectionStart);
    const after = inp.value.slice(inp.selectionStart);
    const words = before.split(/\s+/);
    const cur = words[words.length - 1];
    let cands;
    if (words.length === 1) cands = COMMANDS;
    else if (words[0] === 'git' && words.length === 2) cands = SUBCOMMANDS;
    else {
      const repo = env.findRepo()?.repo;
      const refs = repo && words[0] === 'git' && ['switch', 'checkout', 'merge', 'rebase', 'branch', 'log', 'diff', 'cherry-pick', 'reset', 'show', 'push', 'pull', 'revert', 'tag'].includes(words[1])
        ? [...Object.keys(repo.branches), ...Object.keys(repo.remoteRefs), ...Object.keys(repo.tags), ...Object.keys(repo.remotes)] : [];
      const slash = cur.lastIndexOf('/');
      const dirPart = slash >= 0 ? cur.slice(0, slash + 1) : '';
      const abs = env.fs.resolve(env.cwd, dirPart || '.');
      const files = (env.fs.list(abs) || []).filter((n) => cur.slice(slash + 1).startsWith('.') || !n.startsWith('.'))
        .map((n) => dirPart + n + (env.fs.isDir(abs + '/' + n) ? '/' : ''));
      cands = [...new Set([...refs, ...files])];
    }
    const hits = cands.filter((c) => c.startsWith(cur));
    if (!hits.length) return;
    let common = hits[0];
    for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
    if (common.length > cur.length || hits.length === 1) {
      const add = common.slice(cur.length) + (hits.length === 1 && !common.endsWith('/') ? ' ' : '');
      inp.value = before + add + after;
      const pos = before.length + add.length;
      inp.setSelectionRange(pos, pos);
    } else {
      this.echo(inp.value);
      this.print(hits.join('    '));
    }
  }
}

export function promptHtml(p) {
  if (!p) return '';
  return `<span class="p-user">${esc(p.user)}</span> <span class="p-path">${esc(p.path)}</span>${p.branch ? `<span class="p-branch">${esc(p.branch)}</span>` : ''} <span class="p-sym">%</span> `;
}
