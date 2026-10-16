#!/bin/sh
# Skapar hemligheterna i Secret Manager från .env och slår på de API:er som behövs.
# Körs en gång. Värdena läses från .env och skrivs aldrig ut.
set -e
cd "$(dirname "$0")"
. ./.env

PROJECT=$(gcloud config get-value project)
echo "Projekt: $PROJECT"

gcloud services enable run.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com --quiet

create_secret() {
  name=$1; value=$2
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet
    echo "  uppdaterad: $name"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --quiet
    echo "  skapad: $name"
  fi
}

create_secret hubspot-token "$HUBSPOT_TOKEN"
create_secret asana-token "$ASANA_TOKEN"
create_secret workflow-secret "$WORKFLOW_SECRET"

# Cloud Run kör som standardtjänstkontot; det behöver läsa hemligheterna.
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
SA="$NUM-compute@developer.gserviceaccount.com"
for s in hubspot-token asana-token workflow-secret; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
done
echo "Klart. Kör sedan ./deploy.sh"
