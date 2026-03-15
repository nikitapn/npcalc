#!/bin/env bash
# Build the NScalc Swift server.
#
# Steps:
#   1. Run npidl (via Docker) to generate TS and Swift stubs from IDL files.
#   2. Run `swift build` inside the nprpc-dev:latest container.
#
# Requires nprpc-dev:latest built from the updated Dockerfile.dev which:
#   - fixes Package.swift paths at image-build time
#   - installs logging.hpp under /opt/nprpc/include/nprpc/internal/
#   - creates UID/GID 1000 'developer' user
# => No runtime patching needed; --user passes host UID so .build/ is host-owned.
#
# Usage:
#   ./build_swift_server.sh           # generate stubs + build (release)
#   ./build_swift_server.sh --debug   # generate stubs + build (debug)
#   ./build_swift_server.sh --no-gen  # skip stub generation, only build

set -e

ROOT_DIR=$(dirname $(readlink -e ${BASH_SOURCE[0]}))
DOCKER_IMAGE="nscalc-builder:latest"
BUILD_CONFIG="release"
SKIP_GEN=0

for arg in "$@"; do
  case $arg in
    --debug)   BUILD_CONFIG="debug" ;;
    --no-gen)  SKIP_GEN=1 ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--debug] [--no-gen]"
      exit 1
      ;;
  esac
done

cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Step 1 – Generate stubs
# ---------------------------------------------------------------------------
if [ "$SKIP_GEN" -eq 0 ]; then
  echo "=== Step 1: Generating stubs ==="
  python3 gen_stubs.py
  echo
else
  echo "=== Step 1: Skipping stub generation (--no-gen) ==="
  echo
fi

# ---------------------------------------------------------------------------
# Step 2 – Build Swift server inside the Docker image
# ---------------------------------------------------------------------------
echo "=== Step 2: Building Swift server ($BUILD_CONFIG) ==="

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$ROOT_DIR/swift_server":/app \
  -v "$ROOT_DIR/certs":/app/certs:ro \
  -w /app \
  "$DOCKER_IMAGE" \
  swift build -c "$BUILD_CONFIG"

echo
echo "Build complete."
echo "Binary: swift_server/.build/$BUILD_CONFIG/NScalcServer"
