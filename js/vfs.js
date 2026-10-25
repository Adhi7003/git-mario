// Tiny in-memory filesystem. Nodes: {type:'dir', children:{}} or {type:'file', content:''}.
// A repository is a `.git` dir node carrying a `repo` property.

export const HOME = '/home/player';

export function normalize(path) {
  const parts = [];
  for (const p of path.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop();
    else parts.push(p);
  }
  return '/' + parts.join('/');
}
export const join = (...ps) => normalize(ps.join('/'));
export function dirname(p) {
  const n = normalize(p);
  return n.slice(0, n.lastIndexOf('/')) || '/';
}
export const basename = (p) => normalize(p).split('/').pop();
export const tilde = (abs) => (abs === HOME ? '~' : abs.startsWith(HOME + '/') ? '~' + abs.slice(HOME.length) : abs);

const newDir = () => ({ type: 'dir', children: {} });

export class VFS {
  constructor() {
    this.root = newDir();
    this.mkdirp(HOME);
  }

  resolve(cwd, path) {
    if (path === undefined || path === '' || path === '~') return HOME;
    if (path.startsWith('~/')) path = HOME + path.slice(1);
    return path.startsWith('/') ? normalize(path) : join(cwd, path);
  }

  get(abs) {
    let n = this.root;
    for (const part of abs.split('/').filter(Boolean)) {
      if (n.type !== 'dir' || !Object.hasOwn(n.children, part)) return null;
      n = n.children[part];
    }
    return n;
  }

  isDir(abs) { return this.get(abs)?.type === 'dir'; }
  isFile(abs) { return this.get(abs)?.type === 'file'; }

  mkdirp(abs) {
    let n = this.root;
    for (const part of abs.split('/').filter(Boolean)) {
      if (!Object.hasOwn(n.children, part)) n.children[part] = newDir();
      n = n.children[part];
      if (n.type !== 'dir') throw new Error('not a directory');
    }
    return n;
  }

  // Returns null on success or an error code: 'ENOENT' | 'EEXIST' | 'ENOTDIR'
  mkdir(abs) {
    const parent = this.get(dirname(abs));
    if (!parent) return 'ENOENT';
    if (parent.type !== 'dir') return 'ENOTDIR';
    if (Object.hasOwn(parent.children, basename(abs))) return 'EEXIST';
    parent.children[basename(abs)] = newDir();
    return null;
  }

  write(abs, content, append = false) {
    const parent = this.get(dirname(abs));
    if (!parent) return 'ENOENT';
    if (parent.type !== 'dir') return 'ENOTDIR';
    const name = basename(abs);
    const cur = parent.children[name];
    if (cur?.type === 'dir') return 'EISDIR';
    parent.children[name] = { type: 'file', content: append && cur ? cur.content + content : content };
    return null;
  }

  read(abs) {
    const n = this.get(abs);
    return n?.type === 'file' ? n.content : null;
  }

  remove(abs) {
    const parent = this.get(dirname(abs));
    if (!parent || !Object.hasOwn(parent.children, basename(abs))) return 'ENOENT';
    delete parent.children[basename(abs)];
    return null;
  }

  // Move node (rename). Destination parent must exist.
  move(src, dst) {
    const node = this.get(src);
    if (!node) return 'ENOENT';
    const parent = this.get(dirname(dst));
    if (!parent || parent.type !== 'dir') return 'ENOENT';
    this.remove(src);
    parent.children[basename(dst)] = node;
    return null;
  }

  list(abs) {
    const n = this.get(abs);
    return n?.type === 'dir' ? Object.keys(n.children).sort() : null;
  }

  // All files below `abs` as {relPath: content}, skipping .git directories.
  walkFiles(abs) {
    const out = {};
    const walk = (node, rel) => {
      for (const [name, child] of Object.entries(node.children)) {
        if (name === '.git') continue;
        const p = rel ? rel + '/' + name : name;
        if (child.type === 'dir') walk(child, p);
        else out[p] = child.content;
      }
    };
    const n = this.get(abs);
    if (n?.type === 'dir') walk(n, '');
    return out;
  }

  // Write a file at root/rel (content === undefined deletes it, pruning empty dirs like git does).
  setFile(root, rel, content) {
    const abs = join(root, rel);
    if (content === undefined || content === null) {
      this.remove(abs);
      let d = dirname(abs);
      while (d !== root && d.startsWith(root) && this.list(d)?.length === 0) {
        this.remove(d);
        d = dirname(d);
      }
    } else {
      this.mkdirp(dirname(abs));
      this.write(abs, content);
    }
  }
}
