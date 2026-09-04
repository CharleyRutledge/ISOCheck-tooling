// Negative-path tests: malformed model output, API failures, hostile paths,
// and bad inputs must fail loudly and safely — never crash cryptically, never
// write outside the project, never hang.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runAgent, writeDoc, __setClientForTests } from '../iso-agent.mjs';

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-neg-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# App\nAn app.');
  return dir;
}
const std = { id: 'ISO 9001:2015', title: 'QMS', checks: ['quality policy documentation'] };
const okProfile = {
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', name: 'record_profile', input: {
    name: 'App', purpose: 'x', languages: [], frameworks: [],
    handles_personal_data: false, uses_ai: false, ai_details: '',
    deployment: '', docs_convention: '',
  } }],
};
// A client whose profile call succeeds, and whose assess/remediate is supplied per test.
function client({ assess, remediate }) {
  return {
    messages: {
      create: async (req) => {
        const t = req.tools[0].name;
        if (t === 'record_profile') return okProfile;
        if (t === 'record_assessment') return assess();
        throw new Error('unexpected create tool ' + t);
      },
      stream: (req) => ({ finalMessage: async () => remediate() }),
    },
  };
}
const tuse = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name, input }] });

async function main() {
  // 1. Nonexistent root ------------------------------------------------------
  await assert.rejects(
    () => runAgent({ root: path.join(os.tmpdir(), 'does-not-exist-' + Date.now()), standards: [std], log: () => {} }),
    /Project root not found/
  );

  // 2. Root is a file, not a directory --------------------------------------
  const f = path.join(os.tmpdir(), 'iso-file-' + Date.now());
  fs.writeFileSync(f, 'x');
  await assert.rejects(() => runAgent({ root: f, standards: [std], log: () => {} }), /not a directory/);
  fs.rmSync(f);

  // 3. Malformed assessment (controls is not an array) → clear error --------
  {
    const root = tmpProject();
    __setClientForTests(client({ assess: () => tuse('record_assessment', { controls: 'nope' }), remediate: () => tuse('write_docs', { files: [] }) }));
    await assert.rejects(() => runAgent({ root, standards: [std], maxPasses: 1, log: () => {} }), /malformed assessment/);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // 4. Malformed remediation (files missing) → clear error ------------------
  {
    const root = tmpProject();
    __setClientForTests(client({
      assess: () => tuse('record_assessment', { controls: [{ check: 'quality policy documentation', status: 'missing', rationale: '', gap: 'x', remediation: { path: 'docs/x.md', title: 't', must_cover: [] } }] }),
      remediate: () => tuse('write_docs', {}), // no files field
    }));
    await assert.rejects(() => runAgent({ root, standards: [std], maxPasses: 2, log: () => {} }), /malformed docs/);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // 5. Hostile remediation path (traversal) must be refused -----------------
  {
    const root = tmpProject();
    __setClientForTests(client({
      assess: () => tuse('record_assessment', { controls: [{ check: 'quality policy documentation', status: 'missing', rationale: '', gap: 'x', remediation: { path: 'docs/x.md', title: 't', must_cover: [] } }] }),
      remediate: () => tuse('write_docs', { files: [{ path: '../../etc/evil.md', content: 'pwned' }] }),
    }));
    await assert.rejects(() => runAgent({ root, standards: [std], maxPasses: 2, log: () => {} }), /outside project root/);
    // ensure nothing was written outside
    assert.ok(!fs.existsSync(path.join(root, '../../etc/evil.md')));
    fs.rmSync(root, { recursive: true, force: true });
  }

  // 6. Non-string doc content must be refused (no crash) --------------------
  {
    const root = tmpProject();
    __setClientForTests(client({
      assess: () => tuse('record_assessment', { controls: [{ check: 'quality policy documentation', status: 'missing', rationale: '', gap: 'x', remediation: { path: 'docs/x.md', title: 't', must_cover: [] } }] }),
      remediate: () => tuse('write_docs', { files: [{ path: 'docs/x.md', content: { not: 'a string' } }] }),
    }));
    await assert.rejects(() => runAgent({ root, standards: [std], maxPasses: 2, log: () => {} }), /content is object/);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // 7. Wrong tool name returned → clear "did not call" error ----------------
  {
    const root = tmpProject();
    __setClientForTests({
      messages: {
        create: async () => tuse('some_other_tool', { foo: 1 }),
        stream: () => ({ finalMessage: async () => tuse('some_other_tool', {}) }),
      },
    });
    await assert.rejects(() => runAgent({ root, standards: [std], maxPasses: 1, log: () => {} }), /did not call record_profile/);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // 8. API error from the client propagates cleanly -------------------------
  {
    const root = tmpProject();
    __setClientForTests({
      messages: {
        create: async () => { const e = new Error('429 rate limited'); e.status = 429; throw e; },
        stream: () => ({ finalMessage: async () => { throw new Error('unused'); } }),
      },
    });
    await assert.rejects(() => runAgent({ root, standards: [std], maxPasses: 1, log: () => {} }), /rate limited/);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // 9. writeDoc rejects empty / non-string path directly --------------------
  {
    const root = tmpProject();
    assert.throws(() => writeDoc(root, '', 'x'), /invalid path/);
    assert.throws(() => writeDoc(root, null, 'x'), /invalid path/);
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log('agent negative-path tests ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
