@echo off
setlocal enabledelayedexpansion
title OI Sentinel — Auto-Run Installer
color 0A

echo.
echo  ============================================
echo   OI SENTINEL — Auto-Run Installer
echo  ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Must run as Administrator.
    pause
    exit /b 1
)

if not exist "D:\OI-Sentinel" (
    echo  [ERROR] D:\OI-Sentinel not found. Run setup.bat first.
    pause
    exit /b 1
)

if not exist "D:\OI-Sentinel\autorun.bat" (
    echo  Downloading autorun.bat...
    curl -L -f -s -o "D:\OI-Sentinel\autorun.bat" "https://raw.githubusercontent.com/ankitsangwan0123/oi-sentinel/main/autorun.bat"
    if %errorlevel% neq 0 (
        echo  [ERROR] Could not download autorun.bat.
        pause
        exit /b 1
    )
)
echo  autorun.bat confirmed.

echo  Removing old task if exists...
schtasks /delete /tn "OI-Sentinel-AutoLaunch" /f >nul 2>&1

:: Write XML — only reliable way to set StartIn (working directory) via script
echo  Creating task XML...
set XMLFILE=%TEMP%\oi_task.xml

> "%XMLFILE%" (
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo ^<RegistrationInfo^>^<Description^>OI Sentinel Auto Launch^</Description^>^</RegistrationInfo^>
echo ^<Triggers^>^<LogonTrigger^>^<Enabled^>true^</Enabled^>^<Delay^>PT2M^</Delay^>^</LogonTrigger^>^</Triggers^>
echo ^<Principals^>^<Principal id="Author"^>^<LogonType^>InteractiveToken^</LogonType^>^<RunLevel^>HighestAvailable^</RunLevel^>^</Principal^>^</Principals^>
echo ^<Settings^>^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>^<Enabled^>true^</Enabled^>^</Settings^>
echo ^<Actions Context="Author"^>^<Exec^>^<Command^>D:\OI-Sentinel\autorun.bat^</Command^>^<WorkingDirectory^>D:\OI-Sentinel^</WorkingDirectory^>^</Exec^>^</Actions^>
echo ^</Task^>
)

:: Register via XML
schtasks /create /tn "OI-Sentinel-AutoLaunch" /xml "%XMLFILE%" /f
if %errorlevel% neq 0 (
    echo  [ERROR] XML registration failed.
    echo  Falling back to basic registration...
    schtasks /create /tn "OI-Sentinel-AutoLaunch" /tr "D:\OI-Sentinel\autorun.bat" /sc ONLOGON /rl HIGHEST /f
    if %errorlevel% neq 0 (
        echo  [ERROR] Both methods failed.
        pause
        exit /b 1
    )
    echo  Basic registration succeeded.
    echo  NOTE: Manually set Start In to D:\OI-Sentinel in Task Scheduler.
)

echo.
echo  ============================================
echo   AUTO-LAUNCH INSTALLED SUCCESSFULLY
echo   Working directory: D:\OI-Sentinel
echo   Triggers 2 min after every login (Mon-Fri)
echo   Log: D:\OI-Sentinel\startup.log
echo  ============================================
echo.
pause