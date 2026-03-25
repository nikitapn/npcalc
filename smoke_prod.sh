#!/bin/bash

set -e

SCRIPT_DIR=$(dirname $(readlink -e ${BASH_SOURCE[0]}))

docker rm -f nscalc-swift-prod-smoke >/dev/null 2>&1 || true

docker run -d --name nscalc-swift-prod-smoke \
  --user "$(id -u):$(id -g)" \
  --cap-add=NET_ADMIN \
  --cap-add=BPF \
  -v "$SCRIPT_DIR/certs:/certs:ro" \
  -e NSCALC_USE_SSL=1 \
  -e NSCALC_PUBLIC_KEY=/certs/localhost.crt \
  -e NSCALC_PRIVATE_KEY=/certs/localhost.key \
  -e NSCALC_ENABLE_HTTP3=1 \
  -e NSCALC_HOSTNAME=localhost \
  -e NSCALC_PORT=8443 \
  -p 8443:8443 \
  nscalc-swift-prod-test

sleep 3

docker ps --filter name=nscalc-swift-prod-smoke \
  --format '{{.Names}} {{.Status}}'

docker logs --tail 60 nscalc-swift-prod-smoke