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
python -m pytest -q
exit /b %errorlevel%
