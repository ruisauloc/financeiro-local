@echo off
setlocal

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

taskkill /F /IM "Financeiro Local 1.0.6.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.7.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.8.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.9.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.10.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.11.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.12.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.13.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.14.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.15.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.16.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.17.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.18.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.19.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local 1.0.20.exe" >nul 2>nul
taskkill /F /IM "Financeiro Local.exe" >nul 2>nul

if exist "%APP_DIR%release\Financeiro Local 1.0.20.exe" (
  start "" /D "%APP_DIR%" "%APP_DIR%release\Financeiro Local 1.0.20.exe"
  exit /b 0
)

if exist "%APP_DIR%release\win-unpacked\Financeiro Local.exe" (
  start "" /D "%APP_DIR%" "%APP_DIR%release\win-unpacked\Financeiro Local.exe"
  exit /b 0
)

if exist "%APP_DIR%release\Financeiro Local 1.0.19.exe" (
  start "" /D "%APP_DIR%" "%APP_DIR%release\Financeiro Local 1.0.19.exe"
  exit /b 0
)

if exist "%APP_DIR%release\Financeiro Local 1.0.18.exe" (
  start "" /D "%APP_DIR%" "%APP_DIR%release\Financeiro Local 1.0.18.exe"
  exit /b 0
)

where npm >nul 2>nul
if errorlevel 1 (
  echo Nao encontrei o executavel em "%APP_DIR%release".
  echo Gere o executavel novamente ou instale o Node.js para rodar em modo desenvolvimento.
  pause
  exit /b 1
)

npm run electron
