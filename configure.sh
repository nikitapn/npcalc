#!/bin/bash

# Parse .private file and export variables
if [ -f .private ]; then
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ $key =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    # Trim whitespace
    key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    export "$key=$value"
  done < .private
fi

cmake -G "Ninja" -B .build_local -S . \
  -DOPT_NPRPC_SKIP_TESTS=ON \
  -DCMAKE_BUILD_TYPE=Release