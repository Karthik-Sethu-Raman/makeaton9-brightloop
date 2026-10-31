@echo off
rem RUN_CMD - serve Cadence on http://127.0.0.1:8000
setlocal
cd /d "%~dp0.."
python -c "import fastapi, uvicorn" 2>nul
if errorlevel 1 (
  python -m pip install -q -r requirements.txt
  if errorlevel 1 exit /b 1
)
python -m uvicorn backend.api.main:app --port 8000
