#!/usr/bin/env bash
# Sends testnet ETH and mWIF from the deployer to an address. TESTNET ONLY (chain 46630).
# Usage: ./script/fund.sh <address> [eth=0.001] [mwif=50000]
# Loads contracts/.env silently. Never prints keys.
set -euo pipefail
set +x

cd "$(dirname "$0")/.."
EXPLORER="https://explorer.testnet.chain.robinhood.com"

if [ $# -lt 1 ] || [ $# -gt 3 ]; then
  echo "usage: $0 <address> [eth=0.001] [mwif=50000]" >&2
  exit 1
fi
TO="$1"
ETH="${2:-0.001}"
MWIF="${3:-50000}"
[[ "$ETH" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "eth must be a number, got '$ETH'" >&2; exit 1; }
[[ "$MWIF" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "mwif must be a number, got '$MWIF'" >&2; exit 1; }

[ -f .env ] || { echo "contracts/.env not found" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
source .env >/dev/null 2>&1
set +a

: "${ROBINHOOD_TESTNET_RPC_URL:?ROBINHOOD_TESTNET_RPC_URL missing from .env}"
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY missing from .env}"
: "${MOCK_WIF_ADDRESS:?MOCK_WIF_ADDRESS missing from .env}"
RPC="$ROBINHOOD_TESTNET_RPC_URL"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC")"
if [ "$CHAIN_ID" != "46630" ]; then
  echo "refusing: RPC chain id is $CHAIN_ID, expected 46630 (testnet)" >&2
  exit 1
fi

TO="$(cast to-check-sum-address "$TO" 2>/dev/null)" || { echo "invalid address: $1" >&2; exit 1; }
SYMBOL="$(cast call "$MOCK_WIF_ADDRESS" 'symbol()(string)' --rpc-url "$RPC")"
[ "$SYMBOL" = '"mWIF"' ] || { echo "refusing: MOCK_WIF_ADDRESS is not mWIF (symbol $SYMBOL)" >&2; exit 1; }

MWIF_WEI="$(cast to-wei "$MWIF" ether)"

send() {
  # prints only the tx hash; fails loudly if the tx reverted
  local out status
  out="$(cast send "$@" --rpc-url "$RPC" --private-key "$DEPLOYER_PRIVATE_KEY" --json)"
  status="$(echo "$out" | jq -r '.status')"
  [ "$status" = "0x1" ] || { echo "transaction failed (status $status)" >&2; exit 1; }
  echo "$out" | jq -r '.transactionHash'
}

echo "funding $TO on chain $CHAIN_ID with $ETH ETH and $MWIF mWIF"
ETH_TX="$(send "$TO" --value "${ETH}ether")"
echo "ETH  tx: $EXPLORER/tx/$ETH_TX"
MWIF_TX="$(send "$MOCK_WIF_ADDRESS" 'transfer(address,uint256)' "$TO" "$MWIF_WEI")"
echo "mWIF tx: $EXPLORER/tx/$MWIF_TX"

echo "new ETH balance:  $(cast balance "$TO" --ether --rpc-url "$RPC")"
echo "new mWIF balance: $(cast from-wei "$(cast call "$MOCK_WIF_ADDRESS" 'balanceOf(address)(uint256)' "$TO" --rpc-url "$RPC" | awk '{print $1}')")"
