#!/bin/bash

```bash
export TAG=$(date +%Y%m%d)

# 1. Build and push new image
./Package.sh \
  --registry docker.io/bradhakr \
  --name     gateway-utility \
  --tag      $TAG \
  --push

docker tag  docker.io/bradhakr/gateway-utility:$TAG \
            docker.io/bradhakr/gateway-utility:latest
docker push docker.io/bradhakr/gateway-utility:latest

# 2. Zero-downtime rolling restart
kubectl rollout restart deployment/gateway-utility -n gu-dev
kubectl rollout restart deployment/gateway-utility -n gu-prod

# 3. Confirm
kubectl rollout status deployment/gateway-utility -n gu-dev
kubectl rollout status deployment/gateway-utility -n gu-prod
