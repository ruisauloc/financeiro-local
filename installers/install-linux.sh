#!/usr/bin/env bash
set -euo pipefail

echo "Financeiro Local - instalador Linux"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js LTS nao encontrado."
  echo "Ubuntu/Debian: sudo apt install -y nodejs npm build-essential python3"
  echo "Fedora/RHEL: sudo dnf install -y nodejs npm gcc-c++ make python3"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "NPM nao encontrado. Instale o npm e rode novamente."
  exit 1
fi

npm install
FINANCEIRO_DEFAULT_PASSWORD=123456 FINANCEIRO_BOOTSTRAP_PASSWORD_ONLY=1 FINANCEIRO_SEED_PATH="$(pwd)/seed-current-cadastros.json" npm run server
npm run build

echo ""
echo "Instalacao concluida."
echo "Senha inicial: 123456"
echo "Para iniciar: npm run dev"
echo "Interface: http://127.0.0.1:5179"
echo "Altere a senha em Avancado > Geral > Seguranca."
