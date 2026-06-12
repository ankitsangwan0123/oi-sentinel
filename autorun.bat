@echo off
:: ── OI Sentinel AutoRun ──
:: Launched by Task Scheduler on every Windows login
:: Runs Mon-Fri only. Python handles market hour logic.

:: Force correct working directory — critical fix
cd /d D:\OI-Sentinel

setlocal enabledelayedexpansion

:: Log startup attempt
echo [%date% %time%] AutoRun triggered >> D:\OI-Sentinel\startup.log 2>&1

:: Check weekday via PowerShell (IST)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::Now, 'India Standard Time').DayOfWeek.ToString()"') do set DOW=%%i

echo [%date% %time%] Day: !DOW! >> D:\OI-Sentinel\startup.log 2>&1

if /i "!DOW!"=="Saturday" (
    echo [%date% %time%] Weekend - skipping >> D:\OI-Sentinel\startup.log 2>&1
    exit /b 0
)
if /i "!DOW!"=="Sunday" (
    echo [%date% %time%] Weekend - skipping >> D:\OI-Sentinel\startup.log 2>&1
    exit /b 0
)

:: Weekday — check setup.bat exists
if not exist "D:\OI-Sentinel\setup.bat" (
    echo [%date% %time%] setup.bat missing - downloading >> D:\OI-Sentinel\startup.log 2>&1
    curl -L -f -s -o "D:\OI-Sentinel\setup.bat" "https://raw.githubusercontent.com/ankitsangwan0123/oi-sentinel/main/setup.bat"
    if %errorlevel% neq 0 (
        echo [%date% %time%] ERROR: Could not download setup.bat >> D:\OI-Sentinel\startup.log 2>&1
        exit /b 1
    )
)

echo [%date% %time%] Launching setup.bat >> D:\OI-Sentinel\startup.log 2>&1
start "" "D:\OI-Sentinel\setup.bat"
exit /b 0
