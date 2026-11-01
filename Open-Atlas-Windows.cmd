@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Atlas-PowerShell.ps1"
if errorlevel 1 pause
