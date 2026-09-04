// End-to-end test of the agent's orchestration loop with a MOCKED client.
// No API key or network needed: a fake client returns canned tool calls, and
// the assessment verdict is driven by whether the target doc exists on disk —
// so the real re-scan / convergence / doc-writing paths are exercised.
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runAgent, __setClientForTests } from '../iso-agent.mjs';

function makeTmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-e2e-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# Widget API\nA REST API for widgets.');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'widget-api' }));
  fs.mkdirSync(path.join(dir, '.git')); // looks like a repo
  return dir;
}

// A fake Anthropic client. It inspects which tool the request asks for and
// returns a matching tool_use block. Assessment status depends on the live
// filesystem, so writing the remediation doc actually flips the next verdict.
function makeFakeClient(root) {
  const calls = { profile: 0, assess: 0, remediate: 0 };
  function respondTo(req) {
    const toolName = req.tools[0].name;
    if (toolName === 'record_profile') {
      calls.profile++;
      return toolUse('record_profile', {
        name: 'Widget API', purpose: 'A REST API for widgets.',
        languages: ['JavaScript'], frameworks: ['Express'],
        handles_personal_data: false, uses_ai: false, ai_details: '',
        deployment: 'node', docs_convention: 'docs/ as Markdown',
      });
    }
    if (toolName === 'record_assessment') {
      calls.assess++;
      // Parse the standard + controls out of the user message, decide each
      // control's status by whether its remediation doc already exists.
      const controls = extractControls(req.messages[0].content);
      const result = controls.map((check, i) => {
        const target = `docs/generated/${slug(check)}.md`;
        const exists = fs.existsSync(path.join(root, target));
        return {
          check,
          status: exists ? 'compliant' : 'missing',
          rationale: exists ? `documented in ${target}` : 'no evidence found',
          gap: exists ? '' : `missing ${check}`,
          remediation: { path: exists ? '' : target, title: check, must_cover: [check] },
        };
      });
      return toolUse('record_assessment', { controls: result });
    }
    if (toolName === 'write_docs') {
      calls.remediate++;
      // Write one file per requested target path (parsed from the ask block).
      const files = extractTargets(req.messages[0].content).map((p) => ({
        path: p, content: `# ${p}\n\nTailored doc for the Widget API.`,
      }));
      return toolUse('write_docs', { files });
    }
    throw new Error('unexpected tool ' + toolName);
  }
  return {
    calls,
    messages: {
      create: async (req) => respondTo(req),
      stream: (req) => ({ finalMessage: async () => respondTo(req) }),
    },
  };
}

function toolUse(name, input) {
  return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name, input }] };
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
function extractControls(userText) {
  const block = userText.split('CONTROLS:')[1] || '';
  return block.split('\n').map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
}
function extractTargets(userText) {
  const out = [];
  for (const line of userText.split('\n')) {
    const m = line.match(/Target file:\s*(\S+)/);
    if (m) out.push(m[1]);
  }
  return out;
}

async function main() {
  // --- Convergence: missing → written → compliant over 2 passes -----------
  const root = makeTmpProject();
  const fake = makeFakeClient(root);
  __setClientForTests(fake);
  const std = { id: 'ISO 9001:2015', title: 'QMS', checks: ['quality policy documentation', 'customer feedback process'] };

  const { summary, assessments } = await runAgent({
    root, standards: [std], maxPasses: 3, log: () => {},
  });

  assert.strictEqual(summary.fullyCompliant, true, 'should converge to compliant');
  assert.strictEqual(summary.missing, 0, 'no missing after remediation');
  assert.strictEqual(fake.calls.profile, 1, 'profiled once');
  assert.ok(fake.calls.remediate >= 1, 'remediation ran');
  // Docs were actually written to disk:
  assert.ok(fs.existsSync(path.join(root, 'docs/generated/quality-policy-documentation.md')));
  // Reports emitted:
  const rep = JSON.parse(fs.readFileSync(path.join(root, 'iso-compliance-report.json'), 'utf8'));
  assert.ok(rep.disclaimer.includes('NOT') && rep.disclaimer.toLowerCase().includes('certification'));
  assert.strictEqual(rep.summary.fullyCompliant, true);
  assert.ok(assessments[0].controls.every((c) => c.status === 'compliant'));
  fs.rmSync(root, { recursive: true, force: true });

  // --- report-only writes NO docs -----------------------------------------
  const root2 = makeTmpProject();
  __setClientForTests(makeFakeClient(root2));
  const r2 = await runAgent({ root: root2, standards: [std], reportOnly: true, maxPasses: 3, log: () => {} });
  assert.strictEqual(r2.summary.fullyCompliant, false, 'report-only leaves gaps');
  assert.ok(!fs.existsSync(path.join(root2, 'docs/generated')), 'no docs written in report-only');
  assert.ok(fs.existsSync(path.join(root2, 'ISO_COMPLIANCE_REPORT.md')), 'report still written');
  fs.rmSync(root2, { recursive: true, force: true });

  // --- max-passes cap: stops even if never converging ---------------------
  const root3 = makeTmpProject();
  const stubborn = makeFakeClient(root3);
  stubborn.messages.stream = () => ({ finalMessage: async () => toolUse('write_docs', { files: [] }) }); // writes nothing
  __setClientForTests(stubborn);
  const r3 = await runAgent({ root: root3, standards: [std], maxPasses: 2, log: () => {} });
  assert.strictEqual(r3.summary.fullyCompliant, false, 'never converges when docs are not written');
  assert.strictEqual(stubborn.calls.assess, 2, 'assessed exactly maxPasses times');
  fs.rmSync(root3, { recursive: true, force: true });

  // --- missing tool call surfaces a clear error ---------------------------
  const root4 = makeTmpProject();
  __setClientForTests({
    messages: {
      create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'no tool here' }] }),
      stream: () => ({ finalMessage: async () => ({ stop_reason: 'end_turn', content: [] }) }),
    },
  });
  await assert.rejects(
    () => runAgent({ root: root4, standards: [std], maxPasses: 1, log: () => {} }),
    /did not call record_profile/
  );
  fs.rmSync(root4, { recursive: true, force: true });

  console.log('agent e2e (mocked) tests ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
