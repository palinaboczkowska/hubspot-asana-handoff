#!/bin/sh
# Bygger appen från källkod och driftsätter den till Cloud Run i europe-north1.
# Hemligheterna ligger i Secret Manager och sätts som miljövariabler i tjänsten.
set -e
cd "$(dirname "$0")"
. ./.env   # ASANA_WORKSPACE_GID och ROUTING_FILE läses härifrån
gcloud run deploy hubspot-asana-handoff \
  --source . \
  --region europe-north1 \
  --allow-unauthenticated \
  --set-secrets=HUBSPOT_TOKEN=hubspot-token:latest,ASANA_TOKEN=asana-token:latest,WORKFLOW_SECRET=workflow-secret:latest \
  --set-env-vars="ASANA_WORKSPACE_GID=$ASANA_WORKSPACE_GID,HUBSPOT_WON_STAGE=closedwon,ROUTING_FILE=$ROUTING_FILE" \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=2 \
  --quiet
