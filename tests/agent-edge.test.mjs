// Edge-case / robustness tests for the deterministic scanner and helpers.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scan, renderEvidence, safeJoin, summarize } from '../iso-agent.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-edge-'));

// --- empty project doesn't crash -----------------------------------------
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-empty-'));
const es = scan(empty);
assert.strictEqual(es.fileCount, 0);
assert.ok(typeof renderEvidence(es) === 'string', 'renders empty evidence');
assert.strictEqual(summarize([]).score, 0, 'empty summary is 0, not NaN');
assert.strictEqual(summarize([]).fullyCompliant, true, 'vacuously true with no controls');
fs.rmSync(empty, { recursive: true, force: true });

// --- symlink loop + escape are not followed (no hang, not included) -------
fs.writeFileSync(path.join(tmp, 'real.md'), 'real');
fs.symlinkSync(tmp, path.join(tmp, 'loop'), 'dir'); // points at its own parent
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-out-'));
fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
fs.symlinkSync(outside, path.join(tmp, 'escape'), 'dir'); // points outside root
const s = scan(tmp); // must return; the lstat guard prevents infinite recursion
assert.ok(s.fileList.includes('real.md'));
assert.ok(!s.fileList.some((f) => f.startsWith('loop/')), 'symlink loop not traversed');
assert.ok(!s.fileList.some((f) => f.includes('secret')), 'symlink escape not traversed');
fs.rmSync(outside, { recursive: true, force: true });

// --- huge key file is truncated in the corpus -----------------------------
const big = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-big-'));
fs.writeFileSync(path.join(big, 'README.md'), 'x'.repeat(20 * 1024)); // > 16KB cap
const bs = scan(big);
const readme = bs.corpus.find((c) => c.path === 'README.md');
assert.ok(readme, 'README in corpus');
assert.ok(readme.content.includes('… [truncated]'), 'oversized file truncated');
assert.ok(readme.content.length < 20 * 1024, 'content actually shortened');
fs.rmSync(big, { recursive: true, force: true });

// --- binary/non-text files are listed but not read into the corpus --------
const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-bin-'));
fs.writeFileSync(path.join(bin, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
fs.writeFileSync(path.join(bin, 'README.md'), '# ok');
const bns = scan(bin);
assert.ok(bns.fileList.includes('logo.png'), 'binary listed in tree');
assert.ok(!bns.corpus.some((c) => c.path === 'logo.png'), 'binary not read as evidence');
fs.rmSync(bin, { recursive: true, force: true });

// --- safeJoin: assorted traversal shapes ----------------------------------
assert.throws(() => safeJoin(tmp, 'a/../../b'), /outside project root/);
assert.throws(() => safeJoin(tmp, '../x'), /outside project root/);
assert.throws(() => safeJoin(tmp, '/etc/passwd'), /outside project root/);
assert.strictEqual(safeJoin(tmp, './docs/ok.md'), path.join(tmp, 'docs/ok.md'));
assert.strictEqual(safeJoin(tmp, 'a/b/../c.md'), path.join(tmp, 'a/c.md')); // normalises, stays inside

fs.rmSync(tmp, { recursive: true, force: true });
console.log('agent edge-case tests ok');
