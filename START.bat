@echo off
color 0A
echo.
echo ====================================
echo   GestureExplorer Elite Launcher
echo ====================================
echo.
echo Starting Backend...
start "GestureExplorer Backend" cmd /k "cd backend && venv\Scripts\activate && python app.py"
timeout /t 3 /nobreak >nul
echo Starting Frontend...
start "GestureExplorer Frontend" cmd /k "cd frontend && npx vite"
timeout /t 4 /nobreak >nul
echo Opening application...
start "" "http://localhost:5173"
echo.
echo ====================================
echo   Applications started!
echo   Backend:  http://localhost:5000
echo   Frontend: http://localhost:5173
echo ====================================
