#!/bin/bash

# Analyzes the target directories of the app/src project

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/src"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DIRS=(
  "$APP_DIR/components"
  "$APP_DIR/features"
  "$APP_DIR/functionals"
  "$APP_DIR/lib"
  "$APP_DIR/routes"
)

echo "📁 .tsx files in the target folders"
echo "─────────────────────────────────────────────"

find "${DIRS[@]}" -name "*.tsx" \
  ! -name "*.test.tsx" \
  ! -name "*.stories.tsx" \
  ! -path "*/components/ui/*" | while read -r file; do
  lines=$(wc -l < "$file")
  echo "$lines $file"
done | sort -rn | awk -v root="$REPO_ROOT" '
BEGIN { printf "%-6s %-s\n", "LINES", "FILE" }
$1 > 200 {
  path = $2
  sub(root "/", "", path)
  printf "%-6s %-s ⚠️\n", $1, path
}
'

echo ""
echo "📁 .ts files in the target folders"
echo "─────────────────────────────────────────────"

find "${DIRS[@]}" -name "*.ts" \
  ! -name "*.test.ts" \
  ! -name "*.store.ts" \
  ! -name "*.stores.ts" \
  ! -name "*.d.ts" \
  ! -path "*/api-client/*" | while read -r file; do
  lines=$(wc -l < "$file")
  echo "$lines $file"
done | sort -rn | awk -v root="$REPO_ROOT" '
BEGIN { printf "%-6s %-s\n", "LINES", "FILE" }
$1 > 200 {
  path = $2
  sub(root "/", "", path)
  printf "%-6s %-s ⚠️\n", $1, path
}
'

echo "─────────────────────────────────────────────"
echo "✅ Done"
