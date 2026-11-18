# Model comparison (2026-11-18)

16 eval cases (`evals/cases.json`), same agents, prompts and MCP tools; only the model changes. Cost uses OpenRouter list prices and the token counts ARK reports per query (all LLM calls, tool rounds and team members). Latency is the end-to-end query time, tool calls included.

| Model | Passed | Cost per 100 questions | Latency p50 / p95 | Tokens per question |
| --- | --- | --- | --- | --- |
| `anthropic/claude-haiku-5.5` | 16/16 | $0.12 | 3.4 s / 11.3 s | 7,339 |
| `deepseek/deepseek-v4.1-flash` | 15/16 \* | $0.07 | 6.0 s / 12.8 s | 6,122 |
| `google/gemini-3.1-flash-lite` | 15/16 | $0.15 | 2.3 s / 4.9 s | 3,602 |
| `anthropic/claude-sonnet-5.5` | 15/16 \* | $2.41 | 8.1 s / 13.5 s | 8,097 |
| `mistralai/mistral-large-2512` | 14/16 | $0.27 | 3.4 s / 20.0 s | 4,284 |
| `openai/gpt-5-mini` | 14/16 | $0.41 | 17.1 s / 44.3 s | 5,834 |

\* One failure each was the eval's fault, not the model's. `invoice-ok` and `invoice-ok-cii` then rejected any mention of `BR-CO-10`/`BR-CO-15`, so a correct "OK, BR-CO-10 and BR-CO-15 pass" failed. Both cases now check the verdict (`NOT OK` must not appear). This table was not re-run after the fix; with it, both models would be at 16/16.

## Failures

- **deepseek/deepseek-v4.1-flash**
  - invoice-ok-cii: leaked "BR-CO-10"; leaked "BR-CO-15"
- **google/gemini-3.1-flash-lite**
  - formats: missing /UBL/; missing /CII/; missing /Factur-X/; missing /FR-FMT-01/
- **anthropic/claude-sonnet-5.5**
  - invoice-ok: leaked "BR-CO-10"; leaked "BR-CO-15"
- **mistralai/mistral-large-2512**
  - team-pme-deadline: missing /FR-CAL-02/
  - team-peppol-id: missing /FR-PEP-02/
- **openai/gpt-5-mini**
  - formats: missing /Factur-X/
  - b2c-ereporting: missing /e-reporting/

Total spent on this comparison: $0.55.
