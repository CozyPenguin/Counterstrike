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

## Multiplayer rooms on the same Wi-Fi

**Only one computer needs to run the server.** Other players open that computer’s
URL in their browsers. Running a separate server on each computer creates separate
room lists, even if both computers are on the same Wi-Fi.

1. On the host, run `npm install`, then `npm run dev`.
   Alternatively, run `npm run build && npm run preview`.
2. Click **MULTIPLAYER**. The room browser displays the host’s network URLs under
   **Playing on the same Wi-Fi?** Share a URL such as `http://192.168.1.42:5173`.
   Do not share `localhost` or `127.0.0.1`: those refer to each player’s own device.
   On a hosted preview, everyone can instead open the same preview URL.
3. Enter your player name and room name, then click **CREATE ROOM**.
4. Friends open the **same host URL**, click **MULTIPLAYER**, and click **JOIN**
   beside your room. The list updates automatically every three seconds, or via
   **REFRESH**. Click **ENTER GAME** to capture the mouse and play.

### What the room browser discovers

The browser lists rooms on the game server you opened, **not every server on your
Wi-Fi**. Browsers cannot perform native UDP broadcast/mDNS LAN game discovery.
This shared-server lobby approach needs no subnet scanning, separate connection
address per room, or browser extensions. Rooms show names, player counts, and a
10-player capacity. Empty rooms disappear; the remaining players can keep playing
if the room creator leaves. Each room has its own players, combat, and scores.

### Troubleshooting

- Allow inbound **TCP 5173** in the host’s firewall on your private network.
- All devices must be able to reach the host. Guest Wi-Fi/client isolation, VPNs,
  or separate subnets can block access even when Wi-Fi network names match.
- If you see different rooms, compare the URL on each device. They must point to
  the same server, not separate `localhost` instances.
- If the room server is unreachable, run the commands above. A static-file-only
  website cannot host rooms: the Node/Vite server must stay running.
- **COPY CURRENT GAME LINK** uses the clipboard when available. On HTTP browsers
  that block clipboard access, copy a displayed host URL manually.
- A room can close or fill between refreshes; the join error explains what happened.

### Game mode

LAN rooms are continuous **free-for-all deathmatch** for up to **10 players** each:
- AK-47 loadouts with unlimited reserve ammunition; **R** to reload.
- Server-resolved hits, wall occlusion, headshots, kills/deaths, and **TAB** scores.
- Automatic respawn after **3 seconds**, with **2 seconds** of spawn protection.
- No bots, buy menu, team rounds, or match-win limit in multiplayer.
- Releasing the mouse does not pause the room or make you invulnerable.
  **ESC → LEAVE LAN GAME** returns to the room browser.
- Scores reset on reconnect or server restart; rooms are not persistent.

WebSocket traffic uses the page’s host and port (`/lan`); the room list uses
`/api/rooms`. Use trusted private networks: there is no account system or full
anti-cheat (movement is client-driven with server bounds/speed checks).

Run `npm run test:lan` for integration tests covering room creation/listing,
isolated state and combat, full/missing rooms, empty-room cleanup, joining,
shooting, scores, reloads, respawns, and disconnects.

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
