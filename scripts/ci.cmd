@echo off
rem TEST_CMD - ensure deps then run pytest. Skips pip entirely when deps
rem are already importable, so warm machines never touch the network.
setlocal
cd /d "%~dp0.."
python -c "import fastapi, uvicorn, httpx, pytest" 2>nul
if errorlevel 1 (
  python -m pip install -q -r requirements.txt
  if errorlevel 1 exit /b 1
)
rem basetemp: pytest's default tries to relink %TEMP%\pytest-of-<user>\pytest-current,
rem which dies with WinError 5 (ACL) when another run holds it (hit on a worker
rem machine AFTER a green suite, i.e. a false RED). A unique dir per run avoids the
rem shared symlink entirely; Windows scavenges %TEMP% so nothing accumulates.
python -m pytest -q --basetemp "%TEMP%\cadence-pytest-%RANDOM%"
exit /b %errorlevel%
