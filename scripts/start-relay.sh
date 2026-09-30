#!/usr/bin/env bash
set -e

PORT=${1:-10005}

echo "=== Starting Justdial API Container ==="
if [ $(docker ps -q -f name=justdial-relay) ]; then
    echo "justdial-relay container already running."
else
    docker rm -f justdial-relay 2>/dev/null || true
    docker run -d --restart unless-stopped -p 127.0.0.1:${PORT}:10000 --name justdial-relay justdial-api
    echo "Started justdial-relay on 127.0.0.1:${PORT}"
fi

echo "=== Starting Ngrok Tunnel ==="
echo "Forwarding to 127.0.0.1:${PORT}..."
ngrok http 127.0.0.1:${PORT}
