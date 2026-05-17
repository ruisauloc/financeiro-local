# Arquitetura do Financeiro Local

## Visão geral

Aplicação web local com frontend React, backend Node/Express e banco SQLite.

- Frontend: Vite em `http://127.0.0.1:5179`
- Backend/API: Express em `http://127.0.0.1:6397`
- Banco padrão: `financeiro.sqlite`
- Anexos padrão: `uploads/attachments`
- Origem migrada: planilha XLSM com fórmulas, macros, tabelas auxiliares e arquivos OFX

## Camadas

- `src/main.jsx`: interface, telas, estados, formulários e chamadas para API.
- `src/styles.css`: design visual, temas, responsividade desktop/mobile e animações.
- `server/index.js`: API, modelo SQLite, regras de domínio, autenticação, anexos e importação OFX.
- `docs/MAPEAMENTO-PLANILHA.md`: regras extraídas de fórmulas, tabelas e VBA.

## Execução

O comando `npm run dev` sobe dois processos:

- `npm run server`: API Express escutando em `0.0.0.0:6397`.
- `npm run client`: Vite escutando em `0.0.0.0:5179`.

O Vite encaminha `/api` para a API local.

## Modelo SQLite

### `categories`

Categorias financeiras.

- `name`
- `type`: `Receita`, `Despesa`, `Fatura`, `Envio Transf`, `Receb Transf`
- `show_on_dashboard`: habilita painel específico para a categoria
- `dashboard_order`: ordenação dos painéis de categoria

### `subcategories`

Subcategorias vinculadas a categorias.

- `name`
- `category_id`

### `institutions`

Contas e cartões.

- `name`
- `kind`: `Conta` ou `Cartão`
- `opening_balance`

### `transactions`

Tabela central dos lançamentos.

- `date`
- `description`
- `amount`
- `institution_id`
- `status`: `Realizado` ou `Previsto`
- `note`
- `subcategory_id`
- `category_id`
- `result`
- `signed_amount`
- `source`: `manual`, `ofx`, `installment`, `transfer`, `card_payment`
- `forecast_type`
- `fitid`
- `transfer_group_id`
- `installment_group_id`
- `installment_number`
- `installment_total`
- `settled_at`
- `settlement_type`: `Antecipada`, `Quitada` ou `Manual`

### `installment_groups`

Contrato de parcelamento.

- `description`
- `principal_total`: valor original da compra
- `installment_amount`: valor de cada parcela
- `installments_count`: quantidade total de parcelas
- `interest_total`: diferença entre total parcelado e valor original
- `institution_id`
- `subcategory_id`
- `first_date`
- `status`: `Aberto` ou `Quitado`

### `subscriptions`

Assinaturas recorrentes sem quantidade fixa de parcelas.

- `name`
- `category_id`
- `subcategory_id`
- `institution_id`
- `billing_cycle`: `Mensal` ou `Anual`
- `amount`
- `renewal_date`
- `next_due_date`
- `status`: `Ativa` ou `Cancelada`

### `attachments`

Arquivos vinculados a lançamentos, grupos de parcelamento ou assinaturas.

- `transaction_id`
- `installment_group_id`
- `subscription_id`
- `kind`: `file` ou `camera`
- `original_name`
- `stored_name`
- `mime_type`
- `size`

Os arquivos são gravados na pasta configurada em `app_settings.attachmentsDir`; se não houver configuração, usa `uploads/attachments`.

### `ofx_imports`

Histórico de arquivos OFX importados.

- `institution_id`
- `filename`
- `file_hash`
- `period_start`
- `period_end`
- `transactions_count`

### `card_payments`

Pagamentos de fatura.

- `paid_at`
- `card_id`
- `account_id`
- `period_month`
- `period_year`
- `amount`
- `transaction_id`

### `rule_map`

Regras automáticas por texto.

- `pattern`
- `subcategory_id`
- `priority`

### `app_settings`

Preferências globais do app.

- `attachmentsDir`
- `authPasswordHash`
- `sessionSecret`
- preferências de tema, dashboard e conexões

## Regras de domínio

- Receita soma no saldo.
- Despesa subtrai do saldo.
- Fatura representa pagamento de cartão.
- Transferência cria lançamento duplo vinculado por grupo.
- Parcelamento diferencia valor original, valor da parcela e juros.
- Antecipar parcela tira impacto de meses futuros e registra realização antecipada.
- Quitar parcela marca pendências como realizadas na data da quitação.
- Reabrir desfaz antecipações/quitações quando necessário.
- Assinaturas são previsões recorrentes sem prazo final obrigatório.
- OFX usa hash do arquivo e FITID para reduzir duplicidade.
- Anexos ficam protegidos por sessão autenticada.

## Endpoints principais

- `GET /api/auth/status`
- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/summary`
- `GET /api/config`
- `GET /api/transactions`
- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`
- `POST /api/installments`
- `GET /api/installments`
- `POST /api/installments/:groupId/anticipate`
- `POST /api/installments/:groupId/settle`
- `POST /api/installments/:groupId/reopen`
- `POST /api/installments/items/:id/toggle`
- `GET /api/subscriptions`
- `POST /api/subscriptions`
- `POST /api/subscriptions/:id/cancel`
- `POST /api/attachments`
- `GET /api/attachments/:storedName`
- `POST /api/transfers`
- `POST /api/card-payments`
- `POST /api/ofx/preview`
- `POST /api/ofx/import`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/connections/current`
- `POST /api/connections/test`
- `POST /api/connections/save`
- `POST /api/connections/migrate-to`
- `POST /api/connections/import-to-sqlite`
- `POST /api/admin/clear-base`

## Conexões externas

A guia `Avançado > Conexões` prepara bases externas:

- SQLite em outro arquivo.
- SQL Server.
- Planilha Excel.

Operações disponíveis:

- testar conexão ou caminho
- salvar configuração sem senha
- criar estrutura e migrar dados da base SQLite atual
- importar de volta para o SQLite atual a partir de SQLite externo ou planilha

Estado atual: a aplicação ainda roda sobre o SQLite local principal. A camada de conexões já inicializa e migra bases externas, mas a troca definitiva do provider ativo depende de uma próxima refatoração do acesso a dados.

