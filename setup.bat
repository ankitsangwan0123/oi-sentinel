@echo off
setlocal enabledelayedexpansion
title OI Sentinel — Setup ^& Launch
color 0A

:: Force correct directory
cd /d D:\OI-Sentinel

echo.
echo  ============================================
echo   OI SENTINEL — NSE OI Analysis Dashboard
echo  ============================================
echo.

:: ── STEP 1: CHROME ──
echo [1/6] Checking Google Chrome...
set CHROME_FOUND=0
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe"       set CHROME_FOUND=1
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME_FOUND=1
if "%CHROME_FOUND%"=="0" (
    echo.
    echo  [ERROR] Google Chrome NOT found.
    echo  Install: https://www.google.com/chrome
    echo  Then re-run setup.bat
    pause
    exit /b 1
)
echo  Chrome OK.

:: ── STEP 2: PYTHON ──
echo.
echo [2/6] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  Downloading Python 3.11...
    curl -L -o "%TEMP%\python_installer.exe" https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe
    if %errorlevel% neq 0 ( echo [ERROR] Download failed. & pause & exit /b 1 )
    "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
    set "PATH=%PATH%;C:\Python311;C:\Python311\Scripts;C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311;C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\Scripts"
    echo  Python installed.
) else (
    python --version
    echo  Python OK.
)

:: ── STEP 3: FOLDERS ──
echo.
echo [3/6] Creating folders...
if not exist "D:\OI-Sentinel"                mkdir "D:\OI-Sentinel"
if not exist "D:\OI-Sentinel\data"           mkdir "D:\OI-Sentinel\data"
if not exist "D:\OI-Sentinel\data\NIFTY"     mkdir "D:\OI-Sentinel\data\NIFTY"
if not exist "D:\OI-Sentinel\data\BANKNIFTY" mkdir "D:\OI-Sentinel\data\BANKNIFTY"
if not exist "D:\OI-Sentinel\templates"      mkdir "D:\OI-Sentinel\templates"
if not exist "D:\OI-Sentinel\static"         mkdir "D:\OI-Sentinel\static"
echo  Folders ready.

:: ── STEP 4: DOWNLOAD FILES ──
echo.
echo [4/6] Downloading files from GitHub...
set BASE=https://raw.githubusercontent.com/ankitsangwan0123/oi-sentinel/main

curl -L -f -s -o "D:\OI-Sentinel\app.py"               "%BASE%/app.py"
if %errorlevel% neq 0 ( echo [ERROR] app.py failed & pause & exit /b 1 )
echo  app.py OK

curl -L -f -s -o "D:\OI-Sentinel\requirements.txt"     "%BASE%/requirements.txt"
if %errorlevel% neq 0 ( echo [ERROR] requirements.txt failed & pause & exit /b 1 )
echo  requirements.txt OK

curl -L -f -s -o "D:\OI-Sentinel\templates\index.html" "%BASE%/templates/index.html"
if %errorlevel% neq 0 ( echo [ERROR] index.html failed & pause & exit /b 1 )
echo  index.html OK

curl -L -f -s -o "D:\OI-Sentinel\static\style.css"     "%BASE%/static/style.css"
if %errorlevel% neq 0 ( echo [ERROR] style.css failed & pause & exit /b 1 )
echo  style.css OK

curl -L -f -s -o "D:\OI-Sentinel\static\app.js"        "%BASE%/static/app.js"
if %errorlevel% neq 0 ( echo [ERROR] app.js failed & pause & exit /b 1 )
echo  app.js OK

curl -L -f -s -o "D:\OI-Sentinel\autorun.bat"          "%BASE%/autorun.bat"
echo  autorun.bat OK

curl -L -f -s -o "D:\OI-Sentinel\install_autorun.bat"  "%BASE%/install_autorun.bat"
echo  install_autorun.bat OK

curl -L -f -s -o "D:\OI-Sentinel\setup.bat"            "%BASE%/setup.bat"
echo  setup.bat OK

curl -L -f -s -o "D:\OI-Sentinel\README.md"            "%BASE%/README.md"
echo  README.md OK

echo  All files downloaded.

:: ── STEP 5: PIP INSTALL ──
echo.
echo [5/6] Installing Python packages...
python -m pip install --upgrade pip -q
python -m pip install -r "D:\OI-Sentinel\requirements.txt" -q
if %errorlevel% neq 0 (
    echo  [ERROR] Package install failed. Run as Administrator.
    pause
    exit /b 1
)
echo  Packages installed.

:: ── STEP 6: AUTO-RUN ──
echo.
echo [6/6] Auto-launch setup...
echo.
echo  Auto-launch = OI Sentinel starts automatically on every boot.
echo.
choice /c YN /m "  Install auto-launch? (Y=Yes N=Skip)"
if %errorlevel%==1 (
    call "D:\OI-Sentinel\install_autorun.bat"
)

:: ── LAUNCH ──
echo.
echo  ============================================
echo   Launching OI Sentinel...
echo   Dashboard : http://localhost:5000
echo   Log file  : D:\OI-Sentinel\startup.log
echo   Keep this window open.
echo   Ctrl+C to stop.
echo  ============================================
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:5000"
cd /d "D:\OI-Sentinel"
python app.py >> "D:\OI-Sentinel\startup.log" 2>&1
pause
