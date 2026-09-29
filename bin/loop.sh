#!/bin/bash
# Runs one agent cycle at the top of every hour, from this machine.
# The RYO key is read from ~/.chainops/ryo_key and never enters the repo.
cd "$(dirname "$0")/.." || exit 1
set -a; [ -f "$HOME/.chainops/shisho.env" ] && . "$HOME/.chainops/shisho.env"; set +a
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
while true; do
  flock -n data/.run.lock node bin/run.mjs >> data/run.log 2>&1
  sleep $(( 3600 - $(date +%s) % 3600 ))
done
