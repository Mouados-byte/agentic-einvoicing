# The same agents on kagent

`einvoice-expert` and `invoice-checker` also run on [kagent](https://kagent.dev) (CNCF sandbox), next to ARK in the same kind cluster. Both runtimes use the same MCP server, model, prompts and eval cases. Only the YAML around them changes.

## How ARK maps to kagent

| ARK (`chart/einvoice-agents`) | kagent (`kagent/manifests`) |
| --- | --- |
| `Model` `default`: provider `openai`, OpenRouter base URL, key in a Secret | `ModelConfig` `openrouter-haiku`: provider `OpenAI`, `openAI.baseUrl`, `apiKeySecret` `kagent-openrouter` |
| `MCPServer` `einvoice-rules` (also deploys the server) | `RemoteMCPServer` `einvoice-rules` pointing at the same Service, `http://einvoice-rules.default.svc.cluster.local/mcp`, `STREAMABLE_HTTP`. Nothing is redeployed. |
| Tool `einvoice-rules-search-rules` (prefixed by ARK) | Tool `search_rules` (the MCP name, listed in `mcpServer.toolNames`) |
| `Agent` `spec.prompt` | `Agent` `spec.declarative.systemMessage`, same text with the tool names changed |
| `Query` CRD per question | A2A `message/send` to `kagent-controller:8083/api/a2a/kagent/<agent>/` |
| Agents run inside `ark-completions` | Each agent is its own Deployment (Go ADK runtime) |

`einvoice-reviewer` and the sequential `einvoice-team` are not ported (out of scope). On kagent the reviewer step would be an agent used as a tool (`type: Agent` in `tools`).

## Version

The pinned release is **kagent 0.10.6** (API `kagent.dev/v1alpha2`), not the 1.0 line (`api.kagent.dev/v1alpha3`). kagent 1.0.x runs agents on Agent Substrate (gVisor sandboxes, PodCertificate identities, bundled PostgreSQL and RustFS). Substrate needs Kubernetes 1.34+ with the `PodCertificateRequest`, `ClusterTrustBundle` and `ClusterTrustBundleProjection` feature gates (kagent's own kind setup uses `kindest/node:v1.35.0`). This cluster runs Kubernetes 1.33.1, which doesn't have `PodCertificateRequest`. Moving to 1.0 means recreating the cluster with a newer node image and those gates.

## Run

```bash
make up                                    # ARK, MCP server, ARK agents (once)
OPENROUTER_API_KEY=... make up-kagent      # kagent CRDs + controller + agents, namespace kagent
node evals/run-kagent.mjs                  # cases that target the two agents, via A2A
```

`up-kagent` installs only the kagent controller and its bundled PostgreSQL (`kagent/values.yaml`). The UI is scaled to 0, and kmcp, the built-in tool server, Grafana MCP and the example agents are all off. Together with the two agent pods this adds about 0.4 GB of RAM. Rerunning the script upgrades the releases in place. It doesn't touch ARK or the `default` namespace.

Use fully qualified names with kubectl (`kubectl get agents.kagent.dev -n kagent`): ARK also defines a kind `Agent`, and the short name resolves to ARK's.

## Results

2026-11-18, same VPS and model (`anthropic/claude-haiku-5.5` via OpenRouter): **14/14** cases pass on two consecutive runs. These are the 16 cases minus the two that target the ARK team. In the second run the MCP server counted 8 `search_rules`, 5 `check_invoice` and 7 `lookup_company` calls, so the answers come from the tools, not from the model's memory. Both prompt-injection cases (`prompt-injection` on the expert, `invoice-injection` on the checker) pass on kagent too.
