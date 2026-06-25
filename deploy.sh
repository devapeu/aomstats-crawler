#!/usr/bin/env bash
set -euo pipefail

git pull
docker compose down
docker compose build --no-cache --progress=plain
docker compose up -d
docker ps -a
