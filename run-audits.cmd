@echo off
cd /d "%~dp0"
node iso-local-audit.mjs "%~dp0" --apply --profile=isocheck
node iso-local-audit.mjs "%~dp0"
if errorlevel 1 exit /b 1
node iso-local-audit.mjs "C:\Users\amkei\Repos\eu-pay" --apply --profile=eu-pay
node iso-local-audit.mjs "C:\Users\amkei\Repos\eu-pay"
exit /b %errorlevel%
