#!/bin/sh
# Mounted disks (for example on Render) are often owned by root. Make the data folder writable
# for the unprivileged "node" user, then drop privileges before starting the server.
set -e
if [ "$(id -u)" = "0" ]; then
  if [ -n "$ENGAGE_DB" ]; then
    dir="$(dirname "$ENGAGE_DB")"
    mkdir -p "$dir"
    chown -R node:node "$dir"
  fi
  exec su node -s /bin/sh -c 'exec node server/index.js'
fi
exec node server/index.js
