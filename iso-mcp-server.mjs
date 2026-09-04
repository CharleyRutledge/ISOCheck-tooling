#!/usr/bin/env node
/**
 * ISOCheck MCP server — exposes the compliance agent as Model Context Protocol
 * tools, so any MCP client (Claude Desktop, Cursor, VS Code, …) can assess a
 * project and generate compliance docs from inside the editor.
 *
 * Tools:
 *   list_standards      — the catalogued ISO/IEC standards and their controls.
 *   scan_project        — file inventory + evidence preview (no API key).
 *   audit_project       — deterministic artefact audit / score (no API key).
 *   assess_project      — Claude-driven gap assessment, writes no docs (needs key).
 *   remediate_project   — full assess → write docs → re-verify (needs key).
 *
 * Run over stdio:  node iso-mcp-server.mjs
 * assess_project / remediate_project need ANTHROPIC_API_KEY in the server env.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { STANDARDS } from './iso-standards.mjs';
import { scan, renderEvidence, runAgent } from './iso-agent.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const text = (obj) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
});
const fail = (msg) => ({ content: [{ type: 'text', text: `Error: ${msg}` }], isError: true });

// Wrap a handler so any throw becomes a clean MCP error result, not a crash.
const guard = (fn) => async (args, extra) => {
  try {
    return await fn(args, extra);
  } catch (e) {
    return fail(e && e.message ? e.message : String(e));
  }
};

function selectStandards(filter) {
  if (!filter || !filter.length) return STANDARDS;
  const f = filter.map((s) => s.toLowerCase());
  const picked = STANDARDS.filter((s) => f.some((x) => s.id.toLowerCase().includes(x)));
  if (!picked.length) throw new Error(`No catalogued standard matches: ${filter.join(', ')}`);
  return picked;
}

// Confine every path argument to an allowlist so a client (or a prompt-injected
// AI driving one) cannot point the server at ~/.ssh, /etc, or anywhere else on
// the host. Allowed roots come from ISO_MCP_ALLOWED_ROOTS (path-separator or
// comma separated); if unset, the server's own working directory is the only
// allowed root — a safe default that an operator widens deliberately.
function allowedRoots() {
  const raw = process.env.ISO_MCP_ALLOWED_ROOTS;
  const list = raw ? raw.split(/[:;,]/).map((s) => s.trim()).filter(Boolean) : [process.cwd()];
  return list.map((r) => path.resolve(r));
}

function requireDir(p) {
  const root = path.resolve(p);
  const roots = allowedRoots();
  const inside = roots.some((base) => root === base || root.startsWith(base + path.sep));
  if (!inside) {
    throw new Error(
      `Path is outside the allowed roots (${roots.join(', ')}). ` +
        `Set ISO_MCP_ALLOWED_ROOTS to permit it.`
    );
  }
  if (!fs.existsSync(root)) throw new Error(`Path not found: ${root}`);
  if (!fs.statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);
  return root;
}

export function createServer() {
  const server = new McpServer({ name: 'isocheck', version: '0.1.0' });

  server.registerTool(
    'list_standards',
    {
      title: 'List ISO standards',
      description: 'List the catalogued ISO/IEC standards and their controls.',
      inputSchema: {},
    },
    guard(async () => text(STANDARDS.map((s) => ({ id: s.id, title: s.title, controls: s.checks }))))
  );

  server.registerTool(
    'scan_project',
    {
      title: 'Scan a project',
      description:
        'Scan a project directory into a compliance evidence corpus (file tree + key ' +
        'file contents). No API key required. Returns counts and a preview.',
      inputSchema: { path: z.string().describe('Path to the project directory') },
    },
    guard(async ({ path: p }) => {
      const root = requireDir(p);
      const s = scan(root);
      const evidence = renderEvidence(s);
      return text({
        root,
        fileCount: s.fileCount,
        keyFilesRead: s.corpus.length,
        evidenceChars: evidence.length,
        preview: evidence.slice(0, 4000),
      });
    })
  );

  server.registerTool(
    'audit_project',
    {
      title: 'Deterministic audit',
      description:
        'Run the deterministic artefact audit (checks expected documentation files ' +
        'exist). No API key required. Returns the score and per-standard findings.',
      inputSchema: { path: z.string().describe('Path to the project directory') },
    },
    guard(async ({ path: p }) => {
      const root = requireDir(p);
      const r = spawnSync(process.execPath, [path.join(here, 'iso-local-audit.mjs'), root], {
        encoding: 'utf8',
      });
      const reportPath = path.join(root, 'iso-audit-report.json');
      let report = null;
      if (fs.existsSync(reportPath)) report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      return text({
        exitCode: r.status,
        summary: report ? { overall: report.overall, pass: report.totalPass, warn: report.totalWarn, fail: report.totalFail } : null,
        stdout: (r.stdout || '').trim(),
      });
    })
  );

  const assessInput = {
    path: z.string().describe('Path to the project directory'),
    standards: z.array(z.string()).optional().describe('Only assess standards whose id contains one of these (e.g. ["27001","42001"])'),
    maxPasses: z.number().int().min(1).max(5).optional().describe('Max assess→write→verify passes (default 3)'),
  };

  server.registerTool(
    'assess_project',
    {
      title: 'Assess compliance (Claude)',
      description:
        'Claude reads the project and judges each control against real file content, ' +
        'returning a gap report. Writes NO documents. Requires ANTHROPIC_API_KEY in ' +
        'the server environment. This is a self-assessment of documentation coverage — ' +
        'not an audit or ISO certification.',
      inputSchema: assessInput,
    },
    guard(async ({ path: p, standards, maxPasses }) => {
      const root = requireDir(p);
      if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
        return fail('ANTHROPIC_API_KEY is not set in the server environment.');
      }
      const { summary, assessments, profile } = await runAgent({
        root,
        standards: selectStandards(standards),
        reportOnly: true,
        maxPasses: maxPasses || 3,
        log: () => {}, // never write to stdout: it is the MCP transport
      });
      return text({ profile, summary, gaps: gapsOf(assessments) });
    })
  );

  server.registerTool(
    'remediate_project',
    {
      title: 'Assess and generate docs (Claude)',
      description:
        'Full loop: assess, write the missing/weak documentation tailored to the ' +
        'project, then re-verify — until compliant or maxPasses. WRITES FILES into the ' +
        'project. Requires ANTHROPIC_API_KEY. Generated docs are a starting point to ' +
        'review and own — not an audit or ISO certification.',
      inputSchema: assessInput,
    },
    guard(async ({ path: p, standards, maxPasses }) => {
      const root = requireDir(p);
      if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
        return fail('ANTHROPIC_API_KEY is not set in the server environment.');
      }
      const { summary, assessments, profile } = await runAgent({
        root,
        standards: selectStandards(standards),
        reportOnly: false,
        maxPasses: maxPasses || 3,
        log: () => {},
      });
      return text({
        profile,
        summary,
        remainingGaps: gapsOf(assessments),
        reports: ['iso-compliance-report.json', 'ISO_COMPLIANCE_REPORT.md'],
      });
    })
  );

  return server;
}

function gapsOf(assessments) {
  const out = [];
  for (const a of assessments) {
    for (const c of a.controls) {
      if (c.status !== 'compliant') {
        out.push({ standard: a.id, control: c.check, status: c.status, gap: c.gap, suggested: c.remediation && c.remediation.path });
      }
    }
  }
  return out;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((e) => {
    console.error('MCP server error:', e.message);
    process.exit(1);
  });
}
