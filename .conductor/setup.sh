#!/usr/bin/env bash
#
# Conductor workspace setup for a Bun/TypeScript project — runs when a workspace is created.
set -euo pipefail

if [ -f package.json ]; then
    bun install
fi
