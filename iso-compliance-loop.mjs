#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyCompliancePack } from './iso-compliance-pack.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditScript = path.join(__dirname, 'iso-local-audit.mjs');
const reportGen = path.join(__dirname, 'generate-report-from-audit.mjs');

const targets = [
  { root: path.join(__dirname), profile: 'isocheck' },
  { root: 'C:\\Users\\amkei\\Repos\\eu-pay', profile: 'eu-pay' },
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
    console.error('Missing', root);
    process.exitCode = 2;
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
