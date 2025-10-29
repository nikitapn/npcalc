#!/bin/bash

cmake -G "Ninja" -B .build_local -S . \
  -DOPT_NPRPC_SKIP_TESTS=ON \
  -DCMAKE_BUILD_TYPE=Release