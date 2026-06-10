# Roadmap de melhorias do Financeiro Local

Este arquivo acompanha as 7 melhorias escolhidas para evoluir o sistema sem perder contexto.

## 1. Backup e restauração completa

Objetivo: gerar um pacote com SQLite, anexos, mídias do Telegram, instâncias e configurações; permitir restaurar depois.

Status: implementado.

Entregue:
- Rota `GET /api/backup/export` para gerar ZIP completo.
- Rota `POST /api/backup/restore` para restaurar a instância atual.
- Guia `Avançado > Backup`.

## 2. Central de auditoria

Objetivo: registrar ações sensíveis como edição/exclusão de lançamentos, limpeza de base, instâncias, senha, migrações, importações OFX, backups e alertas.

Status: implementado.

Entregue:
- Tabela `audit_logs`.
- Rota `GET /api/audit`.
- Logs para senha, cadastros, regras, anexos, instâncias, importação OFX, migrações, backup, restauração, relatórios, lançamentos, orçamentos e limpeza de base.
- Guia `Avançado > Auditoria`.

## 3. Tela de saúde do sistema

Objetivo: mostrar banco em uso, pasta de anexos, tamanho da base, portas, status Telegram, instâncias, quantidade de anexos e últimos eventos.

Status: implementado.

Entregue:
- Rota `GET /api/health` com SQLite, anexos, mídias Telegram, portas, instâncias, contagens e últimos eventos.
- Guia `Avançado > Saúde`.

## 4. Bot Telegram com conversa guiada

Objetivo: além de texto livre, permitir fluxo por perguntas: tipo, valor, descrição, conta, subcategoria, confirmação e anexo futuro.

Status: implementado.

Entregue:
- Comando `/lancar` e `/lançar`.
- Fluxo por botões para Entrada/Saída, pergunta de valor, pergunta de descrição e confirmação.
- Mantido o modo inteligente por texto livre.

## 5. Backup dos anexos na migração

Objetivo: deixar claro e disponível um pacote completo com os arquivos físicos, já que SQL Server recebe dados e configurações, mas não bytes dos anexos/mídias.

Status: implementado.

Entregue:
- O backup ZIP inclui anexos e mídias do Telegram.
- A migração externa continua avisando que arquivos físicos ficam no pacote de backup, não no SQL Server.

## 6. Regras inteligentes treináveis

Objetivo: ao corrigir categoria/subcategoria, permitir gravar uma regra para próximas importações OFX/Telegram.

Status: implementado.

Entregue:
- Rota `POST /api/rules/train` para gravar/atualizar regra a partir de lançamento corrigido.
- A regra treinada entra no mesmo motor usado por OFX e Telegram.

## 7. Relatórios exportáveis

Objetivo: exportar relatórios em Excel com resumo mensal, categorias, subcategorias, faturas, orçamentos e lançamentos sem subcategoria.

Status: implementado.

Entregue:
- Rota `GET /api/reports/monthly.xlsx`.
- Guia `Avançado > Relatórios`.
- Abas no Excel: resumo, lançamentos, categorias, subcategorias, orçamentos e itens sem subcategoria.
