// Runs the full eval set against several models (via OpenRouter) and compares accuracy, cost and latency.
// Needs the real-model setup (OPENROUTER_API_KEY=... make up). Switches the cluster's `default` Model
// for each run and restores it at the end.
// Usage: node evals/compare-models.mjs [model-id ...]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadCases, runArkCase } from './lib.mjs';

const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'anthropic/claude-haiku-5.5',
  'anthropic/claude-sonnet-5.5',
  'openai/gpt-5-mini',
  'google/gemini-3.1-flash-lite',
  'mistralai/mistral-large-2512',
  'deepseek/deepseek-v4.1-flash',
];
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const ns = process.env.NAMESPACE ?? 'default';
const kubectl = (...args) => execFileSync('kubectl', ['-n', ns, ...args], { encoding: 'utf8' });

const pricing = Object.fromEntries(
  (await (await fetch('https://openrouter.ai/api/v1/models')).json()).data
    .map((m) => [m.id, { in: Number(m.pricing?.prompt ?? 0), out: Number(m.pricing?.completion ?? 0) }]),
);

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const original = kubectl('get', 'model', 'default', '-o', 'jsonpath={.spec.model.value}');
const cases = loadCases();
const summary = [];
try {
  for (const model of MODELS) {
    const price = pricing[model];
    if (!price) { console.log(`skip ${model}: not on OpenRouter`); continue; }
    kubectl('patch', 'model', 'default', '--type', 'merge', '-p', JSON.stringify({ spec: { model: { value: model } } }));
    kubectl('wait', '--for=condition=ModelAvailable', 'model/default', '--timeout=2m');
    console.log(`\n== ${model}`);
    const results = await pool(cases, CONCURRENCY, async (c) => {
      const r = await runArkCase(c);
      console.log(`${r.problems.length ? 'FAIL' : 'PASS'}  ${c.id.padEnd(22)} ${r.seconds.toFixed(1)}s  ${r.problems.join('; ')}`);
      return { id: c.id, ...r, cost: r.promptTokens * price.in + r.completionTokens * price.out };
    });
    const passed = results.filter((r) => !r.problems.length).length;
    const cost = results.reduce((s, r) => s + r.cost, 0);
    const secs = results.map((r) => r.seconds);
    summary.push({
      model, passed, total: results.length,
      costPer100: (cost / results.length) * 100,
      p50: pct(secs, 0.5), p95: pct(secs, 0.95),
      tokensPerQuestion: Math.round(results.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0) / results.length),
      failures: results.filter((r) => r.problems.length).map((r) => `${r.id}: ${r.problems.join('; ')}`),
      runCost: cost,
    });
  }
} finally {
  kubectl('patch', 'model', 'default', '--type', 'merge', '-p', JSON.stringify({ spec: { model: { value: original } } }));
  console.log(`\nrestored model default -> ${original}`);
}

summary.sort((a, b) => b.passed - a.passed || a.costPer100 - b.costPer100);
const date = new Date().toISOString().slice(0, 10);
const md = [
  `# Model comparison (${date})`,
  '',
  `${cases.length} eval cases (\`evals/cases.json\`), same agents, prompts and MCP tools; only the model changes. ` +
  'Cost uses OpenRouter list prices and the token counts ARK reports per query (all LLM calls, tool rounds and team members). ' +
  'Latency is the end-to-end query time, tool calls included.',
  '',
  '| Model | Passed | Cost per 100 questions | Latency p50 / p95 | Tokens per question |',
  '| --- | --- | --- | --- | --- |',
  ...summary.map((s) => `| \`${s.model}\` | ${s.passed}/${s.total} | $${s.costPer100.toFixed(2)} | ${s.p50.toFixed(1)} s / ${s.p95.toFixed(1)} s | ${s.tokensPerQuestion.toLocaleString('en')} |`),
  '',
  '## Failures',
  '',
  ...summary.flatMap((s) => (s.failures.length ? [`- **${s.model}**`, ...s.failures.map((f) => `  - ${f}`)] : [])),
  ...(summary.every((s) => !s.failures.length) ? ['None.'] : []),
  '',
  `Total spent on this comparison: $${summary.reduce((t, s) => t + s.runCost, 0).toFixed(2)}.`,
  '',
].join('\n');
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/model-comparison.md', import.meta.url), md);
writeFileSync(new URL('./results/model-comparison.json', import.meta.url), JSON.stringify({ date, summary }, null, 2) + '\n');
console.log(`\n${md}`);
