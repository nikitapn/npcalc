#!/bin/bash

set -euo pipefail

DATA_DIR="${NSCALC_DATA_DIR:-/data}"

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/nscalc.db" ]; then
    cp -R /app/seed/. "$DATA_DIR"/
fi

ARGS=(
    --hostname "${NSCALC_HOSTNAME:-localhost}"
    --port "${NSCALC_PORT:-8443}"
    --http-dir "${NSCALC_HTTP_DIR:-/app/www}"
    --data-dir "$DATA_DIR"
    --use-ssl "${NSCALC_USE_SSL:-1}"
)

if [ "${NSCALC_ENABLE_HTTP3:-1}" = "1" ]; then
    ARGS+=(--enable-http3)
fi

if [ "${NSCALC_USE_SSL:-1}" = "1" ]; then
    ARGS+=(
        --public-key "${NSCALC_PUBLIC_KEY:?NSCALC_PUBLIC_KEY is required when SSL is enabled}"
        --private-key "${NSCALC_PRIVATE_KEY:?NSCALC_PRIVATE_KEY is required when SSL is enabled}"
    )
    if [ -n "${NSCALC_DH_PARAMS:-}" ]; then
        ARGS+=(--dh-params "$NSCALC_DH_PARAMS")
    fi
fi

exec /app/NScalcServer "${ARGS[@]}"