// Shared eval helpers: load cases, build inputs, check answers, run one case as an ARK Query.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const loadCases = () => JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));

export const inputFor = (c) => (c.inputFile
  ? `${c.question}\n\n${readFileSync(new URL(`../${c.inputFile}`, import.meta.url), 'utf8')}`
  : c.question);

// Every `expect` regex must match (case-insensitive); no `reject` string may appear verbatim.
export const check = (c, answer) => [
  ...(c.expect ?? []).filter((p) => !new RegExp(p, 'i').test(answer)).map((p) => `missing /${p}/`),
  ...(c.reject ?? []).filter((p) => answer.includes(p)).map((p) => `leaked "${p}"`),
];

const ns = process.env.NAMESPACE ?? 'default';
const kubectl = (args, input) => execFileSync('kubectl', ['-n', ns, ...args], { input, encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seconds = (d) => (d ? Number.parseFloat(d) * (d.endsWith('ms') ? 0.001 : d.endsWith('m') && !d.endsWith('ms') ? 60 : 1) : undefined);

// Runs one case as an ARK Query. Returns the answer plus what the Query status reports:
// duration and token usage (summed over every LLM call, tool rounds and team members included).
export async function runArkCase(c) {
  const [type, name] = c.target.split('/');
  const queryName = `eval-${c.id}-${Date.now().toString(36)}`;
  kubectl(['apply', '-f', '-'], JSON.stringify({
    apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Query',
    metadata: { name: queryName, labels: { 'app.kubernetes.io/part-of': 'einvoice-evals' } },
    spec: { input: inputFor(c), target: { type, name }, timeout: '3m' },
  }));
  const started = Date.now();
  try {
    for (let i = 0; i < 100; i++) {
      const q = JSON.parse(kubectl(['get', 'query', queryName, '-o', 'json']));
      const phase = q.status?.phase;
      if (phase === 'done') {
        const answer = q.status.response?.content ?? '';
        const usage = q.status.tokenUsage ?? {};
        return {
          answer, problems: check(c, answer),
          seconds: seconds(q.status.duration) ?? (Date.now() - started) / 1000,
          promptTokens: usage.promptTokens ?? 0, completionTokens: usage.completionTokens ?? 0,
        };
      }
      if (phase === 'error' || phase === 'canceled') {
        return { answer: '', problems: [`query ${phase}: ${JSON.stringify(q.status?.conditions?.at(-1)?.message ?? '').slice(0, 200)}`],
          seconds: (Date.now() - started) / 1000, promptTokens: 0, completionTokens: 0 };
      }
      await sleep(2000);
    }
    return { answer: '', problems: ['timed out'], seconds: (Date.now() - started) / 1000, promptTokens: 0, completionTokens: 0 };
  } finally {
    kubectl(['delete', 'query', queryName, '--wait=false']);
  }
}
