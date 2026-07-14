#!/usr/bin/env bash

# CapMint Pre-flight Verification Script (scripts/preflight.sh)
# Performs sanity checks on developer environment before coding.

set -euo pipefail

echo "=== CapMint Pre-flight Verification ==="

# 1. Verify Node.js version
REQUIRED_NODE_MAJOR=18
NODE_VERSION=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "❌ FAIL: Node.js version is v$NODE_VERSION. Requires Node.js >= v18.0.0"
  exit 1
fi
echo "✅ PASS: Node.js version is v$NODE_VERSION"

# 2. Check for local environment variables file (.env)
if [ ! -f ".env" ]; then
  echo "⚠️ WARN: .env file not found. Copying .env.example to .env..."
  cp .env.example .env
  echo "✅ PASS: .env created from template."
else
  echo "✅ PASS: .env file found."
fi

# 3. Verify Docker Daemon is running
if ! docker info >/dev/null 2>&1; then
  echo "❌ FAIL: Docker is not running. Please start Docker Desktop."
  exit 1
fi
echo "✅ PASS: Docker Daemon is active."

# 4. Check network ports availability
function check_port() {
  local port=$1
  local service=$2
  if lsof -Pi :"$port" -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️ WARN: Port $port is already in use (required by $service). If it is another service, conflicts may occur."
  else
    echo "✅ PASS: Port $port ($service) is available."
  fi
}

check_port 5432 "PostgreSQL"
check_port 6379 "Redis"
check_port 8080 "API Gateway"

echo "====================================="
echo "🟢 Environment is READY for development!"
