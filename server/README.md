# Neon Studios System Academy Server

Servidor Node.js da Academy: Google Identity, reCAPTCHA, progresso opcional em PostgreSQL, loja Stripe com ledger de energia e integracao TikTok/Roblox.

Para configurar monetizacao e entender por que os recursos sociais continuam bloqueados, leia [MONETIZATION_AND_COMMUNITY.md](./MONETIZATION_AND_COMMUNITY.md).

Para configurar mensagens de voz privadas, leia [CLOUDFLARE_R2_SETUP.md](./CLOUDFLARE_R2_SETUP.md).

Para publicar banco, Stripe, Cloudflare, dominio e fazer o QA final na ordem correta, siga [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md).

Para publicar no plano gratuito do Cloudflare Workers sem interromper o Render, siga [CLOUDFLARE_WORKERS_SETUP.md](./CLOUDFLARE_WORKERS_SETUP.md).

O guia [HOSTINGER_MIGRATION.md](./HOSTINGER_MIGRATION.md) permanece apenas como alternativa futura de hospedagem Node.js tradicional.

## Execucao local

1. Copie `.env.example` para `.env` e preencha somente os valores usados.
2. Instale e inicie:

```powershell
npm install
npm start
```

3. Abra `http://localhost:3000`.

Sem `DATABASE_URL`, a loja permanece indisponivel e o progresso usa o navegador. Esse comportamento e intencional.

## Administracao

1. Defina os e-mails proprietarios em `ADMIN_EMAILS`, separados por virgula.
2. Configure `DATABASE_URL`; ela armazena cargos, bans, versoes de sessao e auditoria.
3. Entre novamente com uma conta de `ADMIN_EMAILS`. Ela recebe o cargo `owner` e nao pode ser removida do bootstrap pelo painel.
4. Abra `/#admin` e crie a hierarquia: `support`, `moderator`, `administrator` e `owner`.

Permissoes sao verificadas em cada endpoint. Esconder o item de navegacao e apenas uma camada de interface; o bloqueio real esta no servidor. Expulsar ou banir incrementa a versao da sessao e invalida cookies anteriores.

## Theme Studio e Pexels

O Theme Studio usa `PEXELS_API_KEY` somente no servidor. A rota de busca exige sessao, Plus ativo no PostgreSQL e aplica limite por usuario. Mantenha os creditos Pexels visiveis.

Os presets Mythic, Legendary e Cute estao no catalogo visual, mas permanecem bloqueados ate existirem preco e entitlement proprios no Stripe. Nao libere um tema pago apenas por `localStorage`.

## Luau Studio

O compilador oficial esta hospedado em `/luau/` e roda WebAssembly no navegador. O bundle vem de `luau-lang/playground`; veja `docs/economy-systems-guide/THIRD_PARTY_NOTICES.md`.

Luau standalone valida linguagem, tipos e bytecode. Ele nao executa servicos do runtime Roblox. `DataStoreService`, `Players` e equivalentes ainda devem ser testados no Roblox Studio ou em servidores Roblox.

## TikTok Reels

Proxy seguro entre o Roblox e a TikTok Display API.

## Como usar

1. Crie um app no TikTok Developer Portal.
2. Adicione Login Kit e Display API ao app.
3. Peça/aprove os escopos `user.info.basic` e `video.list`.
4. Copie `server/.env.example` para `server/.env` e preencha as credenciais.
5. Rode:

```powershell
cd server
npm start
```

6. Abra `http://localhost:3000/auth/tiktok` no navegador e autorize a conta TikTok que fornecerá os reels.
7. Publique este servidor em HTTPS antes de usar em produção e configure `ServerUrl` em `src/ServerScriptService/Config/TikTokReelsConfig.luau`.

Com `DATABASE_URL`, o servidor salva tokens TikTok criptografados no PostgreSQL. Sem banco, o arquivo local `server/.data/tiktok-session.json` continua disponível apenas para desenvolvimento. Somente uma conta `owner` pode iniciar ou concluir essa conexão.

## Baixar vídeos de natureza/ambientação

Use a Pexels API para baixar vídeos royalty-free em vez de baixar vídeos de terceiros do TikTok.

1. Crie uma chave em https://www.pexels.com/api/
2. Adicione ao `server/.env`:

```powershell
PEXELS_API_KEY=sua_chave
```

3. Rode:

```powershell
npm run download:ambient-videos -- --query "nature ambience forest river" --count 5
```

Os vídeos serão salvos em `assets/ambient-videos/`, junto com `manifest.json`.
