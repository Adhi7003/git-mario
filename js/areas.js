// "Three areas" panel (working dir → staging → repo) and the filesystem map used outside repos.
import { HOME, join, tilde } from './vfs.js';
import { computeStatus, trackingInfo } from './git/status.js';
import { short, firstLine, union } from './util.js';
import { marioSvg } from './graph.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderAreas(host, env, repo, root) {
  if (!repo) { host.innerHTML = ''; host.hidden = true; return; }
  host.hidden = false;
  const st = computeStatus(env, repo, root);
  const H = repo.headTree();
  const conflicts = new Set(st.conflicts);
  const un = Object.fromEntries(st.unstaged.map((s) => [s.path, s.type]));
  const stg = Object.fromEntries(st.staged.map((s) => [s.path, s.type]));
  const untracked = new Set(st.untracked);

  const workRows = union(st.work, un).filter((p) => p in repo.index || untracked.has(p) || conflicts.has(p)).map((p) => {
    let badge = '', cls = 'clean';
    if (conflicts.has(p)) { badge = '⚔'; cls = 'conflict'; }
    else if (untracked.has(p)) { badge = 'new'; cls = 'untracked'; }
    else if (un[p] === 'deleted') { badge = 'D'; cls = 'deleted'; }
    else if (un[p] === 'modified') { badge = 'M'; cls = 'modified'; }
    return `<li class="${cls}"><span class="badge">${badge}</span>${esc(p)}</li>`;
  });
  const stageRows = Object.entries(stg).map(([p, t]) => `<li class="staged"><span class="badge">${t === 'new file' ? 'A' : t === 'deleted' ? 'D' : 'M'}</span>${esc(p)}</li>`);
  const headId = repo.headId();
  const t = trackingInfo(repo);
  const remoteLine = t && !t.gone ? `<div class="sync">${t.ahead ? `⬆ ${t.ahead} to push` : ''}${t.ahead && t.behind ? ' · ' : ''}${t.behind ? `⬇ ${t.behind} to pull` : ''}${!t.ahead && !t.behind ? `✓ in sync with ${esc(t.up)}` : ''}</div>` : '';

  host.innerHTML = `
    <div class="area">
      <h4>📁 Working directory</h4>
      <ul>${workRows.join('') || '<li class="empty">no files</li>'}</ul>
    </div>
    <div class="arrow"><span>git add</span>→</div>
    <div class="area">
      <h4>🎒 Staging area</h4>
      <ul>${stageRows.join('') || '<li class="empty">empty</li>'}</ul>
    </div>
    <div class="arrow"><span>git commit</span>→</div>
    <div class="area">
      <h4>🪙 Repository</h4>
      ${headId ? `<div class="head-commit"><code>${short(headId)}</code> ${esc(firstLine(repo.commits[headId].message))}</div><div class="muted">${Object.keys(H).length} files in last commit</div>` : '<div class="muted">no commits yet</div>'}
      ${remoteLine}
      ${repo.stash.length ? `<div class="stash-box">📦 stash: ${repo.stash.length}</div>` : ''}
    </div>`;
}

// Folder map with Mario marking the current directory.
export function renderFsTree(host, env) {
  const lines = [];
  const walk = (abs, depth) => {
    const names = env.fs.list(abs).filter((n) => !n.startsWith('.') || n === '.git' || n === '.gitignore' || n === '.env' || n === '.secret');
    for (const n of names) {
      const p = join(abs, n);
      const node = env.fs.get(p);
      const here = p === env.cwd;
      if (n === '.git') { lines.push(`<li style="--d:${depth}" class="gitdir">🪙 .git <span class="muted">(repository)</span></li>`); continue; }
      if (node.type === 'dir') {
        lines.push(`<li style="--d:${depth}" class="dir${here ? ' here' : ''}">📁 ${esc(n)}${here ? youAreHere() : ''}</li>`);
        if (depth < 4) walk(p, depth + 1);
      } else lines.push(`<li style="--d:${depth}" class="file">📄 ${esc(n)}</li>`);
    }
  };
  walk(HOME, 1);
  host.innerHTML = `<div class="fs-map"><div class="fs-title">🗺 Map of your files</div><ul>
    <li style="--d:0" class="dir${env.cwd === HOME ? ' here' : ''}">🏠 ~ <span class="muted">(${HOME})</span>${env.cwd === HOME ? youAreHere() : ''}</li>${lines.join('')}</ul>
    ${!env.cwd.startsWith(HOME) ? `<div class="muted">You are outside home: ${esc(tilde(env.cwd))}</div>` : ''}</div>`;
}

const youAreHere = () => `<span class="here-tag"><svg width="13" height="16" viewBox="0 0 26 32">${marioSvg(2)}</svg> you are here</span>`;
