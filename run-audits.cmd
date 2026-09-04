@echo off
cd /d "%~dp0"
node iso-local-audit.mjs "%~dp0" --apply --profile=isocheck
node iso-local-audit.mjs "%~dp0"
if errorlevel 1 exit /b 1

rem Optional second project: only audited when present on this machine.
set "EUPAY=C:\Users\amkei\Repos\eu-pay"
if not exist "%EUPAY%" (
  echo Skipping (not found): %EUPAY%
  exit /b 0
)
node iso-local-audit.mjs "%EUPAY%" --apply --profile=eu-pay
node iso-local-audit.mjs "%EUPAY%"
exit /b %errorlevel%
