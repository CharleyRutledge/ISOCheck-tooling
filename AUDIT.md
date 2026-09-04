# Local ISO compliance loop

Deterministic audit (no API key) aligned with the catalogued ISO/IEC checklists
(`iso-standards.mjs`).

> ⚠️ **Not certification.** This is an automated self-assessment of documentation
> coverage, not an audit and not ISO certification. See the disclaimer in
> [README.md](README.md).

## Run

```cmd
run-audits.cmd
```

Or PowerShell (point `-ProjectRoot` at any project):

```powershell
.\run-audit-loop.ps1 -ProjectRoot . -Profile isocheck
```

Audit extra projects without editing files via `ISO_AUDIT_TARGETS` or CLI args —
see [README.md](README.md#projects-deterministic-audit).

Success: exit code **0**, and `iso-audit-summary.txt` contains `compliant=true`
(i.e. every documentation check passed for that project).

## HTML report from audit JSON

```cmd
node generate-report-from-audit.mjs <project>/iso-audit-report.json out.html
```

## ISOCheck UI (AI audit)

Upload the full project folder at `http://localhost:3000/iso-compliance-checker`
after `npm start` in this repo.
