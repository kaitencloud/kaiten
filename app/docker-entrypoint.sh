#!/bin/sh
set -e

envFile=$(ls /usr/share/nginx/html/assets/runtime-config-*.js 2>/dev/null | head -n1)
if [ -n "$envFile" ]; then
  envsubst '${VITE_API_URL} ${VITE_CLERK_PUBLISHABLE_KEY} ${VITE_KAITEN_PLATFORM_API_URL} ${VITE_KAITEN_PLATFORM_FLAGS_TOKEN}' < "$envFile" > "${envFile}.tmp"
  mv "${envFile}.tmp" "$envFile"
fi

exec nginx -g 'daemon off;'
