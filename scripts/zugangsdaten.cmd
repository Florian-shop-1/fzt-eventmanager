@echo off
rem Doppelklick: fragt die Bankzugangsdaten ab und legt sie auf diesem
rem Rechner ab. Hier steht nichts Geheimes drin.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0zugangsdaten.ps1"
