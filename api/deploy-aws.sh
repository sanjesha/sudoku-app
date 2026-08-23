#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

REGION="eu-west-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/sudoku-api"
GIT_SHA=$(git rev-parse --short HEAD)

echo "Building image..."
docker build --platform linux/amd64 -t sudoku-api .

echo "Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

echo "Tagging image as ${GIT_SHA} and latest..."
docker tag sudoku-api:latest "${ECR_URL}:${GIT_SHA}"
docker tag sudoku-api:latest "${ECR_URL}:latest"

echo "Pushing..."
docker push "${ECR_URL}:${GIT_SHA}"
docker push "${ECR_URL}:latest"

echo "Triggering ECS deployment..."
aws ecs update-service \
  --cluster sudoku-cluster \
  --service sudoku-api \
  --force-new-deployment \
  --region ${REGION} > /dev/null

echo ""
echo "✓ Deployed image ${GIT_SHA}"
echo "Watch the rollout in the ECS console or with:"
echo "  aws ecs describe-services --cluster sudoku-cluster --services sudoku-api --region ${REGION} --query 'services[0].deployments[*].[status,desiredCount,runningCount]'"