#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/match/gen/matchv1"
mkdir -p "$OUT_DIR"

protoc \
  --proto_path="$REPO_ROOT/proto" \
  --go_out="$OUT_DIR" \
  --go_opt=paths=source_relative \
  --go-grpc_out="$OUT_DIR" \
  --go-grpc_opt=paths=source_relative \
  match.proto

echo "✓ match/gen/matchv1/ generado"
