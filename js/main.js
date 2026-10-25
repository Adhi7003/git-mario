// Game controller: screens (map / play / cheat sheet), level flow, scoring, daily recall.
import { WORLDS, LEVELS, levelById } from './levels/index.js';
import { buildLevel, checkGoals, makeState } from './levels/runner.js';
import { remoteAndClone, URL } from './levels/common.js';
import { runLine, prompt } from './shell.js';
import { Terminal } from './terminal.js';
import { GraphView, marioSvg } from './graph.js';
import { renderAreas, renderFsTree } from './areas.js';
import { openEditor } from './editor.js';
import { play, sound } from './sound.js';
import { loadProgress, saveProgress, resetProgress, markDay, streak, totalCoins, totalStars, today } from './progress.js';
import { stripAnsi } from './util.js';
import { tilde } from './vfs.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let P = loadProgress();
sound.on = P.settings.sound;

const SANDBOX = {
  id: 'sandbox', title: 'Sandbox', world: null, remote: URL, goals: [], hints: [], start: 'kart-stats',
  story: 'Free play! ~/kart-stats is a clone of a GitHub repo (origin). Break things, experiment, nothing is graded.',
  setup: [...remoteAndClone(), '@emptyremote https://github.com/player/playground.git'],
};

const G = { level: null, env: null, done: new Set(), hintIdx: 0, usedHint: false, finished: false, lastHead: null, lastConflict: false };

const term = new Terminal($('#terminal'), { getEnv: () => G.env, onCommand });
const graph = new GraphView($('#graph'));
const castle = new GraphView($('#castle-graph'), { remote: true });

// ---------------- screens ----------------

function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== `screen-${screen}`;
  document.body.dataset.screen = screen;
  if (screen === 'play') term.focus();
  updateTopbar();
}

function updateTopbar() {
  $('#tb-coins').textContent = totalCoins(P);
  $('#tb-stars').textContent = totalStars(P);
  $('#tb-streak').textContent = streak(P);
}

const isDone = (id) => !!P.done[id];
function unlocked(idx) { return P.settings.unlockAll || idx === 0 || isDone(LEVELS[idx].id) || isDone(LEVELS[idx - 1].id); }
const nextLevel = () => LEVELS.find((l, i) => !isDone(l.id) && unlocked(i)) || null;

function renderMap() {
  const nl = nextLevel();
  const doneCount = Object.keys(P.done).length;
  const quizDone = P.quizDay === today();
  $('#today').innerHTML = `
    <div class="today-card">
      <div class="today-head"><span class="flame">🔥</span><div><div class="big">${streak(P)}-day streak</div><div class="muted">Play a level or the daily recall each day to keep it going.</div></div></div>
      ${nl ? `<button class="btn btn-go" data-level="${nl.id}">▶ ${isDoneAny() ? 'Continue' : 'Start'}: ${nl.id} ${esc(nl.title)}</button>` : '<div class="victory">🏆 You beat every level! Replay any level for stars, or practise in the Sandbox.</div>'}
      <button class="btn btn-quiz" ${doneCount ? '' : 'disabled'} id="quiz-btn">${quizDone ? '✅ Daily recall done today (play again?)' : '🧠 Daily recall: 3 quick questions'}</button>
      <div class="progress-row"><div class="bar"><span style="width:${(doneCount / LEVELS.length) * 100}%"></span></div><span class="muted">${doneCount}/${LEVELS.length} levels</span></div>
    </div>`;
  $('#worlds').innerHTML = WORLDS.map((w) => {
    const nodes = w.levels.map((l) => {
      const idx = LEVELS.findIndex((x) => x.id === l.id);
      const open = unlocked(idx), d = P.done[l.id];
      const cls = d ? (d.stars ? 'star' : 'done') : open ? (nl?.id === l.id ? 'current' : 'open') : 'locked';
      return `<button class="lvl ${cls}${l.boss ? ' boss' : ''}" data-level="${l.id}" ${open ? '' : 'disabled'} title="${esc(l.id + ' ' + l.title)}">
        <span class="lvl-dot">${d ? (d.stars ? '⭐' : '🪙') : open ? l.id.split('-')[1] : '🔒'}</span><span class="lvl-name">${esc(l.title)}</span></button>`;
    }).join('<span class="path"></span>');
    const wd = w.levels.filter((l) => P.done[l.id]).length;
    return `<section class="world"><div class="world-head"><span class="world-icon">${w.icon}</span><div><h3>World ${w.id}: ${esc(w.name)}</h3><p class="muted">${esc(w.blurb)}</p></div><span class="world-count">${wd}/${w.levels.length}</span></div><div class="lvl-row">${nodes}</div></section>`;
  }).join('');
  show('map');
}
const isDoneAny = () => Object.keys(P.done).length > 0;

function renderCheats() {
  $('#cheats').innerHTML = WORLDS.map((w) => `<section class="cheat-world"><h3>${w.icon} World ${w.id}: ${esc(w.name)}</h3><table>${w.levels.map((l) => {
    const open = isDone(l.id) || P.settings.unlockAll;
    return (l.learn || []).map(([cmd, desc]) => `<tr class="${open ? '' : 'locked'}"><td><code>${open ? esc(cmd) : '???'}</code></td><td>${open ? esc(desc) : `Unlocks after level ${l.id}`}</td></tr>`).join('');
  }).join('')}</table></section>`).join('');
  show('cheats');
}

// ---------------- levels ----------------

function startLevel(level) {
  G.level = level;
  G.env = buildLevel(level, P.identity);
  G.env.hooks.hint = () => { giveHint(); return { out: '' }; };
  G.env.hooks.onConfig = (k, v, global) => {
    if (global && (k === 'user.name' || k === 'user.email')) { P.identity[k.slice(5)] = v; saveProgress(P); }
  };
  G.done = new Set();
  G.hintIdx = 0;
  G.usedHint = false;
  G.finished = false;
  G.lastHead = null;
  G.lastConflict = false;
  graph.reset();
  castle.reset();
  term.clear();
  term.history = [];
  term.hIdx = 0;
  const label = level.world === null ? '🧪 Sandbox' : `World ${level.id}: ${level.title}`;
  term.print(`\x1b[2m── ${label} ──  type \x1b[0m\x1b[33mhint\x1b[0m\x1b[2m if stuck, \x1b[0m\x1b[33mhelp\x1b[0m\x1b[2m for commands, Tab to auto-complete\x1b[0m`);
  checkGoals(level, G.env, G.done);
  renderMission();
  refresh(true);
  show('play');
  if (level.world !== null) showBriefing(level);
}

function renderMission() {
  const L = G.level;
  const sandbox = L.world === null;
  $('#mission-title').innerHTML = sandbox ? '🧪 Sandbox: free play' : `<span class="tag">${L.boss ? 'BOSS ' : ''}${L.id}</span> ${esc(L.title)}`;
  $('#mission-story').textContent = L.story;
  $('#goals').innerHTML = L.goals.map((g, i) => `<li class="${G.done.has(i) ? 'done' : ''}"><span class="check">${G.done.has(i) ? '✔' : ''}</span>${esc(g.t)}</li>`).join('');
  $('#btn-hint').hidden = sandbox;
  $('#btn-brief').hidden = sandbox;
  $('#btn-hint').textContent = `💡 Hint${L.hints?.length ? ` (${Math.max(0, L.hints.length - G.hintIdx)} left)` : ''}`;
  const s = makeState(G.env, L);
  $('#actions').innerHTML = (L.actions || []).map((a) => `<button class="btn btn-action" data-action="${a.id}" ${a.enabled(s) ? '' : 'disabled'}>${esc(a.label)}</button>`).join('');
}

function giveHint() {
  const L = G.level;
  if (!L.hints?.length) return term.printHtml('🍄 No hints in the sandbox. Experiment freely!', 'coach');
  const h = L.hints[Math.min(G.hintIdx, L.hints.length - 1)];
  G.hintIdx = Math.min(G.hintIdx + 1, L.hints.length);
  G.usedHint = true;
  term.printHtml(`💡 <b>Hint ${Math.min(G.hintIdx, L.hints.length)}/${L.hints.length}:</b> ${esc(h)}`, 'coach hint');
  renderMission();
}

function showBriefing(level) {
  const learn = (level.learn || []).map(([c]) => `<code>${esc(c)}</code>`).join(' ');
  modal(`
    <div class="brief-head"><span class="tag">${level.boss ? 'BOSS ' : ''}World ${level.id}</span><h2>${esc(level.title)}</h2></div>
    <p class="story">${esc(level.story)}</p>
    <div class="lesson">${level.lesson}</div>
    ${learn ? `<div class="learn">You'll use: ${learn}</div>` : ''}
    <div class="modal-actions"><button class="btn btn-go" data-close>Let's-a go! ▶</button></div>`, () => term.focus());
}

function finishLevel() {
  const L = G.level;
  G.finished = true;
  const coins = L.goals.length + (L.boss ? 5 : 2);
  const stars = G.usedHint ? 0 : 1;
  const prev = P.done[L.id] || { stars: 0, coins: 0 };
  P.done[L.id] = { stars: Math.max(prev.stars, stars), coins: Math.max(prev.coins, coins) };
  markDay(P);
  saveProgress(P);
  updateTopbar();
  play('clear');
  const idx = LEVELS.findIndex((l) => l.id === L.id);
  const nxt = LEVELS[idx + 1];
  const learn = (L.learn || []).map(([c, d]) => `<li><code>${esc(c)}</code> ${esc(d)}</li>`).join('');
  setTimeout(() => modal(`
    <div class="clear-banner"><svg width="26" height="32" viewBox="0 0 26 32">${marioSvg(2)}</svg><h2>COURSE CLEAR!</h2><span class="flag">🚩</span></div>
    <div class="reward"><span>🪙 +${coins}</span><span class="${stars ? '' : 'dim'}">${stars ? '⭐ No-hint star!' : '☆ Replay without hints for a star'}</span></div>
    ${learn ? `<h4>What you learned</h4><ul class="learned">${learn}</ul>` : ''}
    <div class="modal-actions">
      <button class="btn" data-go="map">🗺 World map</button>
      <button class="btn" data-go="stay">Keep playing here</button>
      ${nxt ? `<button class="btn btn-go" data-go="next">Next: ${esc(nxt.id + ' ' + nxt.title)} ▶</button>` : '<button class="btn btn-go" data-go="map">🏆 Finish</button>'}
    </div>`, null, (go) => {
    if (go === 'next' && nxt) startLevel(nxt);
    else if (go === 'map') renderMap();
    else term.focus();
  }), 500);
}

// ---------------- terminal → engine ----------------

async function onCommand(cmd) {
  if (cmd.trim() === 'hint') { giveHint(); G.env.history.push({ cmd: 'hint', out: '', err: false }); return; }
  const res = runLine(G.env, cmd);
  if (res.clear) term.clear();
  for (const c of res.chunks) term.print(c.text, c.err ? 'err' : '');
  coach(res.coach);
  if (res.err) play('error');
  if (res.editor) {
    refresh();
    term.busy = true;
    const r = await openEditor(res.editor);
    term.busy = false;
    if (r?.out) term.print(r.out, r.err ? 'err' : '');
    coach(r?.coach);
    G.env.history.push({ cmd: '(editor saved)', out: stripAnsi(r?.out || ''), err: !!r?.err });
    term.focus();
  }
  refresh();
}

function coach(text) {
  if (text && P.settings.coach) term.printHtml(`<span class="coach-ico">🍄</span> ${esc(text)}`, 'coach');
}

function refresh(initial = false) {
  const env = G.env;
  term.setPrompt(prompt(env));
  const found = env.findRepo();
  const repo = found?.repo;
  const title = $('#viz-title');
  if (repo) {
    const r = graph.render(repo);
    title.innerHTML = `🗺 <b>${esc(tilde(found.root))}</b> <span class="muted">commit graph · time flows →</span>${repo.op ? ` <span class="op-badge">${{ merge: '⚔ MERGING', rebase: '🌈 REBASING', 'cherry-pick': '🍒 CHERRY-PICKING', revert: '↩ REVERTING' }[repo.op.type]}${repo.op.conflicts?.length ? ': fix conflicts' : ''}</span>` : ''}`;
    const head = repo.headId();
    if (!initial && r?.fresh?.length) play('coin');
    else if (!initial && head !== G.lastHead && G.lastHead !== null) play('pipe');
    G.lastHead = head;
    const conflict = !!repo.op?.conflicts?.length;
    if (conflict && !G.lastConflict && !initial) play('bowser');
    G.lastConflict = conflict;
  } else {
    graph.reset();
    title.innerHTML = `🗺 <b>Folder map</b> <span class="muted">${env.findRepo() ? '' : 'not inside a git repository'}</span>`;
    renderFsTree($('#graph'), env);
    G.lastHead = null;
  }
  renderAreas($('#areas'), env, repo, found?.root);

  // GitHub "castle" panel: the remote this repo talks to, or the level's remote.
  const url = (repo && Object.values(repo.remotes)[0]) || G.level.remote;
  const R = url && env.remotes[url];
  $('#castle').hidden = !R;
  if (R) {
    $('#castle-title').innerHTML = `🏰 <b>GitHub</b> <span class="muted">${esc(url.replace('https://', ''))}</span>`;
    castle.render(R, { showGhosts: false });
  }

  // Goals
  if (G.level.goals.length && !G.finished) {
    const fresh = checkGoals(G.level, env, G.done);
    for (const i of fresh) if (!initial) term.printHtml(`<span class="goal-ok">✔ Goal complete:</span> ${esc(G.level.goals[i].t)}`, 'goal');
    if (fresh.length && !initial) play('goal');
    if (G.done.size === G.level.goals.length) finishLevel();
  }
  renderMission();
}

// ---------------- modal + quiz ----------------

function modal(html, onClose, onGo) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  document.body.appendChild(back);
  const close = (go) => { back.remove(); if (go !== undefined) onGo?.(go); onClose?.(); };
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) close();
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (go) close(go);
  });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  back.querySelector('.btn-go, button, input')?.focus();
  return back;
}

const norm = (s) => s.trim().replace(/\s+/g, ' ').replace(/'/g, '"').replace(/^\$\s*/, '').toLowerCase();

function startQuiz() {
  const pool = LEVELS.filter((l) => P.done[l.id]).flatMap((l) => (l.quiz || []).map((q) => ({ ...q, level: l.id })));
  if (!pool.length) return;
  const qs = [];
  while (qs.length < Math.min(3, pool.length)) {
    const q = pool[Math.floor(Math.random() * pool.length)];
    if (!qs.includes(q)) qs.push(q);
  }
  let i = 0, right = 0;
  const back = modal('<div id="quiz"></div>');
  const step = () => {
    const box = back.querySelector('#quiz');
    if (i >= qs.length) {
      const earned = right;
      if (P.quizDay !== today()) P.bonus = (P.bonus || 0) + earned;
      P.quizDay = today();
      markDay(P);
      saveProgress(P);
      updateTopbar();
      play(right === qs.length ? 'clear' : 'coin');
      box.innerHTML = `<h2>🧠 Recall done: ${right}/${qs.length}</h2><p>${right === qs.length ? 'Perfect memory! ' : 'Repetition is how commands stick. '}🔥 Streak: ${streak(P)} day(s)${earned ? ` · 🪙 +${earned}` : ''}</p><div class="modal-actions"><button class="btn btn-go" data-close>Back to map</button></div>`;
      back.querySelector('button').focus();
      renderMap();
      return;
    }
    const q = qs[i];
    box.innerHTML = `<div class="tag">Question ${i + 1}/${qs.length} · from level ${q.level}</div><h3>${esc(q.q)}</h3>
      <div class="quiz-term"><span class="p-sym">%</span><input id="quiz-in" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="type the command"></div>
      <div id="quiz-fb"></div><div class="modal-actions"><button class="btn btn-go" id="quiz-check">Check ↵</button></div>`;
    const inp = box.querySelector('#quiz-in');
    inp.focus();
    let answered = false;
    const check = () => {
      if (answered) { i++; return step(); }
      answered = true;
      const ok = q.a.some((a) => norm(a) === norm(inp.value));
      if (ok) right++;
      play(ok ? 'coin' : 'error');
      box.querySelector('#quiz-fb').innerHTML = ok ? '<div class="fb ok">✅ Correct!</div>' : `<div class="fb bad">❌ Answer: <code>${esc(q.a[0])}</code></div>`;
      box.querySelector('#quiz-check').textContent = 'Next ▶';
      box.querySelector('#quiz-check').focus();
    };
    box.querySelector('#quiz-check').onclick = check;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
  };
  step();
}

function showSettings() {
  const s = P.settings;
  modal(`<h2>⚙️ Settings</h2>
    <label class="opt"><input type="checkbox" id="opt-coach" ${s.coach ? 'checked' : ''}> 🍄 Coach tips after commands (plain-English explanations)</label>
    <label class="opt"><input type="checkbox" id="opt-sound" ${s.sound ? 'checked' : ''}> 🔊 8-bit sounds</label>
    <label class="opt"><input type="checkbox" id="opt-unlock" ${s.unlockAll ? 'checked' : ''}> 🔓 Unlock all levels (skip ahead)</label>
    <p class="muted">Commits are signed as: <b>${esc(P.identity.name || 'Player')}</b> &lt;${esc(P.identity.email || 'player@mushroom.kingdom')}&gt; (set in level 1-3 with git config --global).</p>
    <div class="modal-actions"><button class="btn btn-danger" id="opt-reset">Reset all progress</button><button class="btn btn-go" data-close>Done</button></div>`, () => {
    if (document.body.dataset.screen === 'map') renderMap();
    if (document.body.dataset.screen === 'cheats') renderCheats();
  });
  $('#opt-coach').onchange = (e) => { P.settings.coach = e.target.checked; saveProgress(P); };
  $('#opt-sound').onchange = (e) => { P.settings.sound = sound.on = e.target.checked; saveProgress(P); };
  $('#opt-unlock').onchange = (e) => { P.settings.unlockAll = e.target.checked; saveProgress(P); };
  $('#opt-reset').onclick = () => {
    if (confirm('Erase all progress, coins and streak?')) { P = resetProgress(); sound.on = true; document.querySelector('.modal-back')?.remove(); renderMap(); }
  };
}

// ---------------- wiring ----------------

document.addEventListener('click', (e) => {
  const lv = e.target.closest('[data-level]');
  if (lv && !lv.disabled) return startLevel(levelById(lv.dataset.level));
  if (e.target.closest('#quiz-btn')) return startQuiz();
  const nav = e.target.closest('[data-nav]')?.dataset.nav;
  if (nav === 'map') renderMap();
  if (nav === 'cheats') renderCheats();
  if (nav === 'sandbox') startLevel(SANDBOX);
  if (nav === 'settings') showSettings();
  const act = e.target.closest('[data-action]')?.dataset.action;
  if (act) {
    const a = G.level.actions.find((x) => x.id === act);
    const msg = a.run(G.env);
    G.env.history.push({ cmd: `@action ${act}`, out: msg, err: false });
    term.printHtml(esc(msg), 'coach');
    play('clear');
    refresh();
    term.focus();
  }
});
$('#btn-hint').onclick = () => { giveHint(); term.focus(); };
$('#btn-brief').onclick = () => showBriefing(G.level);
$('#btn-restart').onclick = () => { if (confirm('Restart this level from scratch?')) startLevel(G.level); };
$('#btn-print').onclick = () => window.print();

renderMap();
if (!P.seenWelcome) {
  P.seenWelcome = true;
  saveProgress(P);
  modal(`<div class="clear-banner"><svg width="26" height="32" viewBox="0 0 26 32">${marioSvg(2)}</svg><h2>Welcome to Git Quest!</h2></div>
    <p>Learn the terminal and git by <b>typing real commands</b> and <b>watching them happen</b>:</p>
    <ul class="learned"><li>⌨️ Left: a terminal that behaves like your Mac's (zsh + git)</li><li>🗺 Right: your commit graph live. Coins are commits, flags are branches, Mario is HEAD</li><li>🎒 Below it: working directory → staging → repository</li><li>🏰 GitHub appears as a castle when remotes are involved</li></ul>
    <p>Do one or two levels a day. Every level gives coins; finishing without hints earns a ⭐. Keep your 🔥 streak alive with the daily recall.</p>
    <div class="modal-actions"><button class="btn btn-go" data-close>Start my quest ▶</button></div>`);
}
