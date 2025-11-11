#!/bin/env bash

set -e

cd $(dirname $(readlink -e ${BASH_SOURCE[0]}))

[ ! -L "external/npsystem" ] && ln -s $(readlink -f ../npsystem) external/npsystem

# Get current user ID and group ID to pass to Docker
USER_ID=$(id -u)
GROUP_ID=$(id -g)

echo "Building Docker images with USER_ID=$USER_ID and GROUP_ID=$GROUP_ID"

cd docker
docker build -t cpp-dev-env:boost-1-89 -f Dockerfile.boost_1_89 .
docker build -t cpp-dev-env:latest -f Dockerfile.dev \
    --build-arg USER_ID=$USER_ID \
    --build-arg GROUP_ID=$GROUP_ID .
