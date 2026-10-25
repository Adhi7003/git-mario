// Line diff (LCS), unified hunks and a diff3-style three-way merge.
import { C } from '../util.js';

export function splitLines(text) {
  if (text === undefined || text === null || text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// ops: {t:' '|'-'|'+', line}
export function diffLines(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: ' ', line: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: '-', line: a[i++] });
    else ops.push({ t: '+', line: b[j++] });
  }
  while (i < n) ops.push({ t: '-', line: a[i++] });
  while (j < m) ops.push({ t: '+', line: b[j++] });
  return ops;
}

export function diffStat(aText, bText) {
  const ops = diffLines(splitLines(aText), splitLines(bText));
  return { add: ops.filter((o) => o.t === '+').length, del: ops.filter((o) => o.t === '-').length };
}

// Unified diff hunks (colored) for one file.
export function hunkLines(aText, bText, ctx = 3) {
  const ops = diffLines(splitLines(aText), splitLines(bText));
  const ranges = [];
  ops.forEach((op, k) => {
    if (op.t === ' ') return;
    const s = Math.max(0, k - ctx), e = Math.min(ops.length, k + ctx + 1);
    const last = ranges[ranges.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else ranges.push([s, e]);
  });
  const out = [];
  for (const [s, e] of ranges) {
    const before = ops.slice(0, s), inside = ops.slice(s, e);
    let os = before.filter((o) => o.t !== '+').length + 1, ns = before.filter((o) => o.t !== '-').length + 1;
    const oc = inside.filter((o) => o.t !== '+').length, nc = inside.filter((o) => o.t !== '-').length;
    if (oc === 0) os--;
    if (nc === 0) ns--;
    out.push(C.cyan(`@@ -${os}${oc === 1 ? '' : ',' + oc} +${ns}${nc === 1 ? '' : ',' + nc} @@`));
    for (const o of inside) {
      if (o.t === '+') out.push(C.green('+' + o.line));
      else if (o.t === '-') out.push(C.red('-' + o.line));
      else out.push(' ' + o.line);
    }
  }
  return out;
}

// Chunks where base[bs..be) is replaced by `lines` in the other version.
function chunksOf(base, other) {
  const chunks = [];
  let bi = 0, cur = null;
  for (const op of diffLines(base, other)) {
    if (op.t === ' ') {
      if (cur) { chunks.push(cur); cur = null; }
      bi++;
    } else {
      if (!cur) cur = { bs: bi, be: bi, lines: [] };
      if (op.t === '-') cur.be = ++bi;
      else cur.lines.push(op.line);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Three-way merge of text. Returns {text, conflict}.
export function merge3(baseText, oursText, theirsText, labels = { ours: 'HEAD', theirs: 'theirs' }) {
  const base = splitLines(baseText);
  const all = [
    ...chunksOf(base, splitLines(oursText)).map((c) => ({ ...c, side: 'o' })),
    ...chunksOf(base, splitLines(theirsText)).map((c) => ({ ...c, side: 't' })),
  ].sort((x, y) => x.bs - y.bs || x.be - y.be);

  const out = [];
  let pos = 0, conflict = false, k = 0;
  while (k < all.length) {
    const gs = all[k].bs;
    let ge = all[k].be;
    const group = [all[k++]];
    while (k < all.length && all[k].bs <= ge) {
      ge = Math.max(ge, all[k].be);
      group.push(all[k++]);
    }
    out.push(...base.slice(pos, gs));
    pos = ge;
    const version = (cs) => {
      const r = [];
      let p = gs;
      for (const c of cs) { r.push(...base.slice(p, c.bs), ...c.lines); p = c.be; }
      r.push(...base.slice(p, ge));
      return r;
    };
    const os = group.filter((c) => c.side === 'o'), ts = group.filter((c) => c.side === 't');
    if (!ts.length) out.push(...version(os));
    else if (!os.length) out.push(...version(ts));
    else {
      const a = version(os), b = version(ts);
      if (a.join('\n') === b.join('\n')) out.push(...a);
      else {
        conflict = true;
        out.push(`<<<<<<< ${labels.ours}`, ...a, '=======', ...b, `>>>>>>> ${labels.theirs}`);
      }
    }
  }
  out.push(...base.slice(pos));
  return { text: out.length ? out.join('\n') + '\n' : '', conflict };
}
