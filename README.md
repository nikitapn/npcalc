# NSCalc - Hydroponics Nutrient Solution Calculator

A web-based hydroponics nutrient solution calculator with integrated grow-journal
(story timeline, media uploads, live watch stream).

## Architecture

| Layer | Technology |
|-------|-----------|
| **Server** | Swift — `server/` |
| **Client** | Svelte + TypeScript — `client/` |
| **RPC** | NPRPC (binary WebSocket/HTTP3 protocol/WebTransport) — `external/nprpc/` |
| **IDL** | `idl/` — compiled to TS/Swift stubs by `scripts/gen_stubs.py` |
| **Database** | SQLite |
| **Transport** | TLS 1.3, HTTP/3 (QUIC), WebTransport |

## Features

- Nutrient solution calculations with EC/TDS management
- Multi-user authentication
- Grow journal: stories, timeline updates, media uploads (images + video)
- Live story watch stream (bidirectional NPRPC stream)
- Responsive web UI

## Quick Start

### 1. Build the Docker dev image

```bash
./scripts/build-dev-image.sh
```

### 2. Generate RPC stubs (TypeScript + Swift)

```bash
python3 scripts/gen_stubs.py
```

### 3. Build the Swift server

```bash
./scripts/build-swift-server.sh           # release
./scripts/build-swift-server.sh --debug   # debug
./scripts/build-swift-server.sh --no-gen  # skip stub generation
```

### 4. Run locally

```bash
./scripts/run-swift-server.sh
```

The default URL is `https://localhost:8443`. Use `./scripts/run_chrome.sh` to
open Chromium with the self-signed cert already bypassed.

## Project Structure

```
nscalc/
├── server/               # Swift server (NScalcServer)
│   └── Sources/
│       ├── NScalc/       # Generated NPRPC stubs
│       └── NScalcServer/ # Business logic, HTTP handlers, grow-journal
├── client/               # Svelte frontend
│   └── src/
│       ├── rpc/          # Generated NPRPC TypeScript stubs
│       ├── lib/          # Shared components and RPC helpers
│       └── view/         # Page-level Svelte components
├── idl/                  # NPRPC interface definitions
│   ├── nscalc.npidl      # Calculator interfaces
│   └── grow_journal.npidl# Grow journal (stories, uploads, watch stream)
├── external/nprpc/       # NPRPC framework (compiler + runtime)
├── scripts/              # Dev and deployment scripts
├── docker/               # Production Dockerfile and entrypoint
├── certs/                # Development TLS certificates
├── sample_data/          # Seed database and sample media
└── docs/                 # Documentation
```

## Configuration

The server accepts command-line flags (and matching `NSCALC_*` env vars):

```
--hostname <value>     Public hostname
--port <value>         Port (default: 8443)
--http-dir <path>      Static files root
--data-dir <path>      SQLite database directory
--use-ssl <0|1>        Enable TLS
--enable-http3         Enable HTTP/3 (QUIC)
--public-key <path>    TLS certificate file
--private-key <path>   TLS private key file
--dh-params <path>     Diffie-Hellman parameters
```

## Scripts

All dev and deployment scripts live in `scripts/`:

| Script | Purpose |
|--------|---------|
| `build-dev-image.sh` | Build `nscalc-builder:latest` Docker image |
| `build-swift-server.sh` | Generate stubs + build Swift server |
| `run-swift-server.sh` | Run Swift server in Docker for local dev |
| `run_chrome.sh` | Launch Chromium with self-signed cert bypass |
| `gen_stubs.py` | Generate TS + Swift NPRPC stubs from IDL |
| `package_prod.sh` | Build a production bundle tarball |
| `deploy.sh` | Package + upload + restart container on VPS |
| `smoke_prod.sh` | Smoke-test the production Docker image locally |
| `collect_prod_diagnostics.sh` | Gather logs/coredumps from the production server |
| `republish-journal-assets.sh` | Copy sample media into the client `dist/` |
| `reset-dev-auth.sh` | Reset dev credentials in the local SQLite DB |
| `docker-sourcekit-lsp.sh` | SourceKit-LSP bridge for VS Code Swift support |

## Production Deployment

```bash
# Build a release bundle locally
./scripts/package_prod.sh

# Upload, build the production image on the server, and restart the container
./scripts/deploy.sh \
    --ssh debian@your-vps \
    --hostname calc.example.com \
    --cert-dir /etc/letsencrypt \
    --public-key /certs/live/calc.example.com/fullchain.pem \
    --private-key /certs/live/calc.example.com/privkey.pem \
    --dh-params /certs/ssl-dhparams.pem \
    --port 443
```

The production image is based on `swift:6.3.0-slim`. State (SQLite database) is
persisted from `/opt/nscalc/data` on the VPS; TLS certificates are mounted
read-only from `--cert-dir` at `/certs`.

Point `--cert-dir` at the whole `/etc/letsencrypt` tree, not at
`live/<domain>`. certbot's `live/*.pem` are relative symlinks into
`../../archive/`, so mounting only `live/<domain>` puts the symlinks in the
container with their targets left outside it — they resolve to nothing and
the server fails to read its certificate. `--public-key` / `--private-key`
are then paths *inside* the container, under `/certs/live/<domain>/`.

### Certificate renewal

The server reloads TLS certificates on `SIGHUP` without dropping connections,
so a renewal needs no restart. Because `/etc/letsencrypt` is mounted, certbot
renewing on the host is visible in the container immediately; all the deploy
hook has to do is signal it:

```bash
certbot certonly --webroot -w /var/www/acme \
    -d calc.example.com \
    --deploy-hook 'docker kill -s HUP nscalc-swift'
```

`certbot renew` reuses the hook recorded at issuance, so the renewal timer
needs no further configuration.

If naming the container in a hook is awkward, `--cert-watch-interval <secs>`
makes the server poll the mounted certificate instead and reload when it
changes — nothing then has to cross the container boundary. The two are
independent; setting both is fine, since a reload that finds unchanged files
does nothing.

See `../nprpc/docs/certbot.md` for the ACME setup on the router side and the
details of what reload does to each transport.

## Development Tips

### Reset local login credentials

```bash
./scripts/reset-dev-auth.sh
```

Known dev logins after reset:
- `superuser@nscalc.com` / `1234`
- `guest@nscalc.com` / `3c2G4sc*vs2#1zf`

### VS Code Swift support

SourceKit-LSP runs inside the `nscalc-builder` container so the host Swift
toolchain version doesn't matter.  The path is already configured in
`.vscode/settings.json` via `scripts/docker-sourcekit-lsp.sh`.

### Regenerate NPRPC stubs after IDL changes

```bash
python3 scripts/gen_stubs.py          # both TS and Swift
python3 scripts/gen_stubs.py --ts     # TypeScript only
python3 scripts/gen_stubs.py --swift  # Swift only
```

## Browser Compatibility

Chrome/Chromium 90+, Firefox 88+, Safari 14+, Edge 90+

## License

See [LICENSE](LICENSE).

---

**Author:** Nikita (nikitapnn1@gmail.com)
