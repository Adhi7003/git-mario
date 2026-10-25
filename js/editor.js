// nano-style editor modal. Used for `nano file` and when git asks for a commit message.
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CONFLICT = /^<<<<<<< .*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> .*(\n|$)/gm;

export function resolveConflicts(text, mode) {
  return text.replace(CONFLICT, (_, ours, theirs) => (mode === 'ours' ? ours : mode === 'theirs' ? theirs : ours + theirs));
}

export function openEditor(req) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-back editor-back';
    wrap.innerHTML = `
      <div class="editor" role="dialog" aria-label="Editor">
        <div class="editor-title"><span>GNU nano 8.2</span><span>${esc(req.title)}</span><span class="mod"></span></div>
        <div class="editor-help"></div>
        <textarea spellcheck="false"></textarea>
        <div class="editor-status"></div>
        <div class="editor-keys">
          <button data-act="save"><b>^O</b> Save &amp; exit</button>
          <button data-act="exit"><b>^X</b> Exit</button>
          <span class="conflict-tools" hidden>Resolve all: <button data-act="ours">Keep HEAD (yours)</button><button data-act="theirs">Keep incoming</button><button data-act="both">Keep both</button></span>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const ta = wrap.querySelector('textarea');
    const status = wrap.querySelector('.editor-status');
    const help = wrap.querySelector('.editor-help');
    const tools = wrap.querySelector('.conflict-tools');
    ta.value = req.content;
    const original = req.content;
    let asking = false;

    const refresh = () => {
      const conflict = /^<<<<<<< /m.test(ta.value);
      tools.hidden = !conflict;
      wrap.querySelector('.mod').textContent = ta.value !== original ? 'Modified' : '';
      help.innerHTML = conflict
        ? '⚔️ <b>Conflict!</b> Keep the lines you want and delete the <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code>, <code>=======</code>, <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> marker lines. Top part = your branch (HEAD), bottom = incoming. (VS Code shows the same buttons below.)'
        : req.file ? '✏️ Edit the file, then <b>Save &amp; exit</b> (Ctrl+O). Ctrl+X exits.' : '📝 Write the message on the first line(s). Lines starting with <code>#</code> are ignored. Then <b>Save &amp; exit</b>.';
    };
    const close = (result) => { wrap.remove(); resolve(result); };
    const save = () => close(req.onSave(ta.value));
    const cancel = () => close(req.onCancel ? req.onCancel() : { out: '' });
    const exit = () => {
      if (ta.value === original) return req.file ? cancel() : save();
      asking = true;
      status.innerHTML = 'Save modified buffer?  <b>Y</b> Yes   <b>N</b> No   <b>Esc</b> Cancel';
    };

    wrap.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'save') save();
      else if (act === 'exit') exit();
      else if (act) { ta.value = resolveConflicts(ta.value, act); refresh(); ta.focus(); }
    });
    ta.addEventListener('input', refresh);
    wrap.addEventListener('keydown', (e) => {
      if (asking) {
        e.preventDefault();
        if (/^y$/i.test(e.key)) save();
        else if (/^n$/i.test(e.key)) cancel();
        else if (e.key === 'Escape') { asking = false; status.textContent = ''; }
        return;
      }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'o' || k === 's')) { e.preventDefault(); save(); }
      else if (e.ctrlKey && k === 'x') { e.preventDefault(); exit(); }
      else if (e.key === 'Escape') { e.preventDefault(); exit(); }
    });
    refresh();
    ta.focus();
    ta.setSelectionRange(0, 0);
  });
}
