// Runs the eval cases that target einvoice-expert or invoice-checker against the kagent copies
// of those agents (scripts/up-kagent.sh), through kagent's A2A endpoint, and checks the answers
// with the same expect/reject rules as evals/run.mjs.
// Usage: node evals/run-kagent.mjs   (KAGENT_URL=http://host:8083 to skip the port-forward)
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ns = process.env.KAGENT_NAMESPACE ?? 'kagent';
const agents = new Set(['agent/einvoice-expert', 'agent/invoice-checker']);
const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).filter((c) => agents.has(c.target));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same rules as evals/run.mjs: every `expect` regex must match (case-insensitive),
// no `reject` string may appear verbatim.
const check = (c, answer) => [
  ...(c.expect ?? []).filter((p) => !new RegExp(p, 'i').test(answer)).map((p) => `missing /${p}/`),
  ...(c.reject ?? []).filter((p) => answer.includes(p)).map((p) => `leaked "${p}"`),
];

async function controllerUrl() {
  if (process.env.KAGENT_URL) return { url: process.env.KAGENT_URL, stop: () => {} };
  const port = 18083;
  const pf = spawn('kubectl', ['-n', ns, 'port-forward', 'svc/kagent-controller', `${port}:8083`], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`${url}/health`)).ok) return { url, stop: () => pf.kill() }; } catch {}
    await sleep(500);
  }
  pf.kill();
  throw new Error('port-forward to kagent-controller failed');
}

// A2A JSON-RPC message/send; the reply is a Task (answer in artifacts) or a Message.
async function ask(base, c) {
  const name = c.target.split('/')[1];
  const text = c.inputFile
    ? `${c.question}\n\n${readFileSync(new URL(`../${c.inputFile}`, import.meta.url), 'utf8')}`
    : c.question;
  const res = await fetch(`${base}/api/a2a/${ns}/${name}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': 'einvoice-evals' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'message/send',
      params: { message: { kind: 'message', role: 'user', messageId: randomUUID(), parts: [{ kind: 'text', text }] } },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (body.error) throw new Error(`A2A error: ${JSON.stringify(body.error).slice(0, 200)}`);
  const r = body.result ?? {};
  if (r.status?.state && r.status.state !== 'completed') throw new Error(`task ${r.status.state}`);
  const texts = (parts) => (parts ?? []).filter((p) => p.kind === 'text').map((p) => p.text);
  const answer = [
    ...(r.artifacts ?? []).flatMap((a) => texts(a.parts)),
    ...(r.artifacts?.length ? [] : texts(r.status?.message?.parts ?? r.parts)),
  ].join('\n');
  if (!answer) throw new Error('empty answer');
  return answer;
}

const { url, stop } = await controllerUrl();
let failed = 0;
try {
  for (const c of cases) {
    let answer = '';
    let problems;
    try {
      answer = await ask(url, c);
      problems = check(c, answer);
    } catch (e) {
      problems = [e.message];
    }
    failed += problems.length > 0;
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${c.id.padEnd(20)} ${problems.join('; ')}`);
    if (problems.length || process.env.VERBOSE) console.log(`      ${answer.replace(/\n/g, ' ').slice(0, 300)}`);
  }
} finally {
  stop();
}
console.log(`\n${cases.length - failed}/${cases.length} passed (kagent)`);
process.exit(failed ? 1 : 0);
