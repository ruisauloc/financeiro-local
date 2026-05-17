# Mapeamento da Planilha Original

Fonte analisada: planilha XLSM original do controle financeiro.

Essa planilha não deve ser publicada no GitHub porque contém dados financeiros pessoais. Este documento registra apenas o mapeamento funcional.

## Estrutura

- `DASHBOARD`: painel visual com gráficos, segmentações e imagem de fundo.
- `FLUXO`: resumo mensal/anual, comparação de fatura lançada com gastos de cartão.
- `LANÇAMENTO`: tabela principal de movimentações.
- `REGISTRO`: histórico de OFX importados e pagamentos de fatura.
- `CONFIGURAÇÃO`: categorias, subcategorias, instituições, saldos e revisões.
- `BASE APOIO`: pivôs e indicadores auxiliares.

## Tabelas e campos

- `LO`: `DATA`, `Descrição`, `Valor`, `INSTITUIÇÃO`, `Status`, `Obs (OPCIONAL)`, `CATEGORIA`, `CONTA/CARTÃO`, `MÊS`, `ANO`, `RESULTADO`, `SALDO`.
- `TabCategoria`: categoria e tipo.
- `TabSubcategoria`: subcategoria e categoria.
- `TabInst`: instituição, tipo, saldo inicial e saldo atual.
- `Tabela7`: registro de arquivos OFX importados.
- `Tabela9`: registro de pagamentos de cartões.

## Fórmulas e regras

- Categoria automática: a descrição busca correspondência em subcategorias.
- Conta/cartão automático: a instituição busca tipo e saldo na tabela de instituições.
- Mês e ano: derivados da data.
- Resultado: categoria busca o tipo financeiro.
- Saldo de lançamento: receita soma, despesa subtrai e tipos neutros não alteram saldo diretamente.
- Saldo atual de conta: saldo inicial + receitas + transferências recebidas - despesas - transferências enviadas - faturas.
- Conferência de fatura: compara pagamento da fatura com gastos de cartão no período e indica divergências.

## Macros identificadas

- `ordenar`: ordena lançamentos por data.
- `lancar_movimento`: seleciona a próxima linha vazia de lançamentos.
- `limpa_filtro`: limpa filtros e segmentações.
- `Atualizar`: recalcula pivôs, filtra painéis e atualiza dashboard.
- `AjustarZoomParaImagem` e `minimizar`: alternam modo visual.
- `transf_contas_banco`: abre formulário de transferência entre contas.
- `insere_contas_fut`: abre formulário de parcelamento/contas futuras.
- `pagamento_fatura_cartao`: abre formulário de pagamento de fatura.
- `importar`: abre formulário de importação OFX.

## Transferência entre contas

Regras migradas:

- Exige banco de saída, banco de entrada, valor e data.
- Bloqueia transferência entre a mesma conta.
- Valida data.
- Cria dois lançamentos realizados:
  - `Envio para outra conta`, na instituição de saída.
  - `Recebimento de outra conta`, na instituição de entrada.
- Observações registram origem e destino.
- O sistema web vincula os lançamentos com `transfer_group_id`.

## Parcelamento e contas futuras

Regras migradas e ampliadas:

- Usa descrição, valor da parcela, número de parcelas, primeira data, instituição e subcategoria.
- Cria lançamentos mensais para cada parcela.
- Parcelas futuras entram como `Previsto`.
- O sistema web registra grupo de parcelamento.
- O valor original da compra pode ser diferente da soma das parcelas.
- A diferença vira juros embutidos.
- Permite antecipar, quitar e reabrir parcelas.
- Clicar em uma parcela alterna o status quando aplicável.

## Pagamento de fatura

Regras migradas:

- Exige cartão, mês, ano e conta de pagamento.
- Lista os lançamentos do cartão no período.
- Soma o valor encontrado.
- Marca lançamentos do cartão como realizados.
- Cria lançamento `Pagamento de Fatura` na conta informada.
- Registra pagamento em tabela própria.

## Importação OFX

Regras migradas e ampliadas:

- Usuário escolhe uma conta do tipo `Conta`.
- Lê arquivo `.ofx`.
- Extrai data, descrição, valor e identificadores.
- Insere transações como realizadas.
- Ordena por data antes de inserir.
- Registra arquivo importado.
- O sistema web usa hash do arquivo e FITID para evitar duplicados.

## Tradução para o sistema web

- Fórmulas viraram regras de backend.
- Pivôs viraram consultas agregadas SQLite.
- Formulários VBA viraram telas e modais.
- `REGISTRO` virou `ofx_imports` e `card_payments`.
- Parcelamentos recebem `installment_group_id`.
- Transferências recebem `transfer_group_id`.
- Anexos foram adicionados como recurso novo.
- Personalização e dashboards configuráveis foram adicionados como evolução do painel original.
