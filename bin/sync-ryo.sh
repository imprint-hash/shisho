#!/bin/bash
# The agent runs on GitHub against the public copy. When this machine is online,
# bring those records down and pass them on to the RYO submission repo.
cd "$(dirname "$0")/.." || exit 1
git pull -q --rebase public main && git push -q origin HEAD:main && echo "RYO repo synced to $(git log -1 --format=%h)"
