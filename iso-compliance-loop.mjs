#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyCompliancePack } from './iso-compliance-pack.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditScript = path.join(__dirname, 'iso-local-audit.mjs');
const reportGen = path.join(__dirname, 'generate-report-from-audit.mjs');

// Targets default to this repo (the always-in-scope project). Additional
// projects can be supplied without editing this file, so the loop stays
// portable across machines:
//   * env  ISO_AUDIT_TARGETS="/path/one=profile-a;/path/two=profile-b"
//   * argv  node iso-compliance-loop.mjs /path/one=profile-a /path/two
// A target with no "=profile" suffix falls back to the "isocheck" profile.
function parseTarget(spec) {
  const idx = spec.lastIndexOf('=');
  const root = idx === -1 ? spec : spec.slice(0, idx);
  const profile = idx === -1 ? 'isocheck' : spec.slice(idx + 1);
  return { root: path.resolve(root.trim()), profile: profile.trim() || 'isocheck' };
}

const extraSpecs = [
  ...(process.env.ISO_AUDIT_TARGETS || '')
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean),
  ...process.argv.slice(2),
];

const targets = [
  { root: path.join(__dirname), profile: 'isocheck' },
  ...extraSpecs.map(parseTarget),
];

function runAudit(root) {
  const r = spawnSync(process.execPath, [auditScript, root], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  const summary = path.join(root, 'iso-audit-summary.txt');
  const report = path.join(root, 'iso-audit-report.json');
  if (!fs.existsSync(summary)) return { ok: false, overall: 0 };
  const line = fs.readFileSync(summary, 'utf8').trim();
  const compliant = line.includes('compliant=true');
  const overall = Number((line.match(/overall=(\d+)/) || [])[1] || 0);
  if (compliant && fs.existsSync(report)) {
    const out = path.join(root, `iso-compliance-report-${new Date().toISOString().slice(0, 10)}.html`);
    spawnSync(process.execPath, [reportGen, report, out], { stdio: 'inherit' });
  }
  return { ok: compliant, overall, exit: r.status ?? 1 };
}

for (const { root, profile } of targets) {
  console.log('\n########', root, profile, '########');
  if (!fs.existsSync(root)) {
    // A configured project that isn't present on this machine is skipped
    // rather than failing the run: the loop should still succeed when every
    // target it can actually reach is compliant.
    console.warn('Skipping (not found):', root);
    continue;
  }
  for (let pass = 1; pass <= 5; pass++) {
    applyCompliancePack(root, profile);
    const result = runAudit(root);
    console.log(`Pass ${pass}: overall=${result.overall} compliant=${result.ok}`);
    if (result.ok) break;
    if (pass === 5) process.exitCode = 1;
  }
}
