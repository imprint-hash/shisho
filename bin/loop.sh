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
    if flock -n data/.run.lock node bin/run.mjs >> data/run.log 2>&1; then
      last=$hour
      # Publish the new records: the RYO repo, and the public copy the hosted site builds from.
      git add data
      if ! git diff --cached --quiet; then
        git -c user.name="imprint-hash" -c user.email="imprint76810@gmail.com" commit -qm "Agent cycle $hour" && { git push -q origin HEAD:main; git push -q public HEAD:main; } >> data/run.log 2>&1
      fi
    fi
  fi
  sleep 60
done
