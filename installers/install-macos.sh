#!/usr/bin/env bash
set -euo pipefail

echo "Financeiro Local - instalador macOS"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js LTS nao encontrado."
  echo "Com Homebrew: brew install node"
  echo "Se precisar das ferramentas de compilacao: xcode-select --install"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "NPM nao encontrado. Reinstale o Node.js LTS e rode novamente."
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
