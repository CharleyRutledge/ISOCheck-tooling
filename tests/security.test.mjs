// Adversarial / security tests: secret exclusion from evidence, and MCP path
// confinement (no reading outside the allowed roots).
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { scan, isSecretFile } from '../iso-agent.mjs';
import { createServer } from '../iso-mcp-server.mjs';

// --- isSecretFile: excludes real secret material, keeps compliance docs ----
for (const f of ['.env', '.env.local', '.env.production', 'id_rsa', 'id_ed25519',
  'tls.key', 'server.pem', 'keystore.p12', 'creds.pfx', '.netrc', '.npmrc',
  'credentials', 'vault.kdbx', 'key.asc']) {
  assert.strictEqual(isSecretFile(f), true, `${f} should be treated as secret`);
}
for (const f of ['.env.example', '.env.sample', 'README.md', 'SECURITY.md',
  'CREDENTIAL_MANAGEMENT.md', 'package.json', 'keys.md', 'index.js']) {
  assert.strictEqual(isSecretFile(f), false, `${f} should NOT be treated as secret`);
}

// --- scan excludes secret files and credential dirs -----------------------
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-sec-'));
fs.mkdirSync(path.join(proj, '.ssh'));
fs.writeFileSync(path.join(proj, '.ssh/id_rsa'), 'PRIVATEKEY');
fs.writeFileSync(path.join(proj, '.env'), 'SECRET=leak-abc');
fs.writeFileSync(path.join(proj, '.env.example'), 'SECRET=');
fs.writeFileSync(path.join(proj, 'server.pem'), 'CERT');
fs.writeFileSync(path.join(proj, 'README.md'), '# ok');
const s = scan(proj);
assert.ok(!s.fileList.some((f) => f === '.env'), '.env excluded from listing');
assert.ok(!s.fileList.some((f) => f.includes('id_rsa')), '.ssh/id_rsa excluded');
assert.ok(!s.fileList.some((f) => f === 'server.pem'), 'pem excluded');
assert.ok(s.fileList.includes('.env.example'), '.env.example kept');
assert.ok(s.fileList.includes('README.md'), 'README kept');
// and none of their contents leak into the evidence corpus
assert.ok(!s.corpus.some((c) => c.content.includes('leak-abc')), 'no .env content in corpus');
assert.ok(!s.corpus.some((c) => c.content.includes('PRIVATEKEY')), 'no key content in corpus');
fs.rmSync(proj, { recursive: true, force: true });

// --- MCP path confinement -------------------------------------------------
const allowed = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-allow-'));
fs.writeFileSync(path.join(allowed, 'README.md'), '# inside');
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-outside-'));
fs.writeFileSync(path.join(outside, 'notes.md'), 'secret leak-xyz');

const prev = process.env.ISO_MCP_ALLOWED_ROOTS;
process.env.ISO_MCP_ALLOWED_ROOTS = allowed;

const server = createServer();
const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'sec', version: '0' });
await Promise.all([server.connect(st), client.connect(ct)]);

// inside the allowed root → works
const okRes = await client.callTool({ name: 'scan_project', arguments: { path: allowed } });
assert.ok(!okRes.isError, 'allowed path scanned');

// outside → rejected, nothing leaked
const badRes = await client.callTool({ name: 'scan_project', arguments: { path: outside } });
assert.strictEqual(badRes.isError, true, 'outside path rejected');
assert.ok(badRes.content[0].text.includes('outside the allowed roots'));
assert.ok(!badRes.content[0].text.includes('leak-xyz'), 'no content leaked');

// traversal out of an allowed root → rejected
const esc = await client.callTool({ name: 'scan_project', arguments: { path: path.join(allowed, '..', path.basename(outside)) } });
assert.strictEqual(esc.isError, true, 'traversal out of allowed root rejected');

await client.close();
if (prev === undefined) delete process.env.ISO_MCP_ALLOWED_ROOTS; else process.env.ISO_MCP_ALLOWED_ROOTS = prev;
fs.rmSync(allowed, { recursive: true, force: true });
fs.rmSync(outside, { recursive: true, force: true });

console.log('security tests ok');
