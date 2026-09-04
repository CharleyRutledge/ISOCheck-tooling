# ISOCheck tooling

> ⚠️ **Not certification.** These tools produce an automated **self-assessment of
> documentation coverage** against ISO/IEC checklists. They are not an audit and do
> not constitute or imply ISO certification — that can only be issued by an
> accredited certification body following a formal external audit. Generated docs
> are a starting point to review, make accurate, and own; several catalogued
> standards (e.g. 25010, 29119, 5055) are guidance/measurement standards you
> conform to, not schemes you get certified against at all.

Three ways to check a project against the catalogued ISO/IEC standards
(see `iso-standards.mjs` for the full list of 20):

| Tool | What it does | Needs a key? |
|------|--------------|--------------|
| **`iso-agent.mjs`** | Point at **any** app: Claude profiles it, judges each control by reading real file content, writes the missing docs tailored to that app, and re-verifies in a loop. | Yes (Anthropic) |
| `iso-local-audit.mjs` | Deterministic artefact audit — checks expected files exist. Fast, offline. | No |
| `iso-compliance-checker.html` | Browser UI: upload a folder, run an LLM audit on file snapshots. | Yes |

## Agent — assess any app and fix the gaps

```bash
npm install                      # once, to install the Anthropic SDK
export ANTHROPIC_API_KEY=sk-...  # or: ant auth login

# Full auto: assess → write missing docs → re-verify (up to 3 passes)
node iso-agent.mjs /path/to/any/app

# Just report the gaps, write nothing:
node iso-agent.mjs /path/to/any/app --report-only

# Preview the evidence sent to Claude, no API calls / no key:
node iso-agent.mjs /path/to/any/app --scan-only
```

Options: `--max-passes=N` (default 3), `--model=ID` (default `claude-opus-5`),
`--standards=27001,42001` (assess only matching standards).

Outputs `iso-compliance-report.json` and `ISO_COMPLIANCE_REPORT.md` in the target
project, and (unless `--report-only`) the generated documentation itself.
Exit code `0` means every catalogued control has documentation (self-assessment, not certification).

## Projects (deterministic audit)

The loop always audits **this repo** (`isocheck` profile). Additional projects
are optional and configured per machine — nothing is hardcoded, and a project
that isn't present is skipped rather than failing the run.

Add extra targets via the `ISO_AUDIT_TARGETS` env var or CLI args, each as
`path=profile` (profile defaults to `isocheck` if omitted):

```cmd
set ISO_AUDIT_TARGETS=C:\Users\me\Repos\eu-pay=eu-pay
node iso-compliance-loop.mjs

rem or as arguments
node iso-compliance-loop.mjs C:\Users\me\Repos\eu-pay=eu-pay
```

## Run until all documentation checks pass

```cmd
node iso-compliance-loop.mjs
```

Or:

```cmd
run-audits.cmd
```

Success: exit code `0`, `iso-audit-summary.txt` contains `compliant=true`, HTML report written in each project root.

## Single project

```cmd
node iso-local-audit.mjs C:\Users\amkei\Repos\eu-pay --apply --profile=eu-pay
node iso-local-audit.mjs C:\Users\amkei\Repos\eu-pay
```

## ISOCheck UI (AI audit)

```cmd
npm start
```

Open `http://localhost:3000/iso-compliance-checker`, upload the **whole project folder**, select standards, run analysis (requires Anthropic API key).

The local audit checks **documentation and test artefacts**; the UI audit uses Claude on file snapshots.
