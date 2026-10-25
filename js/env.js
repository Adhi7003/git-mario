// One "world": filesystem, current directory, simulated GitHub remotes, global git config.
import { VFS, HOME, dirname, join } from './vfs.js';

export class Env {
  constructor() {
    this.fs = new VFS();
    this.cwd = HOME;
    this.prevCwd = HOME;
    this.remotes = {}; // url -> bare Repo (our pretend GitHub)
    this.clock = 0;
    this.config = { 'user.name': 'Player', 'user.email': 'player@mushroom.kingdom', 'init.defaultbranch': 'main' };
    this.history = []; // {cmd, out, err}
    this.hooks = {};   // game callbacks (hint, etc.)
  }

  tick() { return ++this.clock; }

  getConfig(key, repo) {
    key = key.toLowerCase();
    return repo?.config[key] ?? this.config[key];
  }

  author(repo) {
    return `${this.getConfig('user.name', repo) || 'Player'} <${this.getConfig('user.email', repo) || 'player@mushroom.kingdom'}>`;
  }

  // Walk up from `path` to find a repository.
  findRepo(path = this.cwd) {
    let d = path;
    for (;;) {
      const g = this.fs.get(join(d, '.git'));
      if (g?.repo) return { repo: g.repo, root: d };
      if (d === '/') return null;
      d = dirname(d);
    }
  }

  repoAt(abs) { return this.fs.get(join(abs, '.git'))?.repo || null; }
}
