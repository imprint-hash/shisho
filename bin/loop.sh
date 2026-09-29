#!/bin/bash
# Runs one agent cycle each hour, from this machine. It checks the wall clock
# every minute rather than sleeping for an hour, so a laptop that slept catches
# up as soon as it wakes. The RYO key is read from ~/.chainops/ryo_key and never
# enters the repo.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f "$HOME/.chainops/shisho.env" ] && . "$HOME/.chainops/shisho.env"; set +a
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
last=""
while true; do
  hour=$(date -u +%Y-%m-%dT%H)
  if [ "$hour" != "$last" ]; then
    flock -n data/.run.lock node bin/run.mjs >> data/run.log 2>&1 && last=$hour
  fi
  sleep 60
done
