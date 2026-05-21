import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportPath = process.argv[2];
const outPath = process.argv[3];
if (!reportPath || !outPath) {
  console.error('Usage: node generate-report-from-audit.mjs <iso-audit-report.json> <out.html>');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const green = '#34d399';
const red = data.overall >= 100 && data.totalFail === 0 ? green : '#f87171';
const badge = data.overall >= 100 && data.totalFail === 0 ? 'Compliant' : 'Non-compliant';

const sections = data.results
  .map((r) => {
    const rows = r.findings
      .map((f) => {
        const col = f.status === 'pass' ? green : f.status === 'warn' ? '#fbbf24' : '#f87171';
        const icon = f.status === 'pass' ? '&#10003;' : f.status === 'warn' ? '!' : '&#10007;';
        return `<div style="display:flex;gap:10px;padding:8px 10px;margin-bottom:4px;background:#111118;border-left:3px solid ${col}"><span>${icon}</span><div style="font-size:12px;color:#8888aa">${f.check}</div></div>`;
      })
      .join('');
    return `<div style="margin-bottom:16px;border:1px solid rgba(255,255,255,0.07);border-radius:10px;overflow:hidden"><div style="padding:12px 16px;background:#1c1c28"><strong style="color:#a78bfa">${r.id}</strong> <span style="color:${r.score >= 70 ? green : red}">${r.score}/100</span></div><div style="padding:12px 16px">${rows}</div></div>`;
  })
  .join('');

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>ISO Audit ${data.overall}/100</title></head><body style="background:#0a0a0f;color:#e8e8f0;font-family:system-ui;padding:32px;max-width:900px;margin:0 auto"><h1>ISOCheck local audit</h1><p>Overall <span style="color:${green};font-size:28px;font-weight:800">${data.overall}</span>/100 · ${badge}</p><p style="color:#8888aa">pass=${data.totalPass} warn=${data.totalWarn} fail=${data.totalFail} · ${data.at}</p>${sections}</body></html>`;
fs.writeFileSync(outPath, html, 'utf8');
console.log('Wrote', outPath);
