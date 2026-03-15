#!/usr/bin/env bash
# docker-sourcekit-lsp.sh
#
# Runs sourcekit-lsp from the nscalc-builder Docker image, forwarding the LSP
# protocol over stdin/stdout.  VS Code never knows it is talking to Docker.
#
# Set in .vscode/settings.json:
#   "sourcekit-lsp.serverPath": "${workspaceFolder}/docker-sourcekit-lsp.sh"
#
# Requirements:
#  - The workspace path must be identical inside and outside the container so
#    that all file URIs the editor sends are valid paths inside the container.
#  - /opt/nprpc_swift, /opt/nprpc, /opt/boost are already baked into the image;
#    we do NOT mount them from the host (the host copy may be the build-time
#    variant that still has .target / nprpc_bridge.cpp).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"          # this script lives at the repo root
HOME_DIR="$HOME"
IMAGE="nscalc-builder:latest"

# Ensure cache dirs exist on the host so the mounts are valid
mkdir -p "$HOME_DIR/.cache" "$HOME_DIR/.local" "$HOME_DIR/.swiftpm"

exec docker run --rm -i \
  --user "$(id -u):$(id -g)" \
  -e HOME=/home/ubuntu \
  \
  `# Mount the whole project at the same absolute path so LSP URIs match` \
  -v "$PROJECT_ROOT:$PROJECT_ROOT" \
  \
  `# Cache directories so index-store and build artefacts survive across LSP sessions` \
  -v "$HOME_DIR/.cache:/home/ubuntu/.cache" \
  -v "$HOME_DIR/.local:/home/ubuntu/.local" \
  -v "$HOME_DIR/.swiftpm:/home/ubuntu/.swiftpm" \
  \
  `# Tell Swift where to find the nprpc-swift pkg-config file` \
  -e PKG_CONFIG_PATH=/opt/nprpc/lib/pkgconfig \
  \
  `# Work inside the swift_server sub-package so SPM resolution just works` \
  -w "$PROJECT_ROOT/swift_server" \
  \
  "$IMAGE" \
  /usr/bin/sourcekit-lsp
