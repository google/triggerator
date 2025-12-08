#!/bin/bash

GIT_COMMIT=$(git rev-parse HEAD)
sed -i'.original' -e "s/SECURITY\s*:\s*.*$/SECURITY: 'IAP'/" app.yaml
sed -i'.original' -e "s/GIT_COMMIT\s*:\s*.*$/GIT_COMMIT: '$GIT_COMMIT'/" app.yaml
gcloud app deploy