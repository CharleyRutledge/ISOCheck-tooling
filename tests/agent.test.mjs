// Unit tests for the deterministic parts of the ISOCheck agent
// (no network / no API key needed).
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  scan,
  renderEvidence,
  safeJoin,
  writeDoc,
  summarize,
  writeReports,
} from '../iso-agent.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-agent-'));

// --- safeJoin blocks path traversal ---------------------------------------
assert.strictEqual(safeJoin(tmp, 'docs/x.md'), path.join(tmp, 'docs/x.md'));
assert.throws(() => safeJoin(tmp, '../evil.md'), /outside project root/);
assert.throws(() => safeJoin(tmp, '/etc/passwd'), /outside project root/);

// --- writeDoc creates then updates ----------------------------------------
assert.strictEqual(writeDoc(tmp, 'docs/new.md', 'hello'), 'created');
assert.strictEqual(fs.readFileSync(path.join(tmp, 'docs/new.md'), 'utf8'), 'hello\n');
assert.strictEqual(writeDoc(tmp, 'docs/new.md', 'again\n'), 'updated');

// --- scan skips node_modules and reads key files --------------------------
fs.mkdirSync(path.join(tmp, 'node_modules/pkg'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'node_modules/pkg/index.js'), 'module.exports={}');
fs.writeFileSync(path.join(tmp, 'README.md'), '# Demo\nA demo app.');
const scanned = scan(tmp);
assert.ok(scanned.fileList.includes('README.md'), 'README listed');
assert.ok(!scanned.fileList.some((f) => f.includes('node_modules')), 'node_modules skipped');
assert.ok(scanned.corpus.some((c) => c.path === 'README.md'), 'README in corpus');
const ev = renderEvidence(scanned);
assert.ok(ev.includes('README.md') && ev.includes('A demo app.'), 'evidence includes README content');

// --- summarize math + full-compliance flag --------------------------------
const s1 = summarize([
  { controls: [{ status: 'compliant' }, { status: 'partial' }, { status: 'missing' }] },
]);
assert.deepStrictEqual(
  { c: s1.compliant, p: s1.partial, m: s1.missing, score: s1.score, full: s1.fullyCompliant },
  { c: 1, p: 1, m: 1, score: 33, full: false }
);
const s2 = summarize([{ controls: [{ status: 'compliant' }, { status: 'compliant' }] }]);
assert.strictEqual(s2.score, 100);
assert.strictEqual(s2.fullyCompliant, true);

// --- writeReports emits both artefacts ------------------------------------
const assessments = [
  {
    id: 'ISO 9001:2015',
    title: 'Quality management systems',
    controls: [
      { check: 'quality policy', status: 'compliant', rationale: 'see QMS.md', gap: '', remediation: { path: '' } },
      { check: 'feedback', status: 'missing', rationale: 'none found', gap: 'no feedback process', remediation: { path: 'docs/FEEDBACK.md' } },
    ],
  },
];
const profile = { name: 'Demo', purpose: 'A demo app.' };
writeReports(tmp, assessments, profile, summarize(assessments));
assert.ok(fs.existsSync(path.join(tmp, 'iso-compliance-report.json')), 'json report written');
const md = fs.readFileSync(path.join(tmp, 'ISO_COMPLIANCE_REPORT.md'), 'utf8');
assert.ok(md.includes('ISO 9001:2015') && md.includes('docs/FEEDBACK.md'), 'md report has content');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('agent unit tests ok');
