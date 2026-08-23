#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
GIT_SHA=$(git rev-parse --short HEAD)
echo "Deploying to Fly..."
flyctl deploy --local-only --image-label "$GIT_SHA"
echo ""
echo "✓ Deployed image $GIT_SHA"
echo "Watch the rollout with:"
echo " flyctl status"
echo " flyctl logs"