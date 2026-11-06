#!/usr/bin/env bash
# Builds the contracts and writes ABI-only JSON files to contracts/abi/ for the web app.
set -euo pipefail
cd "$(dirname "$0")/.."
forge build
mkdir -p abi
jq '.abi' out/BYWEscrow.sol/BYWEscrow.json > abi/BYWEscrow.json
jq '.abi' out/MockWIF.sol/MockWIF.json > abi/MockWIF.json
echo "wrote abi/BYWEscrow.json ($(jq length abi/BYWEscrow.json) entries), abi/MockWIF.json ($(jq length abi/MockWIF.json) entries)"
