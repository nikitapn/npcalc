#!/usr/bin/env python3
"""
Generate NPRPC stubs for TypeScript and Swift from IDL files.
Uses the nprpc-dev:latest Docker image which contains the npidl compiler.

Usage:
    python3 gen_stubs.py          # generate both TS and Swift
    python3 gen_stubs.py --ts     # generate TypeScript only
    python3 gen_stubs.py --swift  # generate Swift only
"""

import subprocess
import sys
import os
import argparse
from pathlib import Path

ROOT_DIR = Path(__file__).parent.resolve()
DOCKER_IMAGE = "nprpc-dev:latest"

# IDL files for TypeScript (both modules are used by the TS client)
TS_IDL_FILES = [
    "idl/nscalc.npidl",
    # "idl/proxy.npidl",
]

# IDL files for Swift (server only implements the nscalc interface;
#  proxy.npidl is for the Windows SOCKS5 relay client — add it if/when needed)
SWIFT_IDL_FILES = [
    "idl/nscalc.npidl",
]

# Output directories (relative to ROOT_DIR, mirrored as /app/... inside container)
TS_OUTPUT_DIR    = "client/src/rpc"
SWIFT_OUTPUT_DIR = "swift_server/Sources/NScalcServer/Generated"


def run_npidl(lang_flag: str, idl_files: list, output_dir: str) -> None:
    """Run npidl in the nprpc-dev Docker container for the given language."""
    container_output = f"/app/{output_dir}"
    container_idl_files = " ".join(f"/app/{f}" for f in idl_files)

    # Use sh -c so we can do mkdir -p first in a single docker run
    inner_cmd = (
        f"mkdir -p {container_output} && "
        f"npidl {lang_flag} --output-dir {container_output} {container_idl_files}"
    )

    cmd = [
        "docker", "run", "--rm",
        "--user", f"{os.getuid()}:{os.getgid()}",
        "-v", f"{ROOT_DIR}:/app",
        "-w", "/app",
        DOCKER_IMAGE,
        "sh", "-c", inner_cmd,
    ]

    print(f"  npidl {lang_flag}  →  {output_dir}")
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: npidl failed (exit {e.returncode})", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate NPRPC stubs via Docker npidl")
    parser.add_argument("--ts",    action="store_true", help="Generate TypeScript stubs only")
    parser.add_argument("--swift", action="store_true", help="Generate Swift stubs only")
    args = parser.parse_args()

    # Default: generate both
    gen_ts    = args.ts    or (not args.ts and not args.swift)
    gen_swift = args.swift or (not args.ts and not args.swift)

    print("=== Generating NPRPC stubs ===")
    print(f"  Docker image : {DOCKER_IMAGE}")
    if gen_ts:
        print(f"  TS IDL files  : {', '.join(TS_IDL_FILES)}")
    if gen_swift:
        print(f"  Swift IDL files: {', '.join(SWIFT_IDL_FILES)}")
    print()

    if gen_ts:
        run_npidl("--ts", TS_IDL_FILES, TS_OUTPUT_DIR)

    if gen_swift:
        run_npidl("--swift", SWIFT_IDL_FILES, SWIFT_OUTPUT_DIR)

    print()
    print("Done.")


if __name__ == "__main__":
    main()
