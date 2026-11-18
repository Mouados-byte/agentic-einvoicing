.PHONY: up up-kagent eval test ask audit down
up:            ## kind cluster + ARK + agents + smoke eval (one command)
	./scripts/up.sh
up-kagent:     ## kagent next to ARK, same MCP server, two agents (needs OPENROUTER_API_KEY), then: node evals/run-kagent.mjs
	./scripts/up-kagent.sh
eval:          ## full eval set (needs a real model: OPENROUTER_API_KEY, OPENAI_API_KEY or ANTHROPIC_API_KEY at `make up`)
	node evals/run.mjs
test:          ## MCP server unit tests
	cd mcp-server && npm ci --no-audit --no-fund && npm test
ask:           ## make ask Q="..." [T=agent/einvoice-expert]
	ark query $(or $(T),agent/einvoice-expert) "$(Q)"
audit:         ## AgentSpec OWASP LLM Top 10 audit of the expert agent (offline)
	cd agentspec && npx -y @agentspec/cli@0.5.0 audit agent.yaml
down:          ## delete the kind cluster
	kind delete cluster --name ark-einvoice
	docker network rm ark-einvoice 2>/dev/null || true
