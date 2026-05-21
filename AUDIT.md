# Local ISO compliance loop

Deterministic audit (no API key) aligned with ISOCheck standard checklists.

## Run both projects

```cmd
cd C:\Users\amkei\Repos\isocheck
run-audits.cmd
```

Or PowerShell:

```powershell
cd C:\Users\amkei\Repos\isocheck
.\run-audit-loop.ps1 -ProjectRoot C:\Users\amkei\Repos\isocheck -Profile isocheck
.\run-audit-loop.ps1 -ProjectRoot C:\Users\amkei\Repos\eu-pay -Profile eu-pay
```

Success: exit code **0**, `iso-audit-summary.txt` contains `compliant=true`.

## HTML report from audit JSON

```cmd
node generate-report-from-audit.mjs C:\Users\amkei\Repos\isocheck\iso-audit-report.json C:\Users\amkei\Downloads\iso-compliance-report-isocheck.html
node generate-report-from-audit.mjs C:\Users\amkei\Repos\eu-pay\iso-audit-report.json C:\Users\amkei\Downloads\iso-compliance-report-eu-pay.html
```

## ISOCheck UI (AI audit)

Upload the full project folder at `http://localhost:3000/iso-compliance-checker` after `npm start` in this repo.
