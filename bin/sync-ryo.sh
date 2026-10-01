#!/bin/bash
# The agent runs on GitHub against the public copy. When this machine is online,
# bring those records down and pass them on to the RYO submission repo.
# The RYO repo also holds the filled submission form, which stays out of the
# public copy: it lives on the local "ryo" branch, which merges the public
# records in and is pushed to the RYO repo's main.
cd "$(dirname "$0")/.." || exit 1
git pull -q --rebase public main || exit 1
if git show-ref -q --verify refs/heads/ryo; then
  git fetch -q origin && git checkout -q ryo && git merge -q --no-edit main && git push -q origin ryo:main; ok=$?
  git checkout -q main; [ $ok -eq 0 ] || exit 1
  echo "RYO repo synced to $(git log -1 --format=%h ryo)"
else
  git push -q origin HEAD:main && echo "RYO repo synced to $(git log -1 --format=%h)"
fi
