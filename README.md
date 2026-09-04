# ISOCheck tooling

Local ISO compliance **artefact audit** (no API key) plus the ISOCheck browser UI.

## Projects

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

## Run until fully compliant

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
