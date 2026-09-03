@echo off
title FZT Eventmanager
cd /d "%~dp0"
echo.
echo   ============================================
echo    FZT Eventmanager wird gestartet
echo   ============================================
echo.
echo   Der Browser oeffnet sich in wenigen Sekunden.
echo   Falls nicht, im Browser aufrufen:
echo   http://localhost:3005
echo.
echo   WICHTIG: Dieses Fenster offen lassen,
echo   solange du mit dem Programm arbeitest.
echo   Zum Beenden das Fenster einfach schliessen.
echo.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3005'"
call npm run dev
echo.
echo   Das Programm wurde beendet.
pause
