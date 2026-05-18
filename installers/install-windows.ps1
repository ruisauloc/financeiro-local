$ErrorActionPreference = "Stop"

Write-Host "Financeiro Local - instalador Windows" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js LTS nao encontrado. Instale em https://nodejs.org/ e rode novamente."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "NPM nao encontrado. Reinstale o Node.js LTS e rode novamente."
}

npm install

$env:FINANCEIRO_DEFAULT_PASSWORD = "123456"
$env:FINANCEIRO_BOOTSTRAP_PASSWORD_ONLY = "1"
npm run server
Remove-Item Env:\FINANCEIRO_DEFAULT_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\FINANCEIRO_BOOTSTRAP_PASSWORD_ONLY -ErrorAction SilentlyContinue

npm run build

Write-Host ""
Write-Host "Instalacao concluida." -ForegroundColor Green
Write-Host "Senha inicial: 123456"
Write-Host "Para iniciar: npm run dev"
Write-Host "Interface: http://127.0.0.1:5179"
Write-Host "Altere a senha em Avancado > Geral > Seguranca."
