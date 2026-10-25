# 🍄 Git Quest

A tiny, local, Mario-flavoured game for learning the **terminal** and **git** by typing real commands
and watching the commit graph change live.

## Run it

```bash
./start.sh
```

Then open <http://localhost:8000> (the script tries to open it for you). Needs only the `python3`
that ships with macOS. No installs, no build step. Progress is saved in your browser (localStorage).

## What's inside

- **35 levels in 7 worlds**: terminal basics → commits → time travel → branches → conflicts →
  GitHub remotes → stash / reset / revert / cherry-pick / rebase / tags, plus a final boss.
- **Terminal** (left) that behaves like macOS zsh + git: quotes, `&&`, `>`/`>>`, globs, Tab completion,
  ↑ history, realistic git output and error messages.
- **Live graph** (right): coins = commits, `?` blocks = merge commits, coloured pipes/flags = branches,
  Mario = HEAD, dashed flags = `origin/...`, faded coins = abandoned commits (after reset/rebase/amend).
- **Three areas panel**: working directory → staging area → repository.
- **GitHub "castle" panel** showing the remote's state, including a simulated teammate (Luigi) and PR merges.
- **Editor modal** (`nano file`, and when git asks for a commit/merge message) with conflict-resolve buttons.
- **Coach tips** explaining every command in plain English, progressive **hints**, coins, ⭐ for no-hint
  clears, a daily 🔥 streak and a 3-question **daily recall** quiz, a printable **cheat sheet**, and a **sandbox**.

Everything is simulated in the browser. Nothing touches your real files or real git.

## Project layout

```
index.html, css/style.css
js/main.js          game controller: screens, level flow, scoring, quiz
js/terminal.js      terminal UI          js/editor.js   nano-style modal
js/shell.js         zsh-like shell       js/vfs.js      in-memory filesystem
js/git/             simulated git: repo model, commands, remotes, diff/merge
js/graph.js         SVG commit graph     js/areas.js    staging panel + folder map
js/levels/          curriculum (one file per world) + headless runner
tests/levels.mjs    replays every level's solution and checks all goals
```

## Tests

```bash
./test.sh
```

Runs every level's reference solution through the engine using macOS's built-in JavaScriptCore
(no Node needed) and checks all goals complete.

## Adding a level

Add an object to a world file in `js/levels/` with `setup` (shell commands or `{file, text}`),
`goals` (`{t, c: (s) => bool}`; `s` has helpers like `s.repo()`, `s.ran(/re/)`, `s.file(path)`),
`hints`, `solution`, `learn` (cheat-sheet rows) and `quiz`. Then run `./test.sh`.
