#!/bin/bash

set -euo pipefail

SCRIPTS_DIR=$(dirname "$(readlink -e "${BASH_SOURCE[0]}")") 
ROOT_DIR=$(dirname "$SCRIPTS_DIR")
APP_DIR="/home/debian/nscalc-new"
REMOTE_TMP_DIR="/tmp/nscalc-release"
IMAGE_NAME="nscalc-swift:latest"
CONTAINER_NAME="nscalc-swift"
PORT="8443"
HOSTNAME=""
SSH_TARGET=""
CERT_DIR="/etc/letsencrypt"
PUBLIC_KEY="/certs/live/nikitapn.com/fullchain.pem"
PRIVATE_KEY="/certs/live/nikitapn.com/privkey.pem"
DH_PARAMS=""
CERT_WATCH_INTERVAL=""
SHM_C2S="/dev/shm/nprpc_nscalc_ingress_c2s"
SHM_S2C="/dev/shm/nprpc_quic_edge_s2c"
# RAG Model configuration
OLLAMA_MODEL="gemma4"
OLLAMA_NUM_CTX="16384"
COMPUTE_WORKER_TOKEN="testsecret123"

usage() {
  cat <<'EOF'
Usage: ./deploy.sh --ssh user@server --hostname calc.example.com --cert-dir /path/on/server [options]

  --ssh <user@server>         SSH target for deployment
  --hostname <value>          Public hostname written into host.json
  --cert-dir <path>           Remote certificate mount root, e.g. /etc/letsencrypt
  --app-dir <path>            Remote application state directory (default: /opt/nscalc)
  --remote-tmp <path>         Remote temporary upload directory (default: /tmp/nscalc-release)
  --image <name>              Docker image tag (default: nscalc-swift:latest)
  --container <name>          Docker container name (default: nscalc-swift)
  --port <value>              Public TCP/UDP port (default: 443)
  --public-key <path>         Certificate path inside the container (default: /certs/fullchain.pem)
  --private-key <path>        Private key path inside the container (default: /certs/privkey.pem)
  --dh-params <path>          DH params path inside the container
  --cert-watch-interval <secs>  Poll the mounted certificate every <secs> and reload it
                              in-process when it changes (default: unset = no polling).
                              Independent of the SIGHUP hook below, which always works.
  --shm-c2s <path>            Host shared-memory file for QUIC client->server traffic
  --shm-s2c <path>            Host shared-memory file for QUIC server->client traffic
  --ollama-model <name>       Ollama model name (default: gemma4)

The production container is started with CAP_NET_ADMIN and CAP_BPF so NPRPC can
install the eBPF SO_REUSEPORT selector required by multi-worker HTTP/3.

--cert-dir is mounted read-only at /certs, so certbot renewing on the host is
visible inside the container straight away.  Mount the whole /etc/letsencrypt
tree rather than just live/: certbot's live/*.pem are relative symlinks into
../../archive/, which dangle if only live/ is mounted.

To pick a renewal up without a restart, have certbot signal the container:

  certbot certonly --webroot -w /var/www/acme -d <hostname> \
    --deploy-hook 'docker kill -s HUP <container>'

The server reloads TLS certificates on SIGHUP without dropping connections.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ssh)
      SSH_TARGET="$2"
      shift
      ;;
    --hostname)
      HOSTNAME="$2"
      shift
      ;;
    --cert-dir)
      CERT_DIR="$2"
      shift
      ;;
    --app-dir)
      APP_DIR="$2"
      shift
      ;;
    --remote-tmp)
      REMOTE_TMP_DIR="$2"
      shift
      ;;
    --image)
      IMAGE_NAME="$2"
      shift
      ;;
    --container)
      CONTAINER_NAME="$2"
      shift
      ;;
    --port)
      PORT="$2"
      shift
      ;;
    --public-key)
      PUBLIC_KEY="$2"
      shift
      ;;
    --private-key)
      PRIVATE_KEY="$2"
      shift
      ;;
    --dh-params)
      DH_PARAMS="$2"
      shift
      ;;
    --cert-watch-interval)
      CERT_WATCH_INTERVAL="$2"
      shift
      ;;
    --shm-c2s)
      SHM_C2S="$2"
      shift
      ;;
    --shm-s2c)
      SHM_S2C="$2"
      shift
      ;;
    --ollama-model)
      OLLAMA_MODEL="$2"
      shift
      ;;
    --ollama-num-ctx)
      OLLAMA_NUM_CTX="$2"
      shift
      ;;
    --compute-worker-token)
      COMPUTE_WORKER_TOKEN="$2"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ -z "$SSH_TARGET" ] || [ -z "$HOSTNAME" ] || [ -z "$CERT_DIR" ]; then
  usage >&2
  exit 1
fi

cd "$ROOT_DIR"

"$SCRIPTS_DIR/package_prod.sh"

BUNDLE_TARBALL="$ROOT_DIR/runtime/nscalc-prod-bundle.tar.gz"
RELEASE_DIR="$APP_DIR/release"

ssh "$SSH_TARGET" "mkdir -p '$(dirname "$REMOTE_TMP_DIR")'"
scp "$BUNDLE_TARBALL" "$SSH_TARGET:$REMOTE_TMP_DIR.tar.gz"

ssh "$SSH_TARGET" \
  APP_DIR="$APP_DIR" \
  CERT_DIR="$CERT_DIR" \
  CONTAINER_NAME="$CONTAINER_NAME" \
  DH_PARAMS="$DH_PARAMS" \
  CERT_WATCH_INTERVAL="$CERT_WATCH_INTERVAL" \
  HOSTNAME="$HOSTNAME" \
  IMAGE_NAME="$IMAGE_NAME" \
  PORT="$PORT" \
  PRIVATE_KEY="$PRIVATE_KEY" \
  PUBLIC_KEY="$PUBLIC_KEY" \
  RELEASE_DIR="$RELEASE_DIR" \
  SHM_C2S="$SHM_C2S" \
  SHM_S2C="$SHM_S2C" \
  OLLAMA_MODEL="$OLLAMA_MODEL" \
  OLLAMA_NUM_CTX="$OLLAMA_NUM_CTX" \
  COMPUTE_WORKER_TOKEN="$COMPUTE_WORKER_TOKEN" \
  REMOTE_TMP_DIR="$REMOTE_TMP_DIR" \
  'bash -se' <<'EOF'
set -euo pipefail

for shm_file in "$SHM_C2S" "$SHM_S2C"; do
  if [ ! -e "$shm_file" ]; then
    echo "Required shared-memory file not found: $shm_file" >&2
    exit 1
  fi
done

mkdir -p "$REMOTE_TMP_DIR" "$APP_DIR/data" "$RELEASE_DIR"
rm -rf "$REMOTE_TMP_DIR"/*
tar -xzf "$REMOTE_TMP_DIR.tar.gz" -C "$REMOTE_TMP_DIR"

docker build -t "$IMAGE_NAME" -f "$REMOTE_TMP_DIR/docker/Dockerfile.prod" "$REMOTE_TMP_DIR"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

DOCKER_ARGS=(
  run -d
  --name "$CONTAINER_NAME"
  --restart no
  --user 0:0
  --cap-add=NET_ADMIN
  --cap-add=BPF
  -p "$PORT:443/tcp"
  -p "$PORT:443/udp"
  -v "$APP_DIR/data:/data"
  -v "$CERT_DIR:/certs:ro"
  --mount "type=bind,src=$SHM_C2S,dst=/dev/shm/nprpc_nscalc_ingress_c2s"
  --mount "type=bind,src=$SHM_S2C,dst=/dev/shm/nprpc_quic_edge_s2c"
  -e "NSCALC_HOSTNAME=$HOSTNAME"
  -e "NSCALC_PORT=443"
  -e "NSCALC_DATA_DIR=/data"
  -e "NSCALC_ENABLE_HTTP3=1"
  -e "NSCALC_USE_HTTP3_SHM_CHANNELS=1"
  -e "NSCALC_USE_SSL=1"
  -e "NSCALC_PUBLIC_KEY=$PUBLIC_KEY"
  -e "NSCALC_PRIVATE_KEY=$PRIVATE_KEY"
  -e "NSCALC_OLLAMA_MODEL=$OLLAMA_MODEL"
  -e "NSCALC_OLLAMA_NUM_CTX=$OLLAMA_NUM_CTX"
  -e "NSCALC_COMPUTE_WORKER_TOKEN=$COMPUTE_WORKER_TOKEN"
)

if [ -n "$DH_PARAMS" ]; then
  DOCKER_ARGS+=( -e "NSCALC_DH_PARAMS=$DH_PARAMS" )
fi

if [ -n "$CERT_WATCH_INTERVAL" ]; then
  DOCKER_ARGS+=( -e "NSCALC_CERT_WATCH_INTERVAL=$CERT_WATCH_INTERVAL" )
fi

docker "${DOCKER_ARGS[@]}" "$IMAGE_NAME"

rm -f "$REMOTE_TMP_DIR.tar.gz"
EOF

echo "Deployment complete: https://$HOSTNAME:$PORT"
echo
echo "Certificate renewal: point certbot's deploy hook at this container so a"
echo "renewal is reloaded without a restart:"
echo
echo "  --deploy-hook 'docker kill -s HUP $CONTAINER_NAME'"
