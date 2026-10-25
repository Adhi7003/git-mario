// Replays every level's solution and checks all goals complete. Run: ./test.sh
import { LEVELS } from '../js/levels/index.js';
import { buildLevel, checkGoals } from '../js/levels/runner.js';
import { runLine } from '../js/shell.js';
import { stripAnsi } from '../js/util.js';

const log = typeof print === 'function' ? print : console.log;
let failed = 0;
for (const level of LEVELS) {
  let env;
  const done = new Set();
  const trace = [];
  try {
    env = buildLevel(level);
    const pre = checkGoals(level, env, done);
    if (pre.length) trace.push(`!! goals done before any command: ${pre.map((i) => level.goals[i].t).join(' | ')}`);
    for (const cmd of level.solution) {
      if (cmd.startsWith('@action ')) {
        const a = level.actions.find((x) => x.id === cmd.split(' ')[1]);
        trace.push(`[action] ${a.run(env)}`);
      } else {
        const r = runLine(env, cmd);
        trace.push(`% ${cmd}`, ...r.chunks.map((c) => stripAnsi(c.text)));
        if (r.editor) { const r2 = r.editor.onSave(r.editor.content); if (r2.out) trace.push(stripAnsi(r2.out)); }
      }
      checkGoals(level, env, done);
    }
  } catch (e) {
    trace.push('EXCEPTION ' + e.message + '\n' + e.stack);
  }
  const missing = level.goals.map((g, i) => (done.has(i) ? null : g.t)).filter(Boolean);
  const bad = missing.length || trace.some((t) => t.startsWith('EXCEPTION') || t.startsWith('!!'));
  const traceIds = globalThis.scriptArgs || globalThis.arguments || (typeof process !== 'undefined' ? process.argv : []);
  if (bad || traceIds.includes(level.id)) {
    if (bad) failed++;
    log(`✗ ${level.id} ${level.title}`);
    for (const m of missing) log(`    missing goal: ${m}`);
    log(trace.map((t) => '      ' + t.replace(/\n/g, '\n      ')).join('\n'));
  } else log(`✓ ${level.id} ${level.title}`);
}
log(failed ? `\n${failed} level(s) failed` : `\nAll ${LEVELS.length} levels pass`);
