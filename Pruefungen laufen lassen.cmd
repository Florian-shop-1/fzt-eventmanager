@echo off
title FZT Eventmanager - Pruefungen
cd /d "%~dp0"
echo.
echo   ============================================
echo    Pruefungen
echo   ============================================
echo.
echo   Geprueft werden: Sitzplaner, Angebotsberechnung
echo   und das Datenbankschema. Dauert etwa eine Minute.
echo.
call npm test
echo.
echo   ============================================
echo    Verbindung zur Datenbank
echo   ============================================
echo.
call npm run db:status
echo.
pause
