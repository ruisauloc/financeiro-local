# Financeiro Local

Sistema financeiro web local, criado a partir da análise de uma planilha XLSM com macros, fórmulas, OFX, parcelamentos e painel financeiro.

O projeto roda em rede local ou via VPN, com frontend React/Vite, API Node/Express e banco SQLite por padrão.

## Principais recursos

- Painel com filtros de dia, mês e ano.
- Cards de receitas, despesas, faturas e previstos.
- Gráficos de fluxo mensal, top categorias e top subcategorias.
- Configuração avançada de dashboards, regras, modelos de gráficos, visibilidade e aparência.
- Lançamentos manuais com entrada, saída, previsto, anexos de arquivo e foto.
- Busca inteligente de subcategoria por nome da subcategoria ou da categoria.
- Edição e exclusão de lançamentos.
- Parcelamentos com quantidade de parcelas, juros, antecipação, quitação e reabertura.
- Assinaturas mensais ou anuais, sem quantidade fixa de parcelas.
- Importação OFX com prevenção de duplicidade por hash e FITID.
- Cadastro de categorias, subcategorias, instituições e regras automáticas.
- Personalização de tema, cores, densidade e posição do botão flutuante.
- Configuração da pasta local de anexos.
- Preparação para migração/exportação para SQLite externo, SQL Server e planilha.
- Autenticação local por senha para uso em rede local ou VPN.

## Stack

- React 19
- Vite 8
- Node.js com Express
- SQLite com `better-sqlite3`
- Recharts
- Framer Motion
- Lucide React
- Multer para anexos
- XLSX para integração com planilhas
- MSSQL para preparação de conexão com SQL Server

## Requisitos

- Node.js instalado.
- NPM instalado.
- Git instalado.

## Instalação

```bash
npm install
```

## Execução em desenvolvimento

```bash
npm run dev
```

URLs padrão:

- Frontend: `http://127.0.0.1:5179`
- API: `http://127.0.0.1:6397`

Para acessar de outro dispositivo na mesma rede ou pela VPN, use o IP da máquina onde o sistema está rodando:

```text
http://IP_DA_MAQUINA:5179
```

Exemplo:

```text
http://IP_DA_VPN:5179
```

## Primeiro acesso

No primeiro acesso, o sistema solicita a criação de uma senha local. Essa senha fica gravada com hash no banco SQLite local.

Depois disso, cada navegador ou celular pode fazer login separadamente. O sistema aceita múltiplas sessões.

## Build

```bash
npm run build
```

## Preview do build

```bash
npm run preview
```

## Armazenamento de dados

Por padrão:

- Banco: `financeiro.sqlite`
- Anexos: `uploads/attachments`
- Porta da API: `6397`
- Porta do frontend: `5179`

Esses arquivos e pastas são dados reais de uso e não devem ir para o GitHub.

As portas podem ser alteradas em `Avançado > Geral`. Depois de salvar, reinicie o app para que a API e a interface subam nas novas portas. A configuração local fica em `runtime-config.json`, arquivo ignorado pelo Git.

## O que não vai para o GitHub

O `.gitignore` bloqueia:

- Banco SQLite e arquivos WAL/SHM.
- Pasta de anexos.
- Arquivos OFX.
- Planilhas pessoais.
- Arquivos extraídos da planilha original.
- `.env`.
- `node_modules`.
- `dist`.

## Segurança

O app foi pensado para uso local, rede doméstica/escritório ou VPN privada.

Recursos atuais:

- Senha local obrigatória após configuração inicial.
- Hash de senha com PBKDF2.
- Cookie de sessão HTTP-only.
- Proteção das rotas da API.
- Proteção dos anexos por sessão.
- CORS restrito para origens locais, rede privada e faixa Tailscale.
- Sessões independentes por navegador/dispositivo.

Recomendação: não exponha a aplicação diretamente na internet. Para acesso remoto, prefira VPN.

## Banco externo

Em `Avançado > Conexões`, o sistema permite preparar:

- SQLite em outro arquivo.
- SQL Server.
- Planilha Excel.

No estado atual, a aplicação ainda executa sobre o SQLite local principal. As opções externas servem para testar conexão, criar estrutura, exportar/migrar dados e importar de volta para o SQLite local.

## Documentação

- [Arquitetura](docs/ARQUITETURA.md)
- [Mapeamento da planilha original](docs/MAPEAMENTO-PLANILHA.md)
- [Segurança](docs/SEGURANCA.md)
- [Operação local](docs/OPERACAO-LOCAL.md)

## Publicação no GitHub

Depois de configurar o repositório remoto:

```bash
git remote add origin git@github.com:SEU_USUARIO/financeiro-local.git
git branch -M main
git push -u origin main
```

Se o remoto já existir:

```bash
git remote set-url origin git@github.com:SEU_USUARIO/financeiro-local.git
git push -u origin main
```
