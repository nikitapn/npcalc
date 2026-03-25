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
HOSTNAME_ARG="localhost"
PORT_ARG="8443"
ENABLE_HTTP3=1
USE_SSL=1
PUBLIC_KEY_ARG="/app/certs/out/localhost.crt"
PRIVATE_KEY_ARG="/app/certs/out/localhost.key"
DH_PARAMS_ARG=""

HOST_JSON="$ROOT_DIR/client/public/host.json"
if [ -f "$HOST_JSON" ]; then
    _host=$(python3 -c "import json,sys; d=json.load(open('$HOST_JSON')); print(d.get('hostname','localhost'))" 2>/dev/null || true)
    _port=$(python3 -c "import json,sys; d=json.load(open('$HOST_JSON')); print(d.get('port',8443))" 2>/dev/null || true)
    [ -n "$_host" ] && HOSTNAME_ARG=$_host
    [ -n "$_port" ] && PORT_ARG=$_port
fi

while [ $# -gt 0 ]; do
    case "$1" in
        --debug|debug)
            BUILD_CONFIG="debug"
            ;;
        --hostname)
            HOSTNAME_ARG="$2"
            shift
            ;;
        --port)
            PORT_ARG="$2"
            shift
            ;;
        --public-key)
            PUBLIC_KEY_ARG="$2"
            shift
            ;;
        --private-key)
            PRIVATE_KEY_ARG="$2"
            shift
            ;;
        --dh-params)
            DH_PARAMS_ARG="$2"
            shift
            ;;
        --disable-http3)
            ENABLE_HTTP3=0
            ;;
        --disable-ssl)
            USE_SSL=0
            ;;
        --help)
            cat <<'EOF'
Usage: ./run-swift-server.sh [options]

  --debug              Run the server under gdb inside Docker
  --hostname <value>   Public hostname for host.json
  --port <value>       HTTP/WS port to expose
  --public-key <path>  Certificate path inside the container
  --private-key <path> Private key path inside the container
  --dh-params <path>   Optional DH params path inside the container
  --disable-http3      Disable HTTP/3
  --disable-ssl        Disable TLS
EOF
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
    shift
done

BINARY="/app/swift_server/.build/$BUILD_CONFIG/NScalcServer"

if [ ! -f "$ROOT_DIR/swift_server/.build/$BUILD_CONFIG/NScalcServer" ]; then
    echo "Binary not found: swift_server/.build/$BUILD_CONFIG/NScalcServer"
    echo "Run ./build_swift_server.sh first."
    exit 1
fi

echo "Republishing journal assets into the HTTP root..."
"$ROOT_DIR/republish-journal-assets.sh" "$ROOT_DIR/new_client/dist"

echo "Starting NScalc Swift server ($BUILD_CONFIG) inside Docker..."
echo "  Image   : $DOCKER_IMAGE"
echo "  Hostname: $HOSTNAME_ARG  Port: $PORT_ARG"
echo ""

DOCKER_CMD=(
    docker run --rm -it
    --user "$(id -u):$(id -g)"
    --name nscalc-swift
    --cap-add=NET_ADMIN
    --cap-add=BPF

    # Mount project sub-trees the server needs at runtime
    -v "$ROOT_DIR/swift_server":/app/swift_server:ro
    -v "$ROOT_DIR/certs":/app/certs:ro
    -v "$ROOT_DIR/new_client/dist":/app/runtime/www  # rw — host.json lives here
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
    --use-ssl  "$USE_SSL"
)

if [ "$USE_SSL" = "1" ]; then
    DOCKER_CMD+=(
        --public-key "$PUBLIC_KEY_ARG"
        --private-key "$PRIVATE_KEY_ARG"
    )
    if [ -n "$DH_PARAMS_ARG" ]; then
        DOCKER_CMD+=(--dh-params "$DH_PARAMS_ARG")
    fi
fi

if [ "$ENABLE_HTTP3" = "1" ]; then
    DOCKER_CMD+=(--enable-http3)
fi

exec "${DOCKER_CMD[@]}"
