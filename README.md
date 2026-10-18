# Counterstrike

A browser-based, Counter-Strike-style tactical FPS built with **Three.js** and **Vite**.
Fight rounds against a team of bots on a dust-inspired map, earn money, buy weapons
between rounds, and win 8 rounds to take the match.

![genre](https://img.shields.io/badge/genre-tactical%20FPS-orange) ![stack](https://img.shields.io/badge/stack-Three.js%20%2B%20Vite-blue)

## Play

```bash
npm install
npm run dev
```

Then open the printed URL (default `http://localhost:5173`), click **CLICK TO PLAY**,
and the pointer will lock to the game.

Production build / preview:

```bash
npm run build
npm run preview
```

Tests (headless smoke test of world, movement, weapons, bot AI):

```bash
npm test
```

## LAN multiplayer

1. On the host computer, run `npm install`, then `npm run dev`.
   Alternatively, run `npm run build && npm run preview` to serve the built game.
   Both commands include the multiplayer server on the **same port**, 5173.
2. Allow inbound TCP port **5173** through the host’s firewall on your private network.
3. Every player, including the host, opens `http://<host-LAN-IP>:5173`
   (for example, `http://192.168.1.42:5173`), enters a name, and clicks **JOIN LAN GAME**.
   Find the host IP with `ipconfig` on Windows, or your network settings on macOS/Linux.
   Other computers must use the host’s IP, **not** `localhost`.

LAN mode is a separate, continuous **free-for-all deathmatch** for up to **10 players**:
- Everyone receives an AK-47, with unlimited reserve ammunition; press **R** to reload.
- Server-resolved hits, wall occlusion, headshots, kills/deaths, and **TAB** scores.
- Automatic respawn after **3 seconds**, with **2 seconds** of spawn protection.
- No bots, buy menu, team rounds, or match-win limit in this mode.
- Releasing the mouse does **not** pause the shared game or make you invulnerable.
  Use **ESC → LEAVE LAN GAME** to return to the menu.
- The host process must stay running. If disconnected, join again from the menu;
  scores reset on reconnect or server restart.

All clients on one host share one match. WebSocket traffic uses the page’s host and
port (`/lan`), so no separate server address or port is needed. A static-file-only
host will **not** support multiplayer: run the Vite dev/preview command above.
Use a trusted private LAN: there is no account system, matchmaking, or full
anti-cheat (movement is client-driven with server bounds/speed checks).
Guest Wi-Fi isolation may prevent devices from reaching one another.

Run `npm run test:lan` for the two-client WebSocket integration test.

## The game

- **Round-based elimination** — you are Counter-Terrorist; wipe out the 5 terrorists
  (or survive the round timer) to win. First team to **8 round wins** takes the match.
- **Economy** — start with $800. Earn money for kills (weapon-dependent), round wins
  ($3250), and loss bonuses that build with a loss streak. Spend it in the **buy menu**
  (opens automatically at round start, or press `B`).
- **Weapons** — Glock-18, USP-S, P250, Desert Eagle, MAC-10, AK-47, M4A4, AWP, and a knife.
  Each has its own damage, fire rate, armor penetration, recoil pattern, movement
  inaccuracy, reload time, and price. The AWP has a 2-stage scope (`RMB`).
- **Ballistics feel** — hitscan weapons with spread that grows while moving/jumping,
  spray patterns that climb and recover, headshot multipliers, armor mitigation,
  and distance falloff.
- **Bots** — navigate the map with a real nav graph (auto-generated from world
  geometry), patrol, react to gunfire noise and close proximity, take time to
  acquire targets, strafe in fights, and land (and miss) shots like real opponents.
  Head and body hitboxes are separate — headshots hurt.
- **HUD** — dynamic crosshair, health/armor, ammo, money, round timer & score,
  kill feed, hit markers, damage direction indicators, scoreboard (`TAB`),
  and a sniper scope overlay.
- **Audio** — every sound (gunfire per weapon class, reloads, footsteps, hits,
  headshot pings, buy/deny, round stingers) is synthesized live with the Web Audio
  API. No audio assets needed.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Look |
| `LMB` | Fire |
| `RMB` | Scope (AWP) |
| `Space` | Jump |
| `Ctrl` | Crouch |
| `Shift` | Walk (quiet, more accurate) |
| `R` | Reload |
| `1 / 2 / 3` | Primary / Pistol / Knife |
| `Q` | Last weapon |
| `B` | Buy menu (during buy phase or first 20s of a round) |
| `TAB` | Scoreboard |
| `ESC` | Pause / release mouse |

## Project layout

```
index.html          HUD + menu markup
src/main.js         Game loop, round flow, economy, hit resolution
src/map.js          Dust-style map, collision AABBs, auto-generated nav graph
src/player.js       FPS controller (slide collision, step-up, crouch, bob)
src/weapons.js      Weapon stats, view models, recoil/spread/reload
src/bots.js         Bot AI: nav pathfinding, vision, combat, hitboxes
src/effects.js      Tracers, impact sparks, blood, decals (pooled)
src/hud.js          DOM HUD, buy menu, kill feed, scoreboard
src/audio.js        Procedural Web Audio sound engine
src/textures.js     Procedural canvas textures (sand, crates, concrete, …)
scripts/smoke.mjs   Headless integration smoke test (npm test)
```

## Notes

- All art and sound is **procedurally generated** (canvas textures, low-poly box
  geometry, Web Audio synthesis) — the repo has no binary assets.
- Collision is AABB-based with sliding and step-up, so stairs and ledges climb smoothly.
- The nav graph is generated at load time by probing the world for walkable cells,
  so the bots route around crates and cover automatically.
