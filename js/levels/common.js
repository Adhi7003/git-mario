// Shared fixtures for level setups.
export const URL = 'https://github.com/player/kart-stats.git';

export const F = {
  readme: '# Kart Stats\nLap-time analysis for the Mushroom Cup.',
  laps: 'laps = [32.1, 31.8, 33.0]\nprint("Laps:", laps)',
  lapsAvg: 'laps = [32.1, 31.8, 33.0]\nprint("Laps:", laps)\naverage = sum(laps) / len(laps)\nprint("Average lap:", average)',
  lapsBest: 'laps = [32.1, 31.8, 33.0]\nprint("Laps:", laps)\naverage = sum(laps) / len(laps)\nprint("Average lap:", average)\nprint("Best lap:", min(laps))',
  tracks: 'Mario Circuit\nMoo Moo Meadows',
  data: 'track,lap,seconds\nRainbow Road,1,41.2\nRainbow Road,2,40.7',
};

const commit = (file, text, msg) => [{ file, text }, `git add ${file}`, `git commit -m "${msg}"`];

// kart-stats with 3 commits (README, laps, tracks) on main.
export const baseRepo = (dir = 'kart-stats') => [
  `mkdir ${dir}`, `cd ${dir}`, 'git init',
  ...commit('README.md', F.readme, 'Add README'),
  ...commit('laps.py', F.laps, 'Add lap times'),
  ...commit('tracks.txt', F.tracks, 'Add track list'),
  'cd ~',
];

// kart-stats with 5 commits (adds average + best lap).
export const historyRepo = (dir = 'kart-stats') => [
  `mkdir ${dir}`, `cd ${dir}`, 'git init',
  ...commit('README.md', F.readme, 'Add README'),
  ...commit('laps.py', F.laps, 'Add lap times'),
  ...commit('laps.py', F.lapsAvg, 'Add average calculation'),
  ...commit('laps.py', F.lapsBest, 'Add best lap'),
  ...commit('data.csv', F.data, 'Add Rainbow Road data'),
  'cd ~',
];

// Put a history repo on "GitHub" and give the player a fresh clone in ~/kart-stats.
export const remoteAndClone = (extra = []) => [
  ...historyRepo('origin-build'),
  'cd origin-build', ...extra, 'cd ~',
  `@remote ${URL} origin-build`,
  `git clone ${URL}`,
];

// Luigi (a teammate) clones, runs `lines`, and pushes. The player's clone becomes stale.
export const luigiPushes = (lines) => [
  `git clone ${URL} /tmp/luigi`, 'cd /tmp/luigi',
  'git config user.name "Luigi"', 'git config user.email "luigi@mushroom.kingdom"',
  ...lines, 'git push', 'cd ~', 'rm -rf /tmp/luigi',
];

export { commit };
