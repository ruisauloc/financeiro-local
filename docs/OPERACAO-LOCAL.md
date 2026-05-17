# Operação Local

## Subir o sistema

```bash
npm run dev
```

## Acessar no computador

```text
http://127.0.0.1:5179
```

## Acessar pelo celular na rede ou VPN

Descubra o IP da máquina onde o app está rodando e abra:

```text
http://IP_DA_MAQUINA:5179
```

Exemplo via VPN:

```text
http://IP_DA_VPN:5179
```

## Portas

- Frontend: `5179`
- API: `6397`

As portas podem ser alteradas dentro do sistema em `Avançado > Geral`. Depois de salvar, reinicie a aplicação.

Também é possível sobrescrever por variável de ambiente:

- `CLIENT_PORT`: porta do Vite/frontend.
- `PORT`: porta da API.

A configuração salva pela tela fica em `runtime-config.json`, que é local e não vai para o GitHub.

## Backup

Para backup completo, copie:

- `financeiro.sqlite`
- pasta configurada de anexos

Se houver arquivos `financeiro.sqlite-wal` e `financeiro.sqlite-shm`, pare a API antes de copiar ou inclua os três arquivos juntos.

## Restauração

1. Pare a aplicação.
2. Substitua o arquivo `financeiro.sqlite`.
3. Restaure a pasta de anexos.
4. Suba novamente com `npm run dev`.

## Publicação no GitHub

Antes de publicar, confira:

```bash
git status --ignored --short
```

Arquivos como banco, anexos, OFX e planilhas devem aparecer como ignorados ou não versionados fora do commit.
