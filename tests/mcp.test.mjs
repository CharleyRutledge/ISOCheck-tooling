// Verifies the MCP server via a real client↔server round-trip over the
// in-memory transport. Exercises the no-key tools (list_standards, scan_project,
// audit_project) and checks that key-gated tools fail cleanly without a key.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../iso-mcp-server.mjs';

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-mcp-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# Thing\nA thing.');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"thing"}');
  return dir;
}
const parse = (res) => JSON.parse(res.content[0].text);

async function main() {
  // Tmp projects live under os.tmpdir(); allow it so path confinement doesn't
  // reject them (see tests/security.test.mjs for the confinement itself).
  process.env.ISO_MCP_ALLOWED_ROOTS = os.tmpdir();
  const server = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);

  // Tools are advertised
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepStrictEqual(
    names,
    ['assess_project', 'audit_project', 'list_standards', 'remediate_project', 'scan_project'],
    'all five tools registered'
  );

  // list_standards → 19 standards with controls
  const std = parse(await client.callTool({ name: 'list_standards', arguments: {} }));
  assert.ok(Array.isArray(std) && std.length >= 18, 'standards listed');
  assert.ok(std[0].id && Array.isArray(std[0].controls), 'standard shape');

  // scan_project → counts + preview, no key needed
  const root = tmpProject();
  const scan = parse(await client.callTool({ name: 'scan_project', arguments: { path: root } }));
  assert.strictEqual(scan.fileCount, 2);
  assert.ok(scan.preview.includes('README.md'), 'preview has evidence');

  // audit_project → deterministic score, no key needed
  const audit = parse(await client.callTool({ name: 'audit_project', arguments: { path: root } }));
  assert.ok(audit.summary && typeof audit.summary.overall === 'number', 'audit returns a score');

  // scan_project on a bad path → clean MCP error, not a crash
  const bad = await client.callTool({ name: 'scan_project', arguments: { path: path.join(root, 'nope') } });
  assert.strictEqual(bad.isError, true);
  assert.ok(bad.content[0].text.includes('not found'), 'bad path reported');

  // assess_project without a key → clean error (guard, no throw)
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const savedTok = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  const noKey = await client.callTool({ name: 'assess_project', arguments: { path: root } });
  assert.strictEqual(noKey.isError, true);
  assert.ok(noKey.content[0].text.includes('ANTHROPIC_API_KEY'), 'key requirement reported');
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  if (savedTok !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = savedTok;

  // unknown standards filter → clean error
  process.env.ANTHROPIC_API_KEY = 'x'; // pass the key gate to reach the filter check
  const badStd = await client.callTool({ name: 'assess_project', arguments: { path: root, standards: ['99999'] } });
  assert.strictEqual(badStd.isError, true);
  assert.ok(badStd.content[0].text.includes('No catalogued standard'), 'bad filter reported');
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey; else delete process.env.ANTHROPIC_API_KEY;

  fs.rmSync(root, { recursive: true, force: true });
  await client.close();
  console.log('mcp server tests ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
