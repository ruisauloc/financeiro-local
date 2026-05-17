# Segurança

Este sistema foi desenhado para uso local, rede privada ou VPN. Ele não deve ser exposto diretamente na internet sem uma camada adicional de segurança.

## Modelo atual

- Primeiro acesso cria uma senha local.
- A senha é armazenada com hash PBKDF2 no SQLite.
- O login gera uma sessão independente por navegador ou dispositivo.
- A sessão é enviada por cookie HTTP-only.
- As rotas da API exigem sessão autenticada.
- Os anexos também exigem sessão.
- O CORS aceita origens locais e redes privadas esperadas.

## Uso recomendado

- Rode em uma máquina confiável.
- Acesse via rede local ou VPN.
- Use uma senha forte no primeiro acesso.
- Não publique `financeiro.sqlite`, anexos, OFX ou planilhas pessoais.
- Faça backup periódico do banco e dos anexos.

## Arquivos sensíveis

Os seguintes itens ficam fora do GitHub:

- `financeiro.sqlite`
- `financeiro.sqlite-wal`
- `financeiro.sqlite-shm`
- `uploads/`
- `OFX/`
- planilhas pessoais
- arquivos extraídos da planilha original
- `.env`

## Limites conhecidos

- A sessão fica em memória; reiniciar a API derruba logins ativos.
- A aplicação local não usa HTTPS por padrão.
- SQL Server externo ainda é usado como preparação/migração, não como provider ativo completo.

## Melhorias futuras sugeridas

- HTTPS local com certificado próprio.
- Usuários nomeados com permissões.
- Expiração configurável de sessão.
- Tela de dispositivos conectados.
- Exportação de backup criptografado.
- Log de auditoria para exclusões e alterações sensíveis.

