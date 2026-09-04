#!/usr/bin/env node
/**
 * ISOCheck agent — Claude-driven, app-agnostic ISO compliance assessor + remediator.
 *
 * Point it at ANY project and it will:
 *   1. Profile the app (stack, purpose, whether it handles personal data / AI).
 *   2. Assess every control of every catalogued ISO standard by reading the
 *      actual file contents — judging real compliance, not just filenames.
 *   3. Write the missing/weak documentation, tailored to THIS app.
 *   4. Re-verify and loop until compliant (or --max-passes is reached).
 *
 * Usage:
 *   node iso-agent.mjs <projectRoot> [options]
 *
 * Options:
 *   --report-only        Assess and report gaps, but do not write any docs.
 *   --scan-only          Print the evidence the agent would send to Claude and
 *                        exit (no API calls — useful for a dry run without a key).
 *   --max-passes=N       Max assess→write→verify cycles (default 3).
 *   --model=ID           Model id (default claude-opus-5).
 *   --standards=a,b      Only assess standards whose id contains one of these
 *                        substrings (e.g. --standards=27001,42001).
 *   --yes                Reserved; the agent already runs unattended.
 *
 * Requires ANTHROPIC_API_KEY (or an `ant auth login` profile) unless --scan-only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { STANDARDS } from './iso-standards.mjs';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const positional = argv.filter((a) => !a.startsWith('--'));

const ROOT = path.resolve(positional[0] || '.');
const REPORT_ONLY = flag('report-only');
const SCAN_ONLY = flag('scan-only');
const MAX_PASSES = Math.max(1, Number(opt('max-passes', '3')) || 3);
const MODEL = opt('model', 'claude-opus-5');
const STANDARD_FILTER = (opt('standards', '') || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo',
  'vendor', '.venv', 'venv', '__pycache__', '.mypy_cache', 'target', 'out',
  '.idea', '.vscode', '.cache', 'tmp', '.pytest_cache',
]);

// Budgets keep the evidence corpus within a sane context size.
const MAX_LISTED_FILES = 3000;
const MAX_FILE_BYTES = 16 * 1024; // per key file
const MAX_CORPUS_BYTES = 260 * 1024; // total key-file content

// ---------------------------------------------------------------------------
// Repo scanning
// ---------------------------------------------------------------------------
function walk(dir, rel = '', out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, r, out);
    else out.push({ rel: r.replace(/\\/g, '/'), full, size: st.size });
  }
  return out;
}

// Files whose content is worth sending as evidence, highest priority first.
const KEY_PATTERNS = [
  /^readme(\.md|\.rst|\.txt)?$/i,
  /^(package\.json|pyproject\.toml|requirements\.txt|pipfile|go\.mod|cargo\.toml|composer\.json|pom\.xml|build\.gradle|gemfile|\.csproj)$/i,
  /(^|\/)(changelog|contributing|security|support|maintenance|license)/i,
  /(^|\/)docs?\//i,
  /(^|\/)specs?\//i,
  /\.md$/i,
  /(^|\/)\.github\/workflows\//i,
  /(^|\/)(\.gitlab-ci\.yml|azure-pipelines\.yml|\.circleci)/i,
  /(^|\/)(eslint|tsconfig|vitest\.config|jest\.config|playwright\.config|\.eslintrc|sonar)/i,
  /(^|\/)(dockerfile|docker-compose|\.dockerignore)/i,
];

function keyRank(rel) {
  const lower = rel.toLowerCase();
  for (let i = 0; i < KEY_PATTERNS.length; i++) {
    if (KEY_PATTERNS[i].test(lower)) return i;
  }
  return -1;
}

function isProbablyText(rel) {
  return /\.(md|rst|txt|json|ya?ml|toml|ini|cfg|js|mjs|cjs|ts|tsx|jsx|py|go|rb|rs|java|kt|cs|php|sh|sql|html|css|xml|gradle|properties|env\.example)$/i.test(
    rel
  ) || /(^|\/)(dockerfile|makefile|license|readme|contributing|changelog)/i.test(rel.toLowerCase());
}

function scan(root) {
  const files = walk(root);
  const fileList = files.map((f) => f.rel).sort();
  const hasGit = fs.existsSync(path.join(root, '.git'));

  // Rank key files, then add a sample of source files for stack/context.
  const ranked = files
    .map((f) => ({ ...f, rank: keyRank(f.rel) }))
    .filter((f) => f.rank >= 0 && isProbablyText(f.rel))
    .sort((a, b) => a.rank - b.rank || a.rel.localeCompare(b.rel));

  const corpus = [];
  let total = 0;
  for (const f of ranked) {
    if (total >= MAX_CORPUS_BYTES) break;
    let content;
    try {
      content = fs.readFileSync(f.full, 'utf8');
    } catch {
      continue;
    }
    if (content.length > MAX_FILE_BYTES) {
      content = content.slice(0, MAX_FILE_BYTES) + '\n… [truncated]';
    }
    total += content.length;
    corpus.push({ path: f.rel, content });
  }

  return { fileList, corpus, hasGit, fileCount: files.length };
}

// ---------------------------------------------------------------------------
// Evidence rendering
// ---------------------------------------------------------------------------
function renderEvidence({ fileList, corpus, hasGit, fileCount }) {
  const listed = fileList.slice(0, MAX_LISTED_FILES);
  const listNote =
    fileList.length > listed.length ? `\n… and ${fileList.length - listed.length} more files` : '';
  const corpusText = corpus
    .map((c) => `\n===== FILE: ${c.path} =====\n${c.content}`)
    .join('\n');
  return [
    `Project has ${fileCount} files. Git repository: ${hasGit ? 'yes' : 'no'}.`,
    ``,
    `FILE TREE (relative paths):`,
    listed.join('\n') + listNote,
    ``,
    `KEY FILE CONTENTS (documentation, manifests, configs, and representative source):`,
    corpusText,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Claude client + structured calls
// ---------------------------------------------------------------------------
let client = null;
async function getClient() {
  if (client) return client;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  client = new Anthropic();
  return client;
}

/**
 * Run one request that must produce a single tool call, and return its input.
 * `instruction` is the task-specific system prompt; `context` (optional) is the
 * large, stable evidence block — placed last in `system` with a cache breakpoint
 * so repeated calls within a pass are served from cache.
 */
async function toolCall({ instruction, context, user, tool, stream = false, maxTokens = 16000 }) {
  const c = await getClient();
  const system = [{ type: 'text', text: instruction }];
  if (context) system.push({ type: 'text', text: context, cache_control: { type: 'ephemeral' } });
  const req = {
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    tools: [tool],
    // tool_choice:auto keeps us model-agnostic (forced tool_choice is rejected on
    // some newer models); the prompt tells Claude to call exactly this tool.
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }],
  };
  let message;
  if (stream) {
    const s = c.messages.stream(req);
    message = await s.finalMessage();
  } else {
    message = await c.messages.create(req);
  }
  const block = message.content.find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!block) {
    const text = message.content.find((b) => b.type === 'text');
    throw new Error(
      `Model did not call ${tool.name}. stop_reason=${message.stop_reason}` +
        (text ? `\n${text.text.slice(0, 500)}` : '')
    );
  }
  return block.input;
}

// ---- Tool schemas --------------------------------------------------------
const PROFILE_TOOL = {
  name: 'record_profile',
  description: 'Record a concise, factual profile of the project under audit.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'name', 'purpose', 'languages', 'frameworks', 'handles_personal_data',
      'uses_ai', 'ai_details', 'deployment', 'docs_convention',
    ],
    properties: {
      name: { type: 'string', description: 'Project name.' },
      purpose: { type: 'string', description: 'One or two sentences: what the app does and for whom.' },
      languages: { type: 'array', items: { type: 'string' } },
      frameworks: { type: 'array', items: { type: 'string' } },
      handles_personal_data: { type: 'boolean' },
      uses_ai: { type: 'boolean' },
      ai_details: { type: 'string', description: 'If uses_ai, how (own model, third-party LLM API, none). Else "".' },
      deployment: { type: 'string', description: 'How it is run/deployed as far as evidence shows.' },
      docs_convention: { type: 'string', description: 'Where docs live and their format (e.g. "docs/ as Markdown").' },
    },
  },
};

const ASSESS_TOOL = {
  name: 'record_assessment',
  description: 'Record the compliance verdict for each control of one ISO standard.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['controls'],
    properties: {
      controls: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['check', 'status', 'rationale', 'gap', 'remediation'],
          properties: {
            check: { type: 'string', description: 'Echo the control text verbatim.' },
            status: { type: 'string', enum: ['compliant', 'partial', 'missing'] },
            rationale: { type: 'string', description: 'Why, citing concrete file paths as evidence.' },
            gap: { type: 'string', description: 'What is missing or weak (empty string if compliant).' },
            remediation: {
              type: 'object',
              additionalProperties: false,
              required: ['path', 'title', 'must_cover'],
              properties: {
                path: { type: 'string', description: 'Relative doc path to create/improve, or "" if compliant.' },
                title: { type: 'string', description: 'Document title, or "".' },
                must_cover: { type: 'array', items: { type: 'string' }, description: 'Points the doc must cover.' },
              },
            },
          },
        },
      },
    },
  },
};

const REMEDIATE_TOOL = {
  name: 'write_docs',
  description: 'Return the full contents of documentation files to create or replace.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['files'],
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'content'],
          properties: {
            path: { type: 'string', description: 'Relative path within the project.' },
            content: { type: 'string', description: 'Full Markdown content of the file.' },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
async function profileApp(evidence) {
  return toolCall({
    instruction:
      'You are an ISO compliance analyst. You will be given a software project ' +
      '(file tree + key file contents). Produce a factual profile grounded only ' +
      'in the evidence. Do not invent capabilities. Call record_profile exactly once.',
    context: evidence,
    user: 'Profile the project described in the evidence above.',
    tool: PROFILE_TOOL,
  });
}

const ASSESS_INSTRUCTION =
  'You are an ISO compliance auditor. Judge whether the project ACTUALLY ' +
  'satisfies each control by reading the real file contents in the evidence — ' +
  'not merely whether a file with a matching name exists. An empty or boilerplate ' +
  'file that does not substantively address the control is "partial" or "missing", ' +
  'not "compliant". Cite concrete paths in each rationale. For every non-compliant ' +
  'control, propose a specific remediation doc. Call record_assessment exactly ' +
  'once, with one entry per control in order.';

async function assessStandard(std, profile, evidence) {
  const controls = std.checks.map((c, i) => `${i + 1}. ${c}`).join('\n');
  return toolCall({
    instruction: ASSESS_INSTRUCTION,
    context: evidence, // identical across standards in a pass → cached
    user:
      `PROJECT PROFILE:\n${JSON.stringify(profile, null, 2)}\n\n` +
      `STANDARD: ${std.id} — ${std.title}\n\nCONTROLS:\n${controls}`,
    tool: ASSESS_TOOL,
  });
}

const REMEDIATE_INSTRUCTION =
  'You are a technical writer producing ISO compliance documentation. Write ' +
  'accurate, specific docs for THIS project using the profile and evidence — ' +
  'never generic boilerplate, never invented facts. If a target file already ' +
  'exists in the evidence, return an improved full replacement that keeps any ' +
  'correct existing content. Use Markdown. Call write_docs exactly once with ' +
  'every requested file.';

async function remediateStandard(std, profile, gaps, evidence) {
  const asks = gaps
    .map(
      (g) =>
        `- Control: ${g.check}\n  Gap: ${g.gap}\n  Target file: ${g.remediation.path}\n` +
        `  Title: ${g.remediation.title}\n  Must cover: ${(g.remediation.must_cover || []).join('; ')}`
    )
    .join('\n');
  return toolCall({
    stream: true,
    maxTokens: 32000,
    instruction: REMEDIATE_INSTRUCTION,
    context: evidence, // identical across standards in a pass → cached
    user:
      `PROJECT PROFILE:\n${JSON.stringify(profile, null, 2)}\n\n` +
      `STANDARD: ${std.id} — ${std.title}\n\nDOCS TO WRITE:\n${asks}`,
    tool: REMEDIATE_TOOL,
  });
}

// ---------------------------------------------------------------------------
// Safe file writing
// ---------------------------------------------------------------------------
function safeJoin(root, rel) {
  const dest = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (dest !== rootResolved && !dest.startsWith(rootResolved + path.sep)) {
    throw new Error(`Refusing to write outside project root: ${rel}`);
  }
  return dest;
}

function writeDoc(root, rel, content) {
  const dest = safeJoin(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const existed = fs.existsSync(dest);
  fs.writeFileSync(dest, content.endsWith('\n') ? content : content + '\n', 'utf8');
  return existed ? 'updated' : 'created';
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------
function summarize(assessments) {
  let compliant = 0;
  let partial = 0;
  let missing = 0;
  for (const a of assessments) {
    for (const c of a.controls) {
      if (c.status === 'compliant') compliant++;
      else if (c.status === 'partial') partial++;
      else missing++;
    }
  }
  const total = compliant + partial + missing;
  const score = total ? Math.round((compliant / total) * 100) : 0;
  return { compliant, partial, missing, total, score, fullyCompliant: partial === 0 && missing === 0 };
}

function writeReports(root, assessments, profile, summary) {
  const json = { root, at: new Date().toISOString(), model: MODEL, profile, summary, assessments };
  fs.writeFileSync(path.join(root, 'iso-compliance-report.json'), JSON.stringify(json, null, 2));

  const lines = [
    `# ISO compliance report`,
    ``,
    `**Project:** ${profile.name} — ${profile.purpose}`,
    `**Assessed:** ${json.at}`,
    `**Overall:** ${summary.score}/100 (${summary.compliant} compliant, ${summary.partial} partial, ${summary.missing} missing of ${summary.total})`,
    ``,
  ];
  for (const a of assessments) {
    const s = a.controls;
    const ok = s.filter((c) => c.status === 'compliant').length;
    lines.push(`## ${a.id} — ${a.title}  (${ok}/${s.length})`);
    for (const c of s) {
      const mark = c.status === 'compliant' ? '✅' : c.status === 'partial' ? '🟡' : '❌';
      lines.push(`- ${mark} **${c.check}** — ${c.rationale}`);
      if (c.status !== 'compliant' && c.remediation && c.remediation.path) {
        lines.push(`  - → \`${c.remediation.path}\`: ${c.gap}`);
      }
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(root, 'ISO_COMPLIANCE_REPORT.md'), lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(ROOT)) {
    console.error('Project root not found:', ROOT);
    process.exit(2);
  }

  const standards = STANDARD_FILTER.length
    ? STANDARDS.filter((s) => STANDARD_FILTER.some((f) => s.id.toLowerCase().includes(f)))
    : STANDARDS;
  if (!standards.length) {
    console.error('No standards matched --standards filter.');
    process.exit(2);
  }

  console.log(`ISOCheck agent → ${ROOT}`);
  console.log(`Scanning…`);
  const scanned = scan(ROOT);
  const evidence = renderEvidence(scanned);
  console.log(`  ${scanned.fileCount} files, ${scanned.corpus.length} key files read as evidence.`);

  if (SCAN_ONLY) {
    console.log('\n--- EVIDENCE (scan-only) ---\n');
    console.log(evidence.slice(0, 8000));
    console.log(`\n[evidence is ${evidence.length} chars; truncated preview above]`);
    console.log(`\nStandards that would be assessed: ${standards.length}`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log(
      '  note: no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in the environment;\n' +
        '        relying on an `ant auth login` profile. (Use --scan-only for a no-key preview.)'
    );
  }

  console.log(`Profiling app with ${MODEL}…`);
  const profile = await profileApp(evidence);
  console.log(`  ${profile.name}: ${profile.purpose}`);
  console.log(`  stack: ${[...profile.languages, ...profile.frameworks].join(', ') || 'n/a'}`);
  console.log(`  personal data: ${profile.handles_personal_data}  |  AI: ${profile.uses_ai}`);

  let assessments = [];
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    console.log(`\n===== PASS ${pass}/${MAX_PASSES} =====`);
    const passEvidence = renderEvidence(scan(ROOT)); // re-scan so new docs count
    assessments = [];
    for (const std of standards) {
      process.stdout.write(`  assessing ${std.id}… `);
      const { controls } = await assessStandard(std, profile, passEvidence);
      assessments.push({ id: std.id, title: std.title, controls });
      const ok = controls.filter((c) => c.status === 'compliant').length;
      console.log(`${ok}/${controls.length} compliant`);
    }

    const summary = summarize(assessments);
    console.log(`  → overall ${summary.score}/100 (${summary.partial} partial, ${summary.missing} missing)`);

    if (summary.fullyCompliant || REPORT_ONLY) break;
    if (pass === MAX_PASSES) break;

    // Remediate: write docs for every standard that has gaps.
    for (let i = 0; i < standards.length; i++) {
      const std = standards[i];
      const gaps = assessments[i].controls.filter(
        (c) => c.status !== 'compliant' && c.remediation && c.remediation.path
      );
      if (!gaps.length) continue;
      process.stdout.write(`  writing ${gaps.length} doc(s) for ${std.id}… `);
      const { files } = await remediateStandard(std, profile, gaps, passEvidence);
      const results = files.map((f) => `${writeDoc(ROOT, f.path, f.content)} ${f.path}`);
      console.log(results.join(', '));
    }
  }

  const summary = summarize(assessments);
  writeReports(ROOT, assessments, profile, summary);

  console.log(`\n=====================================`);
  console.log(`Overall: ${summary.score}/100 — ${summary.compliant} compliant, ${summary.partial} partial, ${summary.missing} missing`);
  console.log(`Reports: iso-compliance-report.json, ISO_COMPLIANCE_REPORT.md`);
  if (summary.fullyCompliant) {
    console.log(`Result: fully compliant ✅`);
    process.exit(0);
  } else {
    console.log(`Result: ${REPORT_ONLY ? 'report only — no docs written' : 'gaps remain (raise --max-passes or review manually)'}`);
    process.exit(1);
  }
}

// Exported for unit testing; only run the CLI when invoked directly.
export { scan, renderEvidence, safeJoin, writeDoc, summarize, writeReports };

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error('\nAgent error:', e.message);
    process.exit(2);
  });
}
