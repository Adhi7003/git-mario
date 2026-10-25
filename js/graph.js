// SVG commit-graph renderer. Time flows left → right like a Mario level.
// Commits = coins (merge commits = ? blocks), branches = colored pipe lanes with flags,
// HEAD = Mario, remote-tracking refs = dashed flags, tags = yellow signs, abandoned commits = faded ghosts.
import { short, firstLine } from './util.js';

const COLORS = ['#2fa84f', '#e52521', '#1e6fd9', '#f08c00', '#8e44ad', '#0d9488', '#d6336c'];
const GHOST = '#a3a3a3';
const DX = 76, PADX = 46, LABEL_H = 20, MARIO_H = 34;

const MARIO = [
  '....RRRRR...', '...RRRRRRRRR', '...HHHSSKS..', '..HSHSSSKSSS', '..HSHHSSSKSSS', '..HHSSSSKKKK', '....SSSSSSS.',
  '...RROORR...', '..RRRORROR..', '.RRRROOOORRR', '.SSROYOOYORSS', '.SSSOOOOOOSSS', '.SSOOOOOOOOSS', '...OOO..OOO..',
  '..HHH....HHH.', '.HHHH....HHHH',
];
const PAL = { R: '#e52521', H: '#6b3e1f', S: '#fcb98a', K: '#1f1f1f', O: '#1e40af', Y: '#fcd34d' };

export function marioSvg(scale = 2) {
  let rects = '';
  MARIO.forEach((row, y) => [...row].forEach((ch, x) => {
    if (PAL[ch]) rects += `<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="${PAL[ch]}"/>`;
  }));
  return rects;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const textW = (s, size = 11) => s.length * size * 0.62 + 12;

export class GraphView {
  constructor(host, { remote = false } = {}) {
    this.host = host;
    this.remote = remote;
    this.known = null; // ids seen in the previous render (for coin-pop animation)
    this.marioPos = null;
  }

  reset() { this.known = null; this.marioPos = null; }

  render(repo, { showGhosts = true } = {}) {
    const host = this.host;
    if (!repo) { host.innerHTML = ''; return; }
    const ids = Object.keys(repo.commits);
    if (!ids.length) {
      host.innerHTML = `<div class="graph-empty">${this.remote ? '🏰 This GitHub repository is empty.' : `<svg width="24" height="32" viewBox="0 0 26 32">${marioSvg(2)}</svg><div>No commits yet on <b>${esc(repo.head.branch ?? 'main')}</b>.<br>Stage some files and <code>git commit</code> to drop your first coin!</div>`}</div>`;
      this.known = new Set();
      return;
    }

    // Which commits are reachable from a ref; the rest are "ghosts" (abandoned by reset/rebase/amend).
    const reach = new Set();
    for (const t of repo.refTips()) repo.ancestors(t).forEach((x) => reach.add(x));
    const shown = ids.filter((id) => reach.has(id) || showGhosts).sort((a, b) => repo.commits[a].time - repo.commits[b].time);
    const col = Object.fromEntries(shown.map((id, i) => [id, i]));

    // Lane assignment: each ref claims its first-parent chain.
    const headBranch = repo.bare ? null : repo.head.branch;
    const tips = [];
    const add = (name, id, kind) => id && commitsHas(repo, id) && tips.push({ name, id, kind });
    for (const n of ['main', 'master']) add(n, repo.branches[n], 'branch');
    if (headBranch && !['main', 'master'].includes(headBranch)) add(headBranch, repo.branches[headBranch], 'branch');
    for (const [n, id] of Object.entries(repo.branches)) if (!['main', 'master', headBranch].includes(n)) add(n, id, 'branch');
    if (!repo.bare && repo.head.detached) add('HEAD', repo.head.detached, 'head');
    if (repo.op?.orig) add(repo.op.branch || 'orig', repo.op.orig, 'branch');
    for (const [n, id] of Object.entries(repo.remoteRefs)) add(n, id, 'remote');
    for (const [n, id] of Object.entries(repo.tags)) add(n, id, 'tag');
    for (const s of repo.stash) add('stash', s.base, 'stash');
    const ghosts = shown.filter((id) => !reach.has(id));
    const ghostChildren = new Set(ghosts.flatMap((g) => repo.commits[g].parents));
    for (const g of ghosts.filter((g) => !ghostChildren.has(g)).sort((a, b) => repo.commits[b].time - repo.commits[a].time)) add('ghost', g, 'ghost');

    const colorOf = {};
    let ci = 0;
    const branchColor = (name) => {
      const key = name.replace(/^[^/]+\//, (m) => (repo.remotes[m.slice(0, -1)] ? '' : m));
      if (!colorOf[key]) colorOf[key] = COLORS[key === 'main' || key === 'master' ? 0 : (++ci % COLORS.length) || 1];
      return colorOf[key];
    };
    branchColor('main');
    for (const t of tips) if (t.kind === 'branch' || t.kind === 'remote') branchColor(t.name);

    const lane = {}, laneColor = [];
    for (const t of tips) {
      let c = t.id;
      if (lane[c] !== undefined) continue;
      const L = laneColor.length;
      laneColor.push(t.kind === 'ghost' ? GHOST : t.kind === 'branch' || t.kind === 'remote' ? branchColor(t.name) : t.kind === 'head' ? '#f08c00' : COLORS[0]);
      while (c && lane[c] === undefined && col[c] !== undefined) { lane[c] = L; c = repo.commits[c].parents[0]; }
    }
    // Commits only reachable through a merge's second parent (their branch label was deleted).
    for (const id of [...shown].reverse()) {
      if (lane[id] !== undefined) continue;
      const L = laneColor.length;
      laneColor.push(reach.has(id) ? COLORS[(L % (COLORS.length - 1)) + 1] : GHOST);
      let c = id;
      while (c && lane[c] === undefined && col[c] !== undefined) { lane[c] = L; c = repo.commits[c].parents[0]; }
    }

    // Labels stacked above each commit.
    const labels = {};
    const push = (id, l) => { if (col[id] !== undefined) (labels[id] = labels[id] || []).push(l); };
    for (const [n, id] of Object.entries(repo.branches)) push(id, { text: n, kind: 'branch', color: branchColor(n), current: n === headBranch });
    for (const [n, id] of Object.entries(repo.remoteRefs)) push(id, { text: n, kind: 'remote', color: branchColor(n) });
    for (const [n, id] of Object.entries(repo.tags)) push(id, { text: '🏷 ' + n, kind: 'tag' });
    repo.stash.forEach((s, i) => push(s.base, { text: `📦 stash@{${i}}`, kind: 'stash' }));
    if (!repo.bare && repo.head.detached) push(repo.head.detached, { text: 'HEAD (detached)', kind: 'head' });
    for (const id in labels) labels[id].sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
    const marioAt = repo.bare ? null : repo.headId();
    const stackH = (id) => (labels[id]?.length || 0) * (LABEL_H + 3) + (id === marioAt ? MARIO_H : 0);

    // Lane y positions: each lane is as tall as its tallest label stack.
    const nLanes = laneColor.length;
    const above = Array(nLanes).fill(0);
    for (const id of shown) above[lane[id]] = Math.max(above[lane[id]], stackH(id));
    const laneY = [];
    let y = 8;
    for (let L = 0; L < nLanes; L++) { y += above[L] + 22; laneY.push(y); y += 40; }
    const width = PADX * 2 + Math.max(0, shown.length - 1) * DX;
    const height = y + 4;
    const P = (id) => [PADX + col[id] * DX, laneY[lane[id]]];

    let edges = '', nodes = '', tags = '';
    for (const id of shown) {
      const c = repo.commits[id];
      const [x2, y2] = P(id);
      c.parents.forEach((p, pi) => {
        if (col[p] === undefined) return;
        const [x1, y1] = P(p);
        const ghost = !reach.has(id);
        const color = ghost ? GHOST : laneColor[Math.max(lane[id], lane[p])] || COLORS[0];
        let d;
        if (y1 === y2) d = `M${x1} ${y1} H${x2}`;
        else if (pi === 0 && lane[id] > lane[p]) d = `M${x1} ${y1} C${x1 + DX * 0.55} ${y1} ${x1 + DX * 0.35} ${y2} ${x1 + DX} ${y2} H${x2}`;
        else d = `M${x1} ${y1} H${x2 - DX} C${x2 - DX * 0.35} ${y1} ${x2 - DX * 0.55} ${y2} ${x2} ${y2}`;
        edges += `<path d="${d}" class="pipe-outline${ghost ? ' ghost' : ''}"/><path d="${d}" class="pipe${ghost ? ' ghost' : ''}" stroke="${color}"/>`;
      });
    }
    const fresh = this.known ? shown.filter((id) => !this.known.has(id)) : [];
    for (const id of shown) {
      const c = repo.commits[id];
      const [x, cy] = P(id);
      const ghost = !reach.has(id);
      const cls = `node${ghost ? ' ghost' : ''}${fresh.includes(id) ? ' pop' : ''}`;
      const tip = esc(`${short(id)}  ${c.message}\n${c.author}`);
      const body = c.parents.length > 1
        ? `<rect x="-13" y="-13" width="26" height="26" rx="3" class="qblock"/><text y="5" class="qmark">?</text>`
        : `<circle r="12" class="coin"/><ellipse rx="3.5" ry="7" class="coin-inner"/>`;
      const msg = firstLine(c.message);
      nodes += `<g class="${cls}" transform="translate(${x} ${cy})"><title>${tip}</title>${body}
        <text y="28" class="hash">${short(id)}</text><text y="40" class="msg">${esc(msg.length > 13 ? msg.slice(0, 12) + '…' : msg)}</text></g>`;
      let ly = cy - 22;
      for (const l of labels[id] || []) {
        const w = textW(l.text);
        const lx = x - w / 2;
        const cls2 = `ref ref-${l.kind}${l.current ? ' current' : ''}`;
        const fill = l.kind === 'branch' ? l.color : l.kind === 'remote' ? '#fff' : '';
        const stroke = l.kind === 'remote' ? l.color : '';
        tags += `<g class="${cls2}"><line x1="${x}" y1="${ly + LABEL_H / 2}" x2="${x}" y2="${cy - 12}" class="pole"/>
          <rect x="${lx}" y="${ly - LABEL_H / 2}" width="${w}" height="${LABEL_H}" rx="4" ${fill ? `fill="${fill}"` : ''} ${stroke ? `stroke="${stroke}"` : ''}/>
          <text x="${x}" y="${ly + 4}" ${l.kind === 'remote' ? `style="fill:${l.color}"` : ''}>${l.current ? '★ ' : ''}${esc(l.text)}</text></g>`;
        ly -= LABEL_H + 3;
      }
      if (id === marioAt) this._mario = { x: x - 13, y: ly - MARIO_H + 14 };
    }

    const scroller = host.querySelector('.graph-scroll');
    const prevScroll = scroller ? scroller.scrollLeft : null;
    host.innerHTML = `<div class="graph-scroll"><svg class="graph" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <g>${edges}</g><g>${nodes}</g><g>${tags}</g>${marioAt ? `<g class="mario" style="transform:translate(${(this.marioPos || this._mario).x}px,${(this.marioPos || this._mario).y}px)">${marioSvg(2)}</g>` : ''}
    </svg></div>${ghosts.length ? '<div class="graph-legend">faded coins = commits no branch points to anymore (after reset / rebase / amend)</div>' : ''}`;

    // Animate Mario hopping from old to new position.
    if (marioAt) {
      const m = host.querySelector('.mario');
      const to = this._mario;
      if (this.marioPos && (this.marioPos.x !== to.x || this.marioPos.y !== to.y)) {
        requestAnimationFrame(() => requestAnimationFrame(() => { m.style.transform = `translate(${to.x}px,${to.y}px)`; }));
      }
      this.marioPos = to;
    }
    const sc = host.querySelector('.graph-scroll');
    const focusX = marioAt ? P(marioAt)[0] : width;
    if (prevScroll !== null && !fresh.length && !marioAt) sc.scrollLeft = prevScroll;
    else sc.scrollLeft = Math.max(0, focusX - sc.clientWidth + 120);
    this.known = new Set(shown);
    return { fresh };
  }
}

function commitsHas(repo, id) { return !!repo.commits[id]; }
