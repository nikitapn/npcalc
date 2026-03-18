#!/bin/bash

set -euo pipefail

ROOT_DIR=$(dirname "$(readlink -e "${BASH_SOURCE[0]}")")
BUNDLE_ROOT="$ROOT_DIR/runtime/prod_bundle"
SYSTEM_LIB_ROOT="$BUNDLE_ROOT/bundle/runtime-libs/system/x86_64-linux-gnu"

rm -rf "$BUNDLE_ROOT"
mkdir -p \
    "$BUNDLE_ROOT/bundle/app" \
    "$BUNDLE_ROOT/bundle/runtime-libs" \
    "$SYSTEM_LIB_ROOT" \
    "$BUNDLE_ROOT/docker"

python3 "$ROOT_DIR/gen_stubs.py"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$ROOT_DIR/swift_server":/app \
  -v "$ROOT_DIR/certs":/app/certs:ro \
  -w /app \
  nscalc-builder:latest \
  swift build -c release

(cd "$ROOT_DIR/new_client" && npm run build)
"$ROOT_DIR/republish-journal-assets.sh" "$ROOT_DIR/new_client/dist"

cp "$ROOT_DIR/swift_server/.build/release/NScalcServer" "$BUNDLE_ROOT/bundle/app/NScalcServer"
cp -a "$ROOT_DIR/new_client/dist" "$BUNDLE_ROOT/bundle/app/www"
cp -a "$ROOT_DIR/sample_data" "$BUNDLE_ROOT/bundle/seed"
cp "$ROOT_DIR/docker/Dockerfile.prod" "$BUNDLE_ROOT/docker/Dockerfile.prod"
cp "$ROOT_DIR/docker/entrypoint.prod.sh" "$BUNDLE_ROOT/docker/entrypoint.prod.sh"

docker run --rm \
  -v "$BUNDLE_ROOT/bundle/runtime-libs:/out" \
  nscalc-builder:latest \
  sh -lc '
    set -e
    mkdir -p /out/nprpc /out/boost /out/system/x86_64-linux-gnu
    cp -a /opt/nprpc/lib /out/nprpc/
    cp -a /opt/boost/lib /out/boost/
    cp -a /usr/lib/x86_64-linux-gnu/libsqlite3.so* /out/system/x86_64-linux-gnu/
    cp -a /lib/x86_64-linux-gnu/liburing.so.2* /out/system/x86_64-linux-gnu/
    cp -a /lib/x86_64-linux-gnu/libstdc++.so.6* /out/system/x86_64-linux-gnu/
    cp -a /lib/x86_64-linux-gnu/libgcc_s.so.1* /out/system/x86_64-linux-gnu/
    cp -a /lib/x86_64-linux-gnu/libatomic.so.1* /out/system/x86_64-linux-gnu/
    cp -a /opt/openssl/lib/libssl.so.3* /out/system/x86_64-linux-gnu/
    cp -a /opt/openssl/lib/libcrypto.so.3* /out/system/x86_64-linux-gnu/
  '

tar -C "$BUNDLE_ROOT" -czf "$ROOT_DIR/runtime/nscalc-prod-bundle.tar.gz" .

echo "Created production bundle: $ROOT_DIR/runtime/nscalc-prod-bundle.tar.gz"