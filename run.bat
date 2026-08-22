@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 LTS from https://nodejs.org then run this again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo Created .env from .env.example
)

if not exist "node_modules\" (
  echo Installing npm packages...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Meridian Final — http://localhost:3000
echo Login ID WQ3137   Password Test@password
echo Leave this window open for overnight paper.
echo.

call npm run dev:local
pause
