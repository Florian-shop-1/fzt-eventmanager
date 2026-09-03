@echo off
title FZT Eventmanager - Lexoffice verbinden
cd /d "%~dp0"
echo.
echo   ============================================
echo    Lexware Office (frueher lexoffice) verbinden
echo   ============================================
echo.
echo   So kommst du an den Schluessel:
echo.
echo     1. Diese Seite im Browser oeffnen:
echo        https://app.lexware.de/addons/public-api
echo     2. Auf "API-SCHLUESSEL ERSTELLEN" klicken
echo     3. Den Schluessel kopieren (Strg+C)
echo.
echo   Der Schluessel wird nur einmal angezeigt.
echo.
echo   ---------------------------------------------
echo.
set /p SCHLUESSEL="   Schluessel hier einfuegen (Rechtsklick) und Enter: "
echo.

if "%SCHLUESSEL%"=="" (
  echo   Nichts eingegeben. Abgebrochen, es wurde nichts geaendert.
  echo.
  pause
  exit /b 1
)

call npx cross-env NODE_OPTIONS=--use-system-ca tsx scripts/lexoffice-eintragen.ts "%SCHLUESSEL%"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================
echo    Verbindung wird geprueft
echo   ============================================
echo.
call npm run lexoffice:test
echo.
pause
