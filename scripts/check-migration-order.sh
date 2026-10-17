#!/usr/bin/env bash
# Fails when a migration this branch adds is not newer than the newest one on
# the base branch. goose refuses to apply a pending version that is lower than
# one already applied, so a migration slotted below main's newest breaks
# `migrate up` on every long-lived database.
#
# Usage: scripts/check-migration-order.sh [base-ref]   (default: origin/main)
set -euo pipefail

base="${1:-origin/main}"
dir="api/internal/infrastructure/database/migrations"

newest_on_base="$(git ls-tree --name-only "$base" "$dir/" | sed 's|.*/||' | grep -E '^[0-9]+_' | sort | tail -n1 | cut -d_ -f1)"
if [ -z "$newest_on_base" ]; then
  echo "no migration found on $base; nothing to check"
  exit 0
fi

status=0
while IFS= read -r added; do
  version="$(basename "$added" | cut -d_ -f1)"
  if [ "$version" -le "$newest_on_base" ]; then
    echo "::error file=$added::version $version is not newer than $newest_on_base, the newest migration on $base. Renumber it above $newest_on_base."
    status=1
  fi
done < <(git diff --name-only --diff-filter=A "$base"...HEAD -- "$dir" | grep -E '/[0-9]+_.*\.sql$' || true)

exit "$status"
