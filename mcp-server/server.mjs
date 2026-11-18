import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { searchRules, getRule } from './rules.mjs';
import { checkInvoice } from './invoice.mjs';
import { lookupCompany } from './company.mjs';

const PORT = Number(process.env.PORT ?? 8080);
const calls = new Map(); // tool name -> count, exposed on /metrics

const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const count = (tool) => calls.set(tool, (calls.get(tool) ?? 0) + 1);

function buildServer() {
  const server = new McpServer({ name: 'einvoice-rules', version: '0.1.0' });
  server.registerTool(
    'search_rules',
    {
      description: 'Search the French e-invoicing (réforme facturation électronique 2026) and Peppol rule base. Returns matching rules with their id and official source URL.',
      inputSchema: { query: z.string().describe('Question or keywords, in French or English'), limit: z.number().int().min(1).max(10).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => { count('search_rules'); return text(searchRules(query, limit)); },
  );
  server.registerTool(
    'get_rule',
    {
      description: 'Get one rule by id (e.g. FR-CAL-02).',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => { count('get_rule'); return text(getRule(id) ?? { error: `unknown rule ${id}` }); },
  );
  server.registerTool(
    'check_invoice',
    {
      description: 'Check a UBL 2.1 (Peppol BIS 3) or CII (Factur-X XML) invoice: SIREN check digits, buyer SIREN (new French mandatory mention), Peppol 0225 address vs SIREN, French postcodes, totals rules BR-CO-10 and BR-CO-15. Returns errors and warnings with rule ids, plus seller and buyer SIRENs.',
      inputSchema: { xml: z.string().max(200_000).describe('The full UBL or CII invoice XML') },
      annotations: { readOnlyHint: true },
    },
    async ({ xml }) => { count('check_invoice'); return text(checkInvoice(xml)); },
  );
  server.registerTool(
    'lookup_company',
    {
      description: 'Look up a French company by SIREN in the public company register (recherche-entreprises.api.gouv.fr): name, active or closed, creation date, activity, head office. Does not say which e-invoicing platform the company uses.',
      inputSchema: { siren: z.string().describe('9-digit SIREN') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ siren }) => { count('lookup_company'); return text(await lookupCompany(siren)); },
  );
  return server;
}

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : undefined); } catch (e) { reject(e); } });
  req.on('error', reject);
});

http.createServer(async (req, res) => {
  if (req.url === '/healthz') return res.end('ok');
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    const lines = ['# HELP mcp_tool_calls_total MCP tool calls by tool', '# TYPE mcp_tool_calls_total counter'];
    for (const [tool, n] of calls) lines.push(`mcp_tool_calls_total{tool="${tool}"} ${n}`);
    return res.end(lines.join('\n') + '\n');
  }
  if (req.url !== '/mcp') { res.statusCode = 404; return res.end(); }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); } // stateless: no SSE stream, no sessions

  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, await readBody(req));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) { res.statusCode = 400; res.end(JSON.stringify({ error: String(err.message ?? err) })); }
  }
}).listen(PORT, () => console.log(`einvoice-rules MCP listening on :${PORT}/mcp`));
