#!/usr/bin/env node
/**
 * Deterministic ISO artefact audit (mirrors ISOCheck STANDARDS checks).
 * Usage: node iso-local-audit.mjs <projectRoot> [--apply] [--min-score=100]
 */
import fs from 'fs';
import path from 'path';
import { STANDARDS } from './iso-standards.mjs';

const root = path.resolve(process.argv[2] || '.');
const apply = process.argv.includes('--apply');
const minScore = Number((process.argv.find((a) => a.startsWith('--min-score=')) || '--min-score=100').split('=')[1]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo']);

// STANDARDS catalogue is shared with the Claude-driven agent (iso-standards.mjs).

function walk(dir, rel = '', out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, r, out);
    else out.push({ rel: r.replace(/\\/g, '/'), lower: r.toLowerCase(), full });
  }
  return out;
}

const files = walk(root);
const rels = files.map((f) => f.rel.toLowerCase());
const has = (re) => rels.some((r) => re.test(r));
const hasGit = fs.existsSync(path.join(root, '.git'));

function evaluateCheck(text) {
  const t = text.toLowerCase();
  if (t.includes('requirements documentation')) {
    return (has(/requirements\.md|specs\//) && has(/readme/i)) ? 'pass' : has(/requirements|readme|specs/) ? 'warn' : 'fail';
  }
  if (t.includes('design documents') || t.includes('architecture')) {
    return has(/architecture\.md|docs\/(add|design)/) ? 'pass' : has(/architecture|design/) ? 'warn' : 'fail';
  }
  if (t.includes('change management')) {
    return has(/changelog/i) && hasGit ? 'pass' : has(/changelog/i) ? 'warn' : 'fail';
  }
  if (t.includes('maintenance and support')) {
    return has(/maintenance\.md/) && has(/support\.md/) ? 'pass' : has(/maintenance|support/) ? 'warn' : 'fail';
  }
  if (t.includes('software development plan') || t.includes('project plan')) {
    return has(/software_development_plan|development_plan|project-plan/i) ? 'pass' : has(/plan\.md/) ? 'warn' : 'fail';
  }
  if (t.includes('system requirements specification')) return has(/docs\/srs|srs\.md|requirements\.md/) ? 'pass' : 'fail';
  if (t.includes('architecture definition')) return has(/docs\/add|architecture\.md/) ? 'pass' : 'fail';
  if (t.includes('system integration plan')) return has(/integration_plan|integration\.md|\.gitlab-ci|\.github\/workflows/) ? 'pass' : 'fail';
  if (t.includes('stakeholder needs')) return has(/stakeholder|conops/i) ? 'pass' : 'fail';
  if (t.includes('deployment and operations')) return has(/deployment|operations|readme\.md/) ? 'pass' : 'fail';
  if (t.includes('data management documentation')) return has(/data_management|data-management|data-quality|25012|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('model development documentation')) return has(/model_development|model.card|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('training and validation')) return has(/validation_plan|training_procedure|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('ai system integration')) return has(/integration_architecture|docs\/ai|architecture\.md/) ? 'pass' : 'fail';
  if (t.includes('monitoring and drift')) return has(/monitoring_plan|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('test plan document')) return has(/test_plan|docs\/testing/) ? 'pass' : 'fail';
  if (t.includes('test management process')) return has(/test_plan|test_spec|docs\/testing/) ? 'pass' : 'fail';
  if (t.includes('test design process')) return has(/test_plan|test_spec|test-design|test_design|docs\/testing/) ? 'pass' : 'fail';
  if (t.includes('test execution records') || t.includes('ci configuration')) {
    return has(/\.gitlab-ci|\.github\/workflows|ci\.yml/) ? 'pass' : has(/test/) ? 'warn' : 'fail';
  }
  if (t.includes('test completion criteria')) return has(/test_plan|test_spec/) ? 'pass' : 'fail';
  if (t.includes('test cases') || t.includes('test scripts')) {
    return has(/\.test\.|\.spec\.|\/test\//) ? 'pass' : 'fail';
  }
  if (t.includes('test execution logs')) return has(/test-summary|test-results|ci\.yml|\.gitlab-ci/) ? 'pass' : 'fail';
  if (t.includes('defect') || t.includes('issue tracking')) return has(/contributing|support\.md|issues/) ? 'pass' : 'fail';
  if (t.includes('test summary reports')) return has(/test-summary|test_spec|test_plan/) ? 'pass' : 'fail';
  if (t.includes('test coverage')) return has(/coverage|vitest\.config|jest\.config/) ? 'pass' : 'fail';
  if (t.includes('boundary value') || t.includes('equivalence')) return has(/test_plan|test_spec|bva/i) ? 'pass' : 'fail';
  if (t.includes('unit tests')) return has(/\.test\.|vitest|jest/) ? 'pass' : 'fail';
  if (t.includes('integration tests')) return has(/integration\.test|integration\/|penetration|server\/src\/test/) ? 'pass' : has(/\.test\./) ? 'pass' : 'fail';
  if (t.includes('end-to-end') || t.includes('system or end')) return has(/playwright|e2e/) ? 'pass' : 'fail';
  if (t.includes('test design rationale')) return has(/test_plan|test_spec|test_design|bva/) ? 'pass' : 'fail';
  if (t.includes('security controls') || t.includes('security scanning')) {
    return has(/security|eslint|penetration/) ? 'pass' : 'fail';
  }
  if (t.includes('performance benchmarks')) return has(/performance|benchmark|load.test/) ? 'pass' : 'fail';
  if (t.includes('reliability testing')) return has(/reliability|fault|recovery|health/) ? 'pass' : 'fail';
  if (t.includes('maintainability measures')) return has(/eslint|lint/) ? 'pass' : 'fail';
  if (t.includes('compatibility documentation')) return has(/compatibility|readme/i) ? 'pass' : 'fail';
  if (t.includes('data validation') || t.includes('schema definitions')) {
    return has(/zod|schema|validation|data_validation/) ? 'pass' : 'fail';
  }
  if (t.includes('data accuracy') || t.includes('data completeness') || t.includes('data consistency')) {
    return has(/data_quality|25012|zod/) ? 'pass' : 'fail';
  }
  if (t.includes('data lineage')) return has(/data_quality|lineage|provenance/) ? 'pass' : 'fail';
  if (t.includes('model accuracy') || t.includes('explainability') || t.includes('adaptability') || t.includes('autonomous') || t.includes('ai safety')) {
    return has(/docs\/ai|25059|ai_quality|ai_inference/) ? 'pass' : 'fail';
  }
  if (t.includes('static analysis')) return has(/eslint|sonar|pylint/) ? 'pass' : 'fail';
  if (t.includes('security weakness scanning')) return has(/penetration|security|audit/) ? 'pass' : 'fail';
  if (t.includes('performance anti-pattern')) return has(/eslint|ci\.yml|\.gitlab-ci/) ? 'pass' : 'fail';
  if (t.includes('maintainability index')) return has(/eslint|quality/) ? 'pass' : 'fail';
  if (t.includes('automated quality gates')) return has(/\.gitlab-ci|\.github\/workflows/) ? 'pass' : 'fail';
  if (t.includes('ai governance')) return has(/aims|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('ai risk assessment')) return has(/risk_register|23894|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('ai impact assessment')) return has(/impact|42005|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('third-party ai tool')) return has(/third.party|tool.inventory|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('ai monitoring and audit')) return has(/monitoring_plan|audit/) ? 'pass' : 'fail';
  if (t.includes('ai-specific risk register')) return has(/risk_register/) ? 'pass' : 'fail';
  if (t.includes('bias and fairness')) return has(/bias|fairness|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('privacy risk assessment for ai')) return has(/privacy|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('safety risk documentation')) return has(/safety|risk_register/) ? 'pass' : 'fail';
  if (t.includes('risk monitoring and review')) return has(/risk_register|review/) ? 'pass' : 'fail';
  if (t.includes('model robustness') || t.includes('adversarial')) return has(/penetration|robust|adversarial/) ? 'pass' : has(/docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('transparency documentation') || t.includes('model cards')) return has(/model.card|transparency|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('fairness metrics')) return has(/fairness|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('privacy protection measures for ai')) return has(/privacy|docs\/ai/) ? 'pass' : 'fail';
  if (t.includes('societal impact') || t.includes('individual rights') || t.includes('foreseeable misuse') || t.includes('lifecycle impact monitoring') || t.includes('transparency and accountability')) {
    return has(/impact|42005|docs\/ai/) ? 'pass' : 'fail';
  }
  if (t.includes('security policy')) return has(/security|isms/i) ? 'pass' : 'fail';
  if (t.includes('access control')) return has(/access|auth|security/) ? 'pass' : 'fail';
  if (t.includes('incident response')) return has(/incident|security/) ? 'pass' : 'fail';
  if (t.includes('vulnerability management')) return has(/vulnerability|dependabot|audit|npm audit/) ? 'pass' : 'fail';
  if (t.includes('supplier') || t.includes('third-party security')) return has(/supplier|third.party|security/) ? 'pass' : 'fail';
  if (t.includes('risk identification and register')) return has(/risk_register/) ? 'pass' : 'fail';
  if (t.includes('risk analysis methodology')) return has(/risk_register|27005/) ? 'pass' : 'fail';
  if (t.includes('risk treatment plan')) return has(/risk_register|treatment/) ? 'pass' : 'fail';
  if (t.includes('residual risk')) return has(/risk_register|residual/) ? 'pass' : 'fail';
  if (t.includes('risk communication')) return has(/risk_register|review/) ? 'pass' : 'fail';
  if (t.includes('privacy policy') || t.includes('data protection documentation')) return has(/privacy|gdpr|31700/) ? 'pass' : 'fail';
  if (t.includes('data minimisation')) return has(/privacy|minimisation/) ? 'pass' : 'fail';
  if (t.includes('user consent')) return has(/consent|privacy/) ? 'pass' : 'fail';
  if (t.includes('data retention')) return has(/retention|privacy/) ? 'pass' : 'fail';
  if (t.includes('gdpr')) return has(/gdpr|privacy|31700/) ? 'pass' : 'fail';
  if (t.includes('stakeholder requirements')) return has(/stakeholder/) ? 'pass' : 'fail';
  if (t.includes('system requirements specification')) return has(/docs\/srs|srs\.md/) ? 'pass' : 'fail';
  if (t.includes('software requirements specification')) return has(/requirements\.md|docs\/srs/) ? 'pass' : 'fail';
  if (t.includes('requirements traceability')) return has(/traceability|29148/) ? 'pass' : 'fail';
  if (t.includes('requirements validation')) return has(/validation|test_plan|29148/) ? 'pass' : 'fail';
  if (t.includes('quality policy')) return has(/qms|quality/) ? 'pass' : 'fail';
  if (t.includes('process documentation')) return has(/docs\/|procedures|qms/) ? 'pass' : 'fail';
  if (t.includes('performance monitoring metrics')) return has(/metrics|monitoring|ci\.yml/) ? 'pass' : 'fail';
  if (t.includes('continual improvement')) return has(/changelog|retrospective|improvement/) ? 'pass' : 'fail';
  if (t.includes('customer') || t.includes('user feedback')) return has(/support\.md|feedback/) ? 'pass' : 'fail';
  return 'fail';
}

function scoreStatus(s) {
  if (s === 'pass') return 10;
  if (s === 'warn') return 5;
  return 0;
}

async function main() {
  if (!fs.existsSync(root)) {
    console.error('Project root not found:', root);
    process.exit(2);
  }

  if (apply) {
    const { applyCompliancePack } = await import('./iso-compliance-pack.mjs');
    const profileArg = process.argv.find((a) => a.startsWith('--profile='));
    const profile = profileArg ? profileArg.split('=')[1] : process.argv.includes('--eu-pay') ? 'eu-pay' : 'isocheck';
    applyCompliancePack(root, profile);
    console.log('Applied compliance documentation pack to', root);
  }

  const results = [];
  let totalPass = 0;
  let totalWarn = 0;
  let totalFail = 0;

  for (const std of STANDARDS) {
    const findings = std.checks.map((c) => {
      const status = evaluateCheck(c);
      if (status === 'pass') totalPass++;
      else if (status === 'warn') totalWarn++;
      else totalFail++;
      return { check: c, status };
    });
    const pts = findings.reduce((a, f) => a + scoreStatus(f.status), 0);
    const score = Math.round((pts / (findings.length * 10)) * 100);
    results.push({ id: std.id, score, findings });
  }

  const overall = Math.round(results.reduce((a, r) => a + r.score, 0) / results.length);
  const reportPath = path.join(root, 'iso-audit-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ root, overall, totalPass, totalWarn, totalFail, results, at: new Date().toISOString() }, null, 2)
  );
  const summaryPath = path.join(root, 'iso-audit-summary.txt');
  fs.writeFileSync(
    summaryPath,
    `overall=${overall} pass=${totalPass} warn=${totalWarn} fail=${totalFail} compliant=${overall >= minScore && totalFail === 0 && totalWarn === 0}\n`,
    'utf8'
  );

  console.log(`\nISO local audit: ${root}`);
  console.log(`Overall: ${overall}/100  pass=${totalPass} warn=${totalWarn} fail=${totalFail}`);
  for (const r of results.filter((x) => x.score < 100)) {
    console.log(`  ${r.score}/100  ${r.id}`);
    r.findings.filter((f) => f.status !== 'pass').forEach((f) => console.log(`    [${f.status}] ${f.check}`));
  }

  if (overall < minScore || totalFail > 0 || totalWarn > 0) {
    console.log(`\nNot fully compliant (need score >= ${minScore}, fail=0, warn=0). Run with --apply and re-audit.`);
    process.exit(1);
  }
  console.log('\nFully compliant (all checks pass).');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
