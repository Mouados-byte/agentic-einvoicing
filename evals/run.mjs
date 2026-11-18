// Runs each eval case as an ARK Query and checks the answer with regexes.
// Usage: node evals/run.mjs [--mock]   (--mock: only the cases the scripted mock-llm knows)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const mockOnly = process.argv.includes('--mock');
const ns = process.env.NAMESPACE ?? 'default';
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).filter((c) => !mockOnly || c.mock);
const kubectl = (args, input) => execFileSync('kubectl', ['-n', ns, ...args], { input, encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(c) {
  const [type, name] = c.target.split('/');
  const queryName = `eval-${c.id}-${Date.now().toString(36)}`;
  const input = c.inputFile
    ? `${c.question}\n\n${readFileSync(new URL(`../${c.inputFile}`, import.meta.url), 'utf8')}`
    : c.question;
  kubectl(['apply', '-f', '-'], JSON.stringify({
    apiVersion: 'ark.mckinsey.com/v1alpha1', kind: 'Query',
    metadata: { name: queryName, labels: { 'app.kubernetes.io/part-of': 'einvoice-evals' } },
    spec: { input, target: { type, name }, timeout: '3m' },
  }));
  try {
    for (let i = 0; i < 90; i++) {
      const q = JSON.parse(kubectl(['get', 'query', queryName, '-o', 'json']));
      const phase = q.status?.phase;
      if (phase === 'done') return q.status.response?.content ?? '';
      if (phase === 'error' || phase === 'canceled') throw new Error(`query ${phase}: ${JSON.stringify(q.status?.conditions?.at(-1)?.message ?? '')}`);
      await sleep(2000);
    }
    throw new Error('timed out');
  } finally {
    kubectl(['delete', 'query', queryName, '--wait=false']);
  }
}

let failed = 0;
for (const c of cases) {
  let answer = '';
  let problems = [];
  try {
    answer = await ask(c);
    problems = [
      ...(c.expect ?? []).filter((p) => !new RegExp(p, 'i').test(answer)).map((p) => `missing /${p}/`),
      ...(c.reject ?? []).filter((p) => answer.includes(p)).map((p) => `leaked "${p}"`),
    ];
  } catch (e) {
    problems = [e.message];
  }
  failed += problems.length > 0;
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${c.id.padEnd(20)} ${problems.join('; ')}`);
  if (problems.length || process.env.VERBOSE) console.log(`      ${answer.replace(/\n/g, ' ').slice(0, 300)}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
