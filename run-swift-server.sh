#!/bin/bash
# Run the NScalc Swift server inside the nprpc-dev Docker container.
#
# Usage:
#   ./run_swift_server.sh              # release build
#   ./run_swift_server.sh --debug      # debug build
#   ./run_swift_server.sh debug        # gdb session (same as --debug)

set -e

ROOT_DIR=$(dirname $(readlink -e ${BASH_SOURCE[0]}))
DOCKER_IMAGE="nscalc-builder:latest"
BUILD_CONFIG="release"

# Read the hostname and port from public/host.json if present, else use defaults
HOSTNAME_ARG="localhost"
PORT_ARG="8443"
HOST_JSON="$ROOT_DIR/client/public/host.json"
if [ -f "$HOST_JSON" ]; then
    _host=$(python3 -c "import json,sys; d=json.load(open('$HOST_JSON')); print(d.get('hostname','localhost'))" 2>/dev/null || true)
    _port=$(python3 -c "import json,sys; d=json.load(open('$HOST_JSON')); print(d.get('port',8443))" 2>/dev/null || true)
    [ -n "$_host" ] && HOSTNAME_ARG=$_host
    [ -n "$_port" ] && PORT_ARG=$_port
fi

for arg in "$@"; do
    case $arg in
        --debug|debug) BUILD_CONFIG="debug" ;;
    esac
done

BINARY="/app/swift_server/.build/$BUILD_CONFIG/NScalcServer"

if [ ! -f "$ROOT_DIR/swift_server/.build/$BUILD_CONFIG/NScalcServer" ]; then
    echo "Binary not found: swift_server/.build/$BUILD_CONFIG/NScalcServer"
    echo "Run ./build_swift_server.sh first."
    exit 1
fi

echo "Starting NScalc Swift server ($BUILD_CONFIG) inside Docker..."
echo "  Image   : $DOCKER_IMAGE"
echo "  Hostname: $HOSTNAME_ARG  Port: $PORT_ARG"
echo ""

DOCKER_CMD=(
    docker run --rm -it
    --user "$(id -u):$(id -g)"
    --name nscalc-swift

    # Mount project sub-trees the server needs at runtime
    -v "$ROOT_DIR/swift_server":/app/swift_server:ro
    -v "$ROOT_DIR/certs":/app/certs:ro
    -v "$ROOT_DIR/client/public":/app/runtime/www:ro
    -v "$ROOT_DIR/sample_data":/app/sample_data      # rw — SQLite DB lives here

    # Expose the RPC/HTTP port
    -p "${PORT_ARG}:${PORT_ARG}/tcp"
    -p "${PORT_ARG}:${PORT_ARG}/udp"    # HTTP/3 (QUIC) uses UDP

    -w /app
    "$DOCKER_IMAGE"
)

if [ "$BUILD_CONFIG" = "debug" ]; then
    DOCKER_CMD+=(gdb --args)
fi

DOCKER_CMD+=(
    "$BINARY"
    --hostname "$HOSTNAME_ARG"
    --port     "$PORT_ARG"
    --http-dir /app/runtime/www
    --data-dir /app/sample_data
    --use-ssl  1
    --public-key  /app/certs/out/localhost.crt
    --private-key /app/certs/out/localhost.key
)

exec "${DOCKER_CMD[@]}"
