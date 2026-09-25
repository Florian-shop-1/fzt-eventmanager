@echo off
rem Legt fest, mit welchem Python der Bankabruf laeuft, und richtet es
rem beim ersten Mal selbst ein.
rem
rem Eine eigene Umgebung, damit der Abruf nicht davon abhaengt, was sonst
rem auf dem Rechner an Python-Paketen liegt oder fehlt. Sie liegt
rem ausserhalb von OneDrive, damit nichts synchronisiert wird.

set BANKVENV=%USERPROFILE%\.fzt-bank-venv
set BANKPY=%BANKVENV%\Scripts\python.exe

if not exist "%BANKPY%" (
  echo Richte die Python-Umgebung fuer den Bankabruf ein, das dauert einmalig eine Minute...
  py -m venv "%BANKVENV%" || exit /b 1
  "%BANKPY%" -m pip install --quiet fints requests truststore || exit /b 1
)

rem Fehlen die Bibliotheken doch, einmal nachinstallieren statt abbrechen.
"%BANKPY%" -c "import fints, requests, truststore" 2>nul
if errorlevel 1 "%BANKPY%" -m pip install --quiet fints requests truststore
