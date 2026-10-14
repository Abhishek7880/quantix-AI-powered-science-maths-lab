@echo off
REM Starts the REST API + web pages (Image Inspection, Formula Library, Graph Plotter) and opens the browser.
REM Usage: double-click this file, or run  .\start_ui.bat  in a terminal. Close the window / Ctrl+C to stop.
REM The server auto-reloads when code in src\ changes, so updates appear without restarting.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found in %~dp0.venv
    echo         Create it first - see README.md section 3 "Installation".
    pause
    exit /b 1
)

REM Stop an older copy of THIS server (and its child processes) still holding port 8000, so new code is used.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_server.ps1" -Port 8000
if errorlevel 1 (
    pause
    exit /b 1
)

echo Starting Quantix on http://127.0.0.1:8000 ...
echo   Image Inspection : http://127.0.0.1:8000
echo   Formula Library  : http://127.0.0.1:8000/formulas
echo   Unit Converter   : http://127.0.0.1:8000/converter
echo   Graph Plotter    : http://127.0.0.1:8000/graph
echo Keep this window open while you use the pages. Press Ctrl+C to stop.
echo.
REM Open the browser a few seconds after the server starts loading.
start "" /b cmd /c "timeout /t 7 /nobreak >nul & start http://127.0.0.1:8000"
".venv\Scripts\python.exe" -m src.serve --port 8000
pause
