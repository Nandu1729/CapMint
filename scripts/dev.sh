#!/usr/bin/env bash

# CapMint Local Dev Orchestrator (scripts/dev.sh)
# Usage: ./scripts/dev.sh [up | down | restart | logs | status]

set -euo pipefail

COMPOSE_FILE="infrastructure/docker/docker-compose.yml"

function check_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon is not running. Please start Docker Desktop and try again."
    exit 1
  fi
}

function usage() {
  echo "Usage: $0 [up | down | restart | logs | status]"
  echo "  up      : Start PostgreSQL, Redis, and Gateway containers in background"
  echo "  down    : Stop and purge all active containers"
  echo "  restart : Restart all containers"
  echo "  logs    : Stream logs from all running containers"
  echo "  status  : View running containers and health checks"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

ACTION="$1"

case "$ACTION" in
  up)
    check_docker
    echo "Starting CapMint containers..."
    docker compose -f "$COMPOSE_FILE" up -d
    echo "Staged successfully! Check status using: $0 status"
    ;;
  down)
    check_docker
    echo "Purging CapMint containers..."
    docker compose -f "$COMPOSE_FILE" down -v
    echo "Cleaned up."
    ;;
  restart)
    check_docker
    echo "Restarting CapMint containers..."
    docker compose -f "$COMPOSE_FILE" restart
    ;;
  logs)
    check_docker
    docker compose -f "$COMPOSE_FILE" logs -f
    ;;
  status)
    check_docker
    echo "=== Container Status ==="
    docker compose -f "$COMPOSE_FILE" ps
    ;;
  *)
    usage
    ;;
esac
