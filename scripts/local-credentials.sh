#!/bin/sh
# Local policy only: reuse the existing identity validator/issuer. Repeated starts
# preserve a working credential; ambiguous validation failures never rotate it.
# Recovery after DB replacement is explicit: task credentials:rotate.
# Platform flags credentials are a separate, explicitly invoked read-only action.
set -eu
PLATFORM_TOKEN_NAME="${PLATFORM_TOKEN_NAME:-local}"
PLATFORM_SCOPES="${PLATFORM_SCOPES:-read:organizations,delete:organizations,delete:memberships,delete:users,read:tokens,write:tokens}"
case "${1:-ensure}" in
  ensure)
    : "${KAITEN_PLATFORM_TOKEN_FILE:?is required: local credential destination}"
    exec kaiten-admin-tools platform-token ensure-local \
      --name "$PLATFORM_TOKEN_NAME" --scopes "$PLATFORM_SCOPES" \
      --output-file "$KAITEN_PLATFORM_TOKEN_FILE"
    ;;
  rotate)
    : "${KAITEN_PLATFORM_TOKEN_FILE:?is required: local credential destination}"
    # Explicit cascade revocation/recovery, never the normal dev path.
    exec kaiten-admin-tools platform-token create \
      --name "$PLATFORM_TOKEN_NAME" --scopes "$PLATFORM_SCOPES" \
      --no-expiry --replace --output-file "$KAITEN_PLATFORM_TOKEN_FILE"
    ;;
  flags-ensure|flags-rotate)
    : "${KAITEN_PLATFORM_FLAGS_TOKEN_FILE:?is required: platform flags credential destination}"
    : "${PLATFORM_FLAGS_ORGANIZATION_EXTERNAL_ID:?is required: trusted source organization external ID}"
    # Never read contents or validate over the network. An existing file is
    # preserved; stale credentials require the explicit flags-rotate action.
    if [ "$1" = flags-ensure ] && { [ -e "$KAITEN_PLATFORM_FLAGS_TOKEN_FILE" ] || [ -L "$KAITEN_PLATFORM_FLAGS_TOKEN_FILE" ]; }; then
      if [ -L "$KAITEN_PLATFORM_FLAGS_TOKEN_FILE" ] || [ ! -f "$KAITEN_PLATFORM_FLAGS_TOKEN_FILE" ] || [ ! -s "$KAITEN_PLATFORM_FLAGS_TOKEN_FILE" ]; then
        echo "Existing platform flags credential path is not a non-empty regular file; no credential issued" >&2
        exit 1
      fi
      echo "Existing platform flags credential file preserved (not validated); rotation is explicit"
      exit 0
    fi
    # Fixed scope: this token is browser-visible and must never carry writes,
    # organization administration, metering or token-issuance permissions.
    if [ "$1" = flags-rotate ]; then
      set -- --replace
    else
      set --
    fi
    exec kaiten-admin-tools service-token mint \
      --org "$PLATFORM_FLAGS_ORGANIZATION_EXTERNAL_ID" \
      --name "${PLATFORM_FLAGS_TOKEN_NAME:-local-platform-flags}" \
      --scopes read:feature_flags "$@" \
      --output-file "$KAITEN_PLATFORM_FLAGS_TOKEN_FILE"
    ;;
  *) echo "Usage: local-credentials.sh [ensure|rotate|flags-ensure|flags-rotate]" >&2; exit 2 ;;
esac
