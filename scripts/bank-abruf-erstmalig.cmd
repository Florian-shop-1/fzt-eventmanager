@echo off
rem Doppelklick: Bankabruf von Hand, mit Rueckfrage bei der Freigabe.
rem Genau dafuer gedacht, wenn die Bank eine SecureGo-plus-Freigabe will.
rem Der taegliche Lauf ist bank-abruf.cmd, der fragt nie nach.

call "%~dp0bank-python.cmd"
if errorlevel 1 goto ende

pushd "%~dp0.."
"%BANKPY%" scripts\bank-abruf.py --tage 30
popd

:ende
echo.
pause
