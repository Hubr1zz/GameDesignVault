@echo off
rem Opens the read-only workbench in the browser.
rem The first run builds the front end, which needs Node.js. Python 3.10+ is required.
cd /d "%~dp0"
python .agents\skills\manage-design-repository\scripts\vault.py serve
pause
