#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-playwright-trace-preview/raw}"
SITE_DIR="${2:-playwright-trace-preview/site}"
TITLE="${E2E_TRACE_PREVIEW_TITLE:-Playwright trace preview}"
RUN_URL="${E2E_TRACE_PREVIEW_RUN_URL:-}"

rm -rf "$SITE_DIR"
mkdir -p "$SITE_DIR"

reports=()

if [[ -d "$SOURCE_DIR" ]]; then
  while IFS= read -r artifact_dir; do
    [[ -d "$artifact_dir" ]] || continue

    artifact_name="$(basename "$artifact_dir")"
    index_file="$(find "$artifact_dir" -name index.html -type f -print -quit)"

    if [[ -z "$index_file" ]]; then
      continue
    fi

    report_root="$(dirname "$index_file")"
    target_dir="$SITE_DIR/$artifact_name"

    mkdir -p "$target_dir"
    cp -R "$report_root"/. "$target_dir"/
    reports+=("$artifact_name")
  done < <(find "$SOURCE_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
fi

{
  printf '%s\n' '<!doctype html>'
  printf '%s\n' '<html lang="en">'
  printf '%s\n' '<head>'
  printf '%s\n' '  <meta charset="utf-8">'
  printf '%s\n' '  <meta name="viewport" content="width=device-width, initial-scale=1">'
  printf '  <title>%s</title>\n' "$TITLE"
  printf '%s\n' '  <style>'
  printf '%s\n' '    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }'
  printf '%s\n' '    body { margin: 0; padding: 40px; background: Canvas; color: CanvasText; }'
  printf '%s\n' '    main { max-width: 880px; margin: 0 auto; }'
  printf '%s\n' '    h1 { font-size: 28px; line-height: 1.2; margin: 0 0 8px; }'
  printf '%s\n' '    p { color: color-mix(in srgb, CanvasText 76%, transparent); line-height: 1.55; }'
  printf '%s\n' '    ul { padding-left: 20px; }'
  printf '%s\n' '    li { margin: 10px 0; }'
  printf '%s\n' '    a { color: LinkText; font-weight: 600; }'
  printf '%s\n' '    .empty { border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 8px; padding: 16px; }'
  printf '%s\n' '  </style>'
  printf '%s\n' '</head>'
  printf '%s\n' '<body>'
  printf '%s\n' '  <main>'
  printf '    <h1>%s</h1>\n' "$TITLE"
  printf '%s\n' '    <p>Failed Playwright shards are published here as static HTML reports. Open a report, then use the trace attachment from any failed test.</p>'

  if [[ -n "$RUN_URL" ]]; then
    printf '    <p><a href="%s">Open the GitHub Actions run</a></p>\n' "$RUN_URL"
  fi

  if [[ ${#reports[@]} -eq 0 ]]; then
    printf '%s\n' '    <div class="empty">No Playwright HTML report was found in the downloaded artifacts.</div>'
  else
    printf '%s\n' '    <ul>'
    for report in "${reports[@]}"; do
      printf '      <li><a href="./%s/index.html">%s</a></li>\n' "$report" "$report"
    done
    printf '%s\n' '    </ul>'
  fi

  printf '%s\n' '  </main>'
  printf '%s\n' '</body>'
  printf '%s\n' '</html>'
} > "$SITE_DIR/index.html"
