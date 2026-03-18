#!/bin/bash

set -euo pipefail

ROOT_DIR=$(dirname "$(readlink -e "${BASH_SOURCE[0]}")")
SSH_TARGET=""
CONTAINER_NAME="nscalc-swift"
OUTPUT_DIR=""
SINCE="24 hours ago"

usage() {
  cat <<'EOF'
Usage: ./collect_prod_diagnostics.sh --ssh user@server [options]

  --ssh <user@server>        SSH target to collect diagnostics from
  --container <name>         Container name (default: nscalc-swift)
  --output-dir <path>        Local output directory
  --since <value>            Log window for journalctl/docker logs (default: 24 hours ago)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ssh)
      SSH_TARGET="$2"
      shift
      ;;
    --container)
      CONTAINER_NAME="$2"
      shift
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift
      ;;
    --since)
      SINCE="$2"
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

if [ -z "$SSH_TARGET" ]; then
  usage >&2
  exit 1
fi

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
if [ -z "$OUTPUT_DIR" ]; then
  OUTPUT_DIR="$ROOT_DIR/runtime/crash_reports/$TIMESTAMP"
fi

mkdir -p "$OUTPUT_DIR"

run_remote() {
  local output_file="$1"
  local command="$2"
  ssh "$SSH_TARGET" "CONTAINER_NAME='$CONTAINER_NAME' SINCE='$SINCE' bash -lc $'set -o pipefail\n$command'" > "$output_file" 2>&1 || true
}

run_remote "$OUTPUT_DIR/date.txt" 'date -Is'
run_remote "$OUTPUT_DIR/uname.txt" 'uname -a'
run_remote "$OUTPUT_DIR/docker-version.txt" 'docker version'
run_remote "$OUTPUT_DIR/docker-ps.txt" 'docker ps -a --no-trunc'
run_remote "$OUTPUT_DIR/container-inspect.json" 'docker inspect "$CONTAINER_NAME"'
run_remote "$OUTPUT_DIR/container-logs.txt" 'docker logs --timestamps "$CONTAINER_NAME"'
run_remote "$OUTPUT_DIR/container-state.txt" 'docker ps -a --filter "name=$CONTAINER_NAME" --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}"'
run_remote "$OUTPUT_DIR/image-inspect.json" 'image=$(docker inspect -f "{{.Image}}" "$CONTAINER_NAME" 2>/dev/null || true); if [ -n "$image" ]; then docker image inspect "$image"; fi'
run_remote "$OUTPUT_DIR/core-pattern.txt" 'cat /proc/sys/kernel/core_pattern'
run_remote "$OUTPUT_DIR/coredump-list.txt" 'command -v coredumpctl >/dev/null && coredumpctl list --no-pager || true'
run_remote "$OUTPUT_DIR/coredump-nscalc.txt" 'command -v coredumpctl >/dev/null && coredumpctl info --no-pager "$CONTAINER_NAME" || coredumpctl info --no-pager NScalcServer || true'
run_remote "$OUTPUT_DIR/docker-journal.txt" 'command -v journalctl >/dev/null && journalctl --no-pager --since "$SINCE" -u docker || true'

cat > "$OUTPUT_DIR/README.txt" <<EOF
Collected from: $SSH_TARGET
Container: $CONTAINER_NAME
Since: $SINCE
Created: $TIMESTAMP
EOF

echo "Saved diagnostics to $OUTPUT_DIR"