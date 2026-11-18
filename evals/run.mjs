// Runs each eval case as an ARK Query and checks the answer with regexes.
// Usage: node evals/run.mjs [--mock]   (--mock: only the cases the scripted mock-llm knows)
import { loadCases, runArkCase } from './lib.mjs';

const mockOnly = process.argv.includes('--mock');
const cases = loadCases().filter((c) => !mockOnly || c.mock);

let failed = 0;
for (const c of cases) {
  const { answer, problems } = await runArkCase(c);
  failed += problems.length > 0;
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${c.id.padEnd(20)} ${problems.join('; ')}`);
  if (problems.length || process.env.VERBOSE) console.log(`      ${answer.replace(/\n/g, ' ').slice(0, 300)}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
