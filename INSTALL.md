# Install & play on your Wi-Fi

This archive contains everything you need to run Counterstrike and host a
multiplayer game for the people on your network. **No internet connection is
required** — only Node.js.

## 1. Install Node.js (once)

Download the **LTS** version from <https://nodejs.org/> and install it with the
default settings. Node.js 18 or newer is required.

Check that it worked by opening a terminal and running:

```bash
node --version
```

## 2. Start the game

| System | What to do |
| --- | --- |
| **Windows** | Double click **INSTALL-PLAY.bat** |
| **macOS / Linux** | Run `./INSTALL-PLAY.sh` in a terminal (first time: `chmod +x INSTALL-PLAY.sh`) |

The script installs what is missing, builds the game if needed, starts the
server and prints the addresses your friends have to open:

```
  On this computer : http://localhost:5173
  On your Wi-Fi   : http://192.168.1.42:5173
  On your Wi-Fi   : http://10.0.0.5:5173
```

Your browser opens automatically. Keep the window open — closing it stops the
game for everybody.

Useful options:

```bash
./INSTALL-PLAY.sh --port 8080   # use a different port
./INSTALL-PLAY.sh --no-open      # do not open a browser
./INSTALL-PLAY.sh --dev          # run the development build with hot reload
```

## 3. Invite your friends

1. Every player opens the **Wi-Fi URL** from step 2 (not `localhost` — that
   would point at their own computer).
2. They click **MULTIPLAYER**.
3. The host clicks **CREATE ROOM** and picks a connection method:
   * **WEBRTC P2P** — the players talk to each other directly, the server only
     introduces them. Recommended for a LAN.
   * **SERVER RELAY** — every message goes through this computer.
4. The others click **JOIN** next to the room, then **ENTER GAME**.

## If the players cannot connect

- Allow inbound **TCP 5173** (or the port you chose) in the firewall of the
  computer that runs the script.
- Guest Wi-Fi and "client isolation" block players even when the network
  names match. A phone hotspot or a plain router works better.
- Make sure all devices are on the same subnet and no VPN is running.
- Check that the host machine is not sleeping.

## Files in this archive

```
INSTALL-PLAY.sh / .bat   one click installer + LAN host
scripts/host-lan.mjs     the automation (install → build → host → print URLs)
game/                    the built game that is served to the browsers
server/lan.js            the room server (rooms, relay, WebRTC handshake)
src/                     map + room rules used by the server
node_modules/            the two runtime dependencies (three, ws)
```
