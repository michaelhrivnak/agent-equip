#!/usr/bin/env bash
#
# Conductor workspace setup for a .NET project — runs when a workspace (git worktree) is created.
set -euo pipefail

if command -v dotnet >/dev/null 2>&1; then
    dotnet restore
    # Restore local dotnet tools (e.g. CSharpier) when a manifest is present.
    [ -f .config/dotnet-tools.json ] && dotnet tool restore
fi
