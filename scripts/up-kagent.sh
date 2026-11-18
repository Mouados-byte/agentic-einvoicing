#!/usr/bin/env bash
# Runs einvoice-expert and invoice-checker on kagent, next to ARK, in the current cluster.
# Needs the ARK setup from `make up` (the einvoice-rules MCP server in namespace default)
# and OPENROUTER_API_KEY. Idempotent: rerun to upgrade or re-apply.
set -euo pipefail
cd "$(dirname "$0")/.."

# 0.10.6 is the newest kagent release that runs on a stock kind cluster. The 1.0 line
# (API api.kagent.dev/v1alpha3) needs Agent Substrate, which needs Kubernetes 1.34+ with the
# PodCertificateRequest and ClusterTrustBundle feature gates; see kagent/README.md.
KAGENT_VERSION=${KAGENT_VERSION:-0.10.6}
NS=kagent
CHARTS=oci://ghcr.io/kagent-dev/kagent/helm
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

[[ -n "${OPENROUTER_API_KEY:-}" ]] || { echo "OPENROUTER_API_KEY is not set (kagent agents need a real model)" >&2; exit 1; }
for t in kubectl helm; do command -v "$t" >/dev/null || { echo "missing: $t" >&2; exit 1; }; done
kubectl get svc einvoice-rules -n default >/dev/null \
  || { echo "Service default/einvoice-rules not found: run 'make up' first" >&2; exit 1; }

step "kagent CRDs ${KAGENT_VERSION}"
helm upgrade --install kagent-crds "${CHARTS}/kagent-crds" --version "$KAGENT_VERSION" \
  --namespace "$NS" --create-namespace --wait --timeout 5m

step "Model API key"
# From the environment into a Secret, via stdin so the key never shows up in argv or the repo.
kubectl create secret generic kagent-openrouter -n "$NS" --from-env-file=<(printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY") \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
echo "secret ${NS}/kagent-openrouter applied"

step "kagent ${KAGENT_VERSION} (controller + bundled PostgreSQL only)"
helm upgrade --install kagent "${CHARTS}/kagent" --version "$KAGENT_VERSION" \
  --namespace "$NS" --values kagent/values.yaml --wait --timeout 10m

step "ModelConfig, RemoteMCPServer, agents"
kubectl apply -f kagent/manifests/
# Fully qualified names: ARK also defines a kind "Agent", and the short name resolves to it.
kubectl wait -n "$NS" --for=condition=Accepted remotemcpservers.kagent.dev/einvoice-rules --timeout 2m
kubectl wait -n "$NS" --for=condition=Ready agents.kagent.dev/einvoice-expert agents.kagent.dev/invoice-checker --timeout 5m
kubectl get agents.kagent.dev -n "$NS"   # "agents" alone resolves to ARK's CRD
echo
echo "Run the evals: node evals/run-kagent.mjs"
