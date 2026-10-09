#!/usr/bin/env bash
# Validate a branch name against Conventional Branch 1.1.0 (repo policy: purpose prefixes only).
# Usage: check-branch.sh [branch]   (defaults to the current branch)
set -euo pipefail

name="${1:-$(git rev-parse --abbrev-ref HEAD)}"

case "$name" in
  main|master|develop) echo "ok: $name (trunk)"; exit 0 ;;
esac

segment='[a-z0-9]+(-[a-z0-9]+)*'
pattern="^(feature|feat|bugfix|fix|hotfix|release|chore)/${segment}(\.${segment})*$"

if [[ "$name" =~ $pattern ]]; then
  echo "ok: $name"
  exit 0
fi

echo "invalid: '$name'" >&2
echo "expected <type>/<description>; type in feature|feat|bugfix|fix|hotfix|release|chore;" >&2
echo "lowercase a-z0-9, single hyphens (dots only between segments, e.g. release/v1.2.0)." >&2
exit 1
