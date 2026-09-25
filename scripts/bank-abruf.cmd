@echo off
rem Taeglicher Bankabgleich. Wird von der Aufgabenplanung gestartet.
rem Von Hand starten geht auch: einfach doppelklicken.
rem
rem Hier stehen keine Zugangsdaten. Die holt sich das Programm aus den
rem Umgebungsvariablen dieses Benutzers.

setlocal
set LOG=%USERPROFILE%\fzt-bank-abruf.log

echo. >> "%LOG%"
echo ===== %DATE% %TIME% ===== >> "%LOG%"

call "%~dp0bank-python.cmd" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo Die Python-Umgebung liess sich nicht einrichten. >> "%LOG%"
  exit /b 1
)

pushd "%~dp0.."
"%BANKPY%" scripts\bank-abruf.py --tage 30 --automatisch >> "%LOG%" 2>&1
set ERG=%ERRORLEVEL%
popd

if not "%ERG%"=="0" echo Abbruch mit Fehlercode %ERG% >> "%LOG%"
exit /b %ERG%
