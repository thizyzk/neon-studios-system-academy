# Neon Studios System Academy Server

Servidor Node.js da Academy: Google Identity, reCAPTCHA, progresso opcional em PostgreSQL, loja Stripe com ledger de energia e integracao TikTok/Roblox.

Para configurar monetizacao e entender por que os recursos sociais continuam bloqueados, leia [MONETIZATION_AND_COMMUNITY.md](./MONETIZATION_AND_COMMUNITY.md).

Para configurar mensagens de voz privadas, leia [CLOUDFLARE_R2_SETUP.md](./CLOUDFLARE_R2_SETUP.md).

## Execucao local

1. Copie `.env.example` para `.env` e preencha somente os valores usados.
2. Instale e inicie:

```powershell
npm install
npm start
```

3. Abra `http://localhost:3000`.

Sem `DATABASE_URL`, a loja permanece indisponivel e o progresso usa o navegador. Esse comportamento e intencional.

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

O servidor salva tokens em `server/.data/tiktok-session.json`, que é ignorado pelo Git.

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
