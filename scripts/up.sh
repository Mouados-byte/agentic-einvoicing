#!/usr/bin/env bash
# One command from a fresh clone: kind cluster -> ARK -> model -> MCP server + agents -> smoke eval.
# Model: OPENAI_API_KEY or ANTHROPIC_API_KEY if set, otherwise a scripted mock LLM (no key, no cost).
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER=${CLUSTER:-ark-einvoice}
ARK_VERSION=${ARK_VERSION:-0.1.73}
IMAGE=einvoice-rules-mcp:0.1.0
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

step "Checking tools"
for t in docker kind kubectl helm node npm; do command -v "$t" >/dev/null || { echo "missing: $t"; exit 1; }; done
command -v ark >/dev/null || npm install -g "@agents-at-scale/ark@${ARK_VERSION}"

step "Cluster ${CLUSTER}"
# Own Docker network whose MTU fits the smallest host interface: behind a VPN
# (e.g. Zscaler, MTU 1370) the default 1500 makes image pulls in kind hang on TLS.
MTU=${KIND_MTU:-$(ip -o link show up 2>/dev/null | awk '$2 !~ /^(lo|veth|br-|docker)/ {print $5}' | sort -n | head -1)}
MTU=${MTU:-1500}
docker network inspect "$CLUSTER" >/dev/null 2>&1 \
  || docker network create -o "com.docker.network.driver.mtu=${MTU}" "$CLUSTER" >/dev/null
kind get clusters | grep -qx "$CLUSTER" \
  || KIND_EXPERIMENTAL_DOCKER_NETWORK="$CLUSTER" kind create cluster --config deploy/kind-config.yaml --wait 120s
kubectl config use-context "kind-${CLUSTER}"

# Trust the host's extra root CAs (TLS-inspecting proxies such as Zscaler) inside the node,
# or containerd can't pull images. Only files in /usr/local/share/ca-certificates are copied.
NODE="${CLUSTER}-control-plane"
if compgen -G "/usr/local/share/ca-certificates/*.crt" >/dev/null \
   && ! docker exec "$NODE" test -e /usr/local/share/ca-certificates/.host-cas; then
  for crt in /usr/local/share/ca-certificates/*.crt; do docker cp "$crt" "$NODE:/usr/local/share/ca-certificates/"; done
  docker exec "$NODE" sh -c 'update-ca-certificates >/dev/null && touch /usr/local/share/ca-certificates/.host-cas && systemctl restart containerd'
  echo "added host CAs to ${NODE}"
fi

step "Installing ARK ${ARK_VERSION}"
# Idempotent (helm upgrade --install). On a slow link a big image can outlast a Helm hook
# timeout; the pull carries on in the background, so a retry usually gets through.
for attempt in 1 2 3; do
  ark install --yes --ark-version "$ARK_VERSION" --wait-for-ready 10m && break
  (( attempt == 3 )) && exit 1
  echo "ark install failed (attempt ${attempt}/3), retrying in 20s"; sleep 20
done

if [[ -n "${ARK_SLIM:-}" ]]; then
  # Small machines (CI runners): the agents only need the controller, executor, API and broker.
  # Scale the dashboard and marketplace extras to zero so the rest can be scheduled.
  for d in ark-dashboard ark-mcp file-gateway-file-api file-gateway-filesystem-mcp file-gateway-versitygw noah-mcp kubernetes-mcp-server; do
    kubectl scale deploy "$d" --replicas=0 >/dev/null 2>&1 && echo "scaled $d to 0" || true
  done
  # Their MCPServer/Agent resources would keep the controller busy retrying dead endpoints.
  kubectl delete mcpserver ark-mcp file-gateway kubernetes-mcp-server noah-mcp --ignore-not-found --wait=false
  kubectl delete agent noah --ignore-not-found --wait=false
fi

step "Building and loading the MCP server image"
CA_BUNDLE=${CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}
CA_ARGS=(); [[ -f "$CA_BUNDLE" ]] && CA_ARGS=(--secret "id=ca,src=${CA_BUNDLE}")
DOCKER_BUILDKIT=1 docker build -q --network host "${CA_ARGS[@]}" -t "$IMAGE" mcp-server
kind load docker-image "$IMAGE" --name "$CLUSTER"

step "Model"
MODEL_ARGS=()
if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  # OpenRouter is OpenAI-compatible: ARK's openai provider with OpenRouter's base URL.
  MODEL_ARGS=(--set model.create=true --set model.provider=openai --set "model.model=${MODEL:-anthropic/claude-haiku-5.5}"
              --set model.baseUrl=https://openrouter.ai/api/v1 --set-string "model.apiKey=${OPENROUTER_API_KEY}")
elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
  MODEL_ARGS=(--set model.create=true --set model.provider=openai --set "model.model=${MODEL:-gpt-4.1-mini}"
              --set model.baseUrl=https://api.openai.com/v1 --set-string "model.apiKey=${OPENAI_API_KEY}")
elif [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  MODEL_ARGS=(--set model.create=true --set model.provider=anthropic --set "model.model=${MODEL:-claude-haiku-5-5}"
              --set model.baseUrl=https://api.anthropic.com --set-string "model.apiKey=${ANTHROPIC_API_KEY}")
fi
if (( ${#MODEL_ARGS[@]} )); then
  helm uninstall mock-llm >/dev/null 2>&1 || true
  kubectl patch configmap ark-config-streaming --type merge -p '{"data":{"enabled":"true"}}' >/dev/null
  # The two ARK pods that call the LLM API must trust the host's CAs too (TLS-inspecting proxy).
  # Re-applied on every run because `ark install` (helm upgrade) resets the deployments.
  if [[ -f "$CA_BUNDLE" ]] && compgen -G "/usr/local/share/ca-certificates/*.crt" >/dev/null; then
    kubectl -n ark-system create configmap host-ca-bundle --from-file=ca-certificates.crt="$CA_BUNDLE" \
      --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    for target in ark-controller:manager ark-completions:completions; do
      kubectl -n ark-system patch deploy "${target%%:*}" --patch "$(sed "s/CONTAINER/${target##*:}/" deploy/host-ca-patch.yaml)" >/dev/null
    done
    kubectl -n ark-system rollout status deploy/ark-controller --timeout 5m
    kubectl -n ark-system rollout status deploy/ark-completions --timeout 5m
  fi
  echo "real model from API key"
else
  # mock-llm 0.1.28 drops tool_calls from streamed responses, so ARK streaming is off in mock mode
  # (answers arrive in one piece in the dashboard chat). A real model turns it back on.
  kubectl patch configmap ark-config-streaming --type merge -p '{"data":{"enabled":"false"}}' >/dev/null
  echo "no API key: installing the scripted mock LLM"
  helm upgrade --install mock-llm oci://ghcr.io/dwmkerr/charts/mock-llm --version 0.1.28 \
    --values deploy/mock-llm-values.yaml --wait --timeout 10m
fi

step "Deploying the agents (Helm)"
CHART_ARGS=("${MODEL_ARGS[@]}")
if compgen -G "/usr/local/share/ca-certificates/*.crt" >/dev/null && [[ -f "$CA_BUNDLE" ]]; then
  # lookup_company calls a public API from the MCP pod; behind a TLS-inspecting proxy it needs the host CAs.
  kubectl create configmap host-ca-bundle --from-file=ca-certificates.crt="$CA_BUNDLE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
  CHART_ARGS+=(--set mcpServer.extraCaConfigMap=host-ca-bundle)
fi
# Retry: ARK's admission webhook runs in ark-controller and may still be starting after a restart.
for attempt in 1 2 3; do
  helm upgrade --install einvoice chart/einvoice-agents "${CHART_ARGS[@]}" --wait --timeout 10m && break
  (( attempt == 3 )) && exit 1
  echo "helm deploy failed (attempt ${attempt}/3), retrying in 20s"; sleep 20
done
kubectl rollout restart deploy/einvoice-rules >/dev/null   # pick up a rebuilt image with the same tag
kubectl rollout status deploy/einvoice-rules --timeout 2m
kubectl wait --for=condition=Available mcpserver/einvoice-rules --timeout 5m
kubectl wait --for=condition=ModelAvailable model/default --timeout 3m
kubectl get tools -l mcp/server=einvoice-rules

step "Smoke eval"
if (( ${#MODEL_ARGS[@]} )); then node evals/run.mjs; else node evals/run.mjs --mock; fi
