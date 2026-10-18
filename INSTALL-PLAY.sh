#!/usr/bin/env sh
# Counterstrike — install and host the game on this computer.
#
# Double click this file (or run it in a terminal) to install the game,
# start the server and get the addresses your friends have to open.
#
#   ./INSTALL-PLAY.sh              install, build and host
#   ./INSTALL-PLAY.sh --no-open    do not open a browser
#   ./INSTALL-PLAY.sh --port 8080  use a different port
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js 18 or newer is required but was not found."
  echo "  Install it from https://nodejs.org/ and run this file again."
  echo ""
  exit 1
fi

exec node scripts/host-lan.mjs "$@"
