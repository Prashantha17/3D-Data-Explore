@echo off
color 0A
echo.
echo ====================================
echo   GestureExplorer Elite Setup
echo ====================================
echo.
echo [1/4] Creating backend environment...
cd backend
copy .env.example .env
C:\Python311\python.exe -m venv venv
call venv\Scripts\activate
echo [2/4] Installing Python dependencies...
pip install -r requirements.txt
cd ..
echo [3/4] Installing Node dependencies...
cd frontend
npm install
cd ..
echo.
echo ====================================
echo   Setup Complete!
echo   Run START.bat to launch the app
echo ====================================
echo.
pause
