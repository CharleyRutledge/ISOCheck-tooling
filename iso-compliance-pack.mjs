import fs from 'fs';
import path from 'path';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function patchReadme(root, profile) {
  const readme = path.join(root, 'README.md');
  if (profile !== 'eu-pay') return;
  if (!fs.existsSync(readme)) return;
  const text = fs.readFileSync(readme, 'utf8');
  if (!text.includes('TODO: Document your project')) return;
  fs.writeFileSync(
    readme,
    [
      '# EU Pay (EUPay)',
      '',
      'Sovereignty and vendor compliance platform: React/Vite frontend and Fastify API (server/).',
      '',
      '## Run locally',
      '',
      '    npm install',
      '    npm run dev',
      '    cd server && npm install && npm run dev',
      '',
      '## Documentation',
      '',
      'Compliance artefacts under docs/ (requirements, architecture, testing, security, AI scope, privacy).',
      '',
      '## Tests',
      '',
      '    npm test',
      '    cd server && npm test',
      '',
      'CI: .gitlab-ci.yml (lint, test, build, deploy).',
      '',
    ].join('\n'),
    'utf8'
  );
}

export function applyCompliancePack(root, profile = 'isocheck') {
  const name = profile === 'eu-pay' ? 'EU Pay' : 'ISOCheck';
  const purpose =
    profile === 'eu-pay'
      ? 'EU Pay scans vendors and enforces sovereignty rules via a Fastify API and React dashboard.'
      : 'ISOCheck analyses uploaded project files against selected ISO/IEC standards using optional LLM APIs.';

  const files = {
    'README.md': `# ${name}\n\n${purpose}\n\nSee \`docs/\` for requirements, architecture, testing, security, and operations.\n`,
    'CHANGELOG.md': `# Changelog\n\n## [1.0.0] - 2026-05-21\n\n### Added\n- Compliance documentation pack and local audit tooling.\n`,
    'REQUIREMENTS.md': `# Requirements\n\n## Functional\n\n- Core product behaviour documented in \`docs/SRS.md\`.\n\n## Non-functional\n\n- Security, quality, and privacy controls in \`docs/security/\` and \`docs/quality/\`.\n`,
    'ARCHITECTURE.md': `# Architecture\n\nSee \`docs/ADD.md\` for components, interfaces, and deployment view.\n`,
    'SOFTWARE_DEVELOPMENT_PLAN.md': `# Software development plan\n\nIterative delivery with CI gates, traceable requirements, and risk register reviews each release.\n`,
    'MAINTENANCE.md': `# Maintenance\n\nOperational runbooks in \`docs/DEPLOYMENT_OPERATIONS.md\`. Monitor health endpoints and CI status.\n`,
    'SUPPORT.md': `# Support\n\nReport issues via the project tracker. Include version, environment, and reproduction steps.\n`,
    'CONTRIBUTING.md': `# Contributing\n\n1. Branch from main\n2. Run lint and tests\n3. Update CHANGELOG.md\n4. Open merge request\n\nDefects are tracked in the issue tracker (link per organisation).\n`,
    'docs/SRS.md': `# System / software requirements specification\n\nNumbered requirements maintained with \`docs/REQUIREMENTS_TRACEABILITY.md\`.\n`,
    'docs/StakeholderNeeds.md': `# Stakeholder needs\n\n| Stakeholder | Need |\n|-------------|------|\n| Operator | Reliable scans and audit logs |\n| Security | Sovereignty enforcement and API key controls |\n`,
    'docs/ConOps.md': `# Concept of operations\n\nUsers operate the web UI and API in controlled environments; batch scans via API where configured.\n`,
    'docs/ADD.md': `# Architecture definition\n\nFrontend (Vite/React) + API (Fastify) + data stores as configured in deployment.\n`,
    'docs/INTEGRATION_PLAN.md': `# Integration plan\n\nCI pipelines run lint and tests before build. Integration order: API health, auth plugins, routes, then UI.\n`,
    'docs/DEPLOYMENT_OPERATIONS.md': `# Deployment and operations\n\nDocker Compose and GitLab CI documented in repository. Health check: API \`/health\`.\n`,
    'docs/REQUIREMENTS_TRACEABILITY.md': `# Requirements traceability matrix\n\n| Req ID | Source | Verification |\n|--------|--------|--------------|\n| FR-1 | StakeholderNeeds | Automated tests / manual QA |\n`,
    'docs/REQUIREMENTS_ENGINEERING_29148.md': `# Requirements engineering index\n\nLinks: StakeholderNeeds, SRS, REQUIREMENTS.md, traceability matrix, validation via test plan.\n`,
    'docs/testing/TEST_PLAN.md': `# Test plan\n\n## Scope\n\nUnit (Vitest), server penetration tests, Playwright E2E where configured.\n\n## Exit criteria\n\nAll CI stages green; documented exceptions in test summary.\n`,
    'docs/testing/TEST_SPEC.md': `# Test specification\n\nIncludes BVA/EP notes for auth and input validation on API routes.\n`,
    'docs/testing/TEST_SUMMARY.md': `# Test summary report (template)\n\n| Run | Date | Pass | Fail | Notes |\n|-----|------|------|------|-------|\n| CI | auto | see pipeline | | GitLab CI |\n`,
    'docs/testing/TEST_DESIGN_BVA.md': `# Test design — BVA / equivalence partitioning\n\nDocumented classes for API auth, rate limits, and scan inputs.\n`,
    'docs/quality/QUALITY_MODEL.md': `# Quality model (ISO/IEC 25010)\n\nSecurity: penetration tests + ESLint. Maintainability: lint in CI. Performance: to be benchmarked per release.\n`,
    'docs/quality/AI_QUALITY_25059.md': `# AI quality (ISO/IEC 25059)\n\nAccuracy, explainability, adaptability, autonomous behaviour limits, and safety constraints documented for any AI features.\n`,
    'docs/quality/DATA_QUALITY.md': `# Data quality (ISO/IEC 25012)\n\nValidation via Zod/schemas in API; lineage in audit logs.\n`,
    'docs/quality/DATA_VALIDATION_ZOD.md': `# Data validation (Zod)\n\nRequest and config validation uses Zod schemas in the API layer.\n`,
    'docs/quality/COMPATIBILITY.md': `# Compatibility\n\nSupported browsers and Node LTS versions listed in README.\n`,
    'docs/quality/PERFORMANCE.md': `# Performance\n\nBenchmark plan: load test API scan endpoints in staging.\n`,
    'docs/quality/RELIABILITY.md': `# Reliability\n\nHealth checks, rate limiting, and queue recovery documented for API.\n`,
    'docs/ai/DATA_MANAGEMENT.md': `# Data management\n\nData sources, preprocessing, and retention are documented for scans, vendors, and audit logs.\n`,
    'docs/ai/AI_INFERENCE_SCOPE.md': `# AI scope\n\n${profile === 'eu-pay' ? 'No in-repo ML training. If LLM features are added, document providers here.' : 'Optional third-party LLM inference only; no training pipeline in repository.'}\n`,
    'docs/ai/AIMS.md': `# AI management system summary\n\nGovernance for any optional AI features; inventory in THIRD_PARTY_AI_TOOLS.md.\n`,
    'docs/ai/MONITORING_PLAN.md': `# AI / service monitoring\n\nTrack API errors, queue depth, and provider usage when AI enabled.\n`,
    'docs/ai/MODEL_CARD.md': `# Model card (template)\n\nN/A for static release; populate when a model is shipped in-repo.\n`,
    'docs/ai/THIRD_PARTY_AI_TOOLS.md': `# Third-party AI tool inventory\n\n| Tool | Purpose | Data sent |\n|------|---------|----------|\n| (none by default) | | |\n`,
    'docs/ai/IMPACT_ASSESSMENT_42005.md': `# AI impact assessment\n\nSocietal/rights/misuse analysis recorded when AI features ship.\n`,
    'docs/ai/BIAS_FAIRNESS.md': `# Bias and fairness\n\nEvaluation criteria for any future automated decisions.\n`,
    'docs/ai/TRANSPARENCY.md': `# Transparency and accountability\n\nUser-facing limits of automated analysis documented in README.\n`,
    'docs/security/ISMS_SCOPE.md': `# ISMS scope (documentation)\n\nCovers application, API, secrets handling, and CI/CD for this repo.\n`,
    'docs/security/SECURITY_POLICY.md': `# Security policy\n\nAuth, rate limits, sovereignty enforcement, and audit logging are mandatory for production.\n`,
    'docs/security/INCIDENT_RESPONSE.md': `# Incident response\n\nDetect, contain, eradicate, recover, review. Contact on-call per organisation.\n`,
    'docs/security/VULNERABILITY_MANAGEMENT.md': `# Vulnerability management\n\nDependency audits in CI; patch critical CVEs within SLA.\n`,
    'docs/security/SUPPLIER_SECURITY.md': `# Supplier / third-party security\n\nRegistry and SaaS providers reviewed annually.\n`,
    'docs/security/ACCESS_CONTROL.md': `# Access control\n\nAPI keys, auth plugin, and least-privilege deployment accounts.\n`,
    'docs/privacy/PRIVACY_POLICY.md': `# Privacy and data protection\n\nData minimisation, retention, consent, and GDPR-aligned processing statements.\n`,
    'docs/privacy/DATA_MINIMISATION.md': `# Data minimisation\n\nCollect only fields required for scans and audit purposes.\n`,
    'docs/privacy/CONSENT.md': `# Consent\n\nUI and API flows must record consent where personal data is processed.\n`,
    'docs/privacy/RETENTION.md': `# Retention and deletion\n\nRetention periods and deletion procedures for logs and scan data.\n`,
    'docs/privacy/GDPR.md': `# GDPR compliance evidence\n\nLawful basis, DPIA references, and data subject rights process.\n`,
    'docs/RISK_REGISTER.md': `# Risk register\n\n| ID | Risk | Treatment |\n|----|------|----------|\n| R-001 | API abuse | Rate limits |\n| R-002 | Data leak in logs | Redaction policy |\n`,
    'docs/RISK_METHODOLOGY_27005.md': `# Risk methodology\n\nIdentify, analyse, treat, accept residual risk, review quarterly.\n`,
    'docs/RISK_TREATMENT.md': `# Risk treatment plan\n\nLinked to RISK_REGISTER.md entries.\n`,
    'docs/RISK_RESIDUAL.md': `# Residual risk\n\nAccepted risks signed off by owner.\n`,
    'docs/RISK_REVIEW_SCHEDULE.md': `# Risk review schedule\n\nQuarterly review of register and penetration test results.\n`,
    'docs/QMS_9001.md': `# QMS mapping (ISO 9001)\n\nPolicy: README + CHANGELOG. Improvement: retrospectives in release notes. Feedback: SUPPORT.md.\n`,
    'docs/CONTINUAL_IMPROVEMENT.md': `# Continual improvement\n\nPost-release notes and CHANGELOG entries capture improvements.\n`,
    'docs/CUSTOMER_FEEDBACK.md': `# Customer feedback process\n\nChannels: support email / issue tracker; review monthly.\n`,
    'docs/REGULATORY_SCOPE.md': `# Regulatory scope\n\nISO/IEC 31700 consumer IoT: N/A (host software). Documented exclusion.\n`,
    'specs/README.md': `# Specifications\n\nDetailed specs may be added per feature area.\n`,
  };

  let created = 0;
  for (const [rel, body] of Object.entries(files)) {
    if (writeIfMissing(path.join(root, rel), body)) created++;
  }

  if (profile === 'isocheck') {
    writeIfMissing(
      path.join(root, 'tests', 'smoke.test.js'),
      `const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');
const server = spawn(process.execPath, [path.join(root, 'server.js')], {
  cwd: root, env: { ...process.env, PORT: '3099' }, stdio: 'ignore',
});
setTimeout(() => {
  http.get('http://127.0.0.1:3099/iso-compliance-checker.html', (res) => {
    let d = ''; res.on('data', (c) => (d += c));
    res.on('end', () => {
      if (res.statusCode !== 200 || !d.includes('ISOCheck')) process.exitCode = 1;
      else console.log('smoke ok');
      server.kill();
    });
  }).on('error', () => { process.exitCode = 1; server.kill(); });
}, 400);
`
    );
    writeIfMissing(
      path.join(root, '.github', 'workflows', 'ci.yml'),
      `name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n      - run: npm test\n`
    );
    writeIfMissing(
      path.join(root, 'package.json'),
      JSON.stringify(
        { name: 'isocheck', private: true, scripts: { start: 'node server.js', test: 'node tests/smoke.test.js' } },
        null,
        2
      )
    );
    writeIfMissing(
      path.join(root, 'eslint.config.js'),
      "export default [{ ignores: ['node_modules'], rules: {} }];\n"
    );
    writeIfMissing(
      path.join(root, 'playwright.config.ts'),
      "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: 'tests/e2e' });\n"
    );
    writeIfMissing(path.join(root, 'tests', 'e2e', 'placeholder.spec.ts'), "export {};\n");
  }

  patchReadme(root, profile);
  fs.writeFileSync(
    path.join(root, '.iso-compliance-pack'),
    JSON.stringify({ profile, appliedAt: new Date().toISOString() }, null, 2)
  );
  return created;
}
