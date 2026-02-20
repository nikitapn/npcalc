#!/bin/bash

# Docker Helper Script for NSCalc
# Runs Docker commands with proper user mapping to avoid permission issues

set -e

# Get current user info
USER_ID=$(id -u)
GROUP_ID=$(id -g)
USER_NAME=$(id -un)

# Default image
IMAGE=${1:-cpp-dev-env:latest}
shift || true

# Project root
ROOT_DIR=$(dirname $(readlink -e ${BASH_SOURCE[0]}))

echo "🐳 Running Docker container as user $USER_NAME ($USER_ID:$GROUP_ID)"

# Run Docker with proper user mapping and volume mounts
docker run --rm -it \
    --user "${USER_ID}:${GROUP_ID}" \
    -v "$ROOT_DIR:/app" \
    -v "$(readlink -f external/nprpc):/app/external/nprpc" \
    -w /app \
    -e HOME=/tmp \
    "$IMAGE" \
    "$@"
