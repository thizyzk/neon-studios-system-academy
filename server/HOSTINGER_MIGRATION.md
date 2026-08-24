# Migracao segura do Render para Hostinger

Nao exclua o Render antes de concluir todos os testes deste documento. A migracao usa a hospedagem gerenciada de aplicativos web da Hostinger; nao exige VPS, root, PM2 ou Nginx.

## Plano indicado

Escolha `Hospedagem de aplicativos web Business` somente depois de conferir o valor total no checkout. O preco promocional normalmente exige pagamento antecipado de varios anos e a renovacao e mais cara.

O aplicativo continua usando:

- Hostinger para Node.js, arquivos estaticos, HTTPS e dominio;
- Neon para PostgreSQL;
- Cloudflare R2 para audios;
- Stripe para pagamentos;
- Cloudflare DNS opcionalmente, depois da primeira publicacao.

Nao guarde banco, audios ou segredos nos 50 GB da hospedagem web.

## 1. Criar o aplicativo

1. No hPanel, abra `Sites` ou `Aplicativos web`.
2. Escolha criar um aplicativo Node.js a partir do GitHub.
3. Conecte `thizyzk/neon-studios-system-academy` e a branch `main`.
4. Use a raiz do repositorio como diretorio do projeto.
5. Se a Hostinger solicitar comandos, use `npm install` para build/install e `npm start` para iniciar.
6. Escolha Node.js 22 LTS ou uma versao LTS mais nova compativel com `>=20`.
7. Nao informe uma porta fixa: a aplicacao le a variavel `PORT` fornecida pela hospedagem.

## 2. Variaveis de ambiente

Cadastre no hPanel as variaveis abaixo. Copie os valores secretos do Render um por vez e nunca cole chaves em chat, commit ou captura de tela.

```text
NODE_ENV=production
TRUST_PROXY=true
PUBLIC_BASE_URL=https://URL-TEMPORARIA-DA-HOSTINGER
DEPLOYMENT_REVISION=hostinger-1
AUTH_SESSION_SECRET=<o mesmo valor fixo usado no Render>
AUTH_SESSION_MAX_AGE_SECONDS=604800
AUTH_RATE_LIMIT_MAX=8
AUTH_RATE_LIMIT_WINDOW_SECONDS=600
GOOGLE_CLIENT_ID=<valor atual>
GOOGLE_ALLOWED_EMAIL_DOMAIN=
ADMIN_EMAILS=<emails owner separados por virgula>
RECAPTCHA_SITE_KEY=<valor atual>
RECAPTCHA_SECRET_KEY=<valor atual>
RECAPTCHA_VERSION=v3
RECAPTCHA_ACTION=login
RECAPTCHA_MINIMUM_SCORE=0.5
RECAPTCHA_ALLOWED_HOSTNAMES=<host temporario, dominio final e www separados por virgula>
DATABASE_URL=<URL pooled do Neon>
COMMUNITY_ENABLED=false
PROMOTIONAL_PRICES_VERIFIED=false
STRIPE_AUTOMATIC_TAX=false
STRIPE_ALLOW_PROMOTION_CODES=false
```

Adicione tambem os cinco `STRIPE_PRICE_*`, as duas chaves Stripe, `PEXELS_API_KEY` e as credenciais `R2_*` somente quando cada servico estiver configurado. Variavel vazia pode ser omitida.

## 3. Liberar o host temporario

Antes de testar login na URL temporaria:

1. Adicione a origem HTTPS temporaria no cliente OAuth Web do Google.
2. Adicione somente o hostname temporario no reCAPTCHA, sem `https://` e sem caminho.
3. Confirme que `PUBLIC_BASE_URL` usa a URL temporaria exata.
4. Publique novamente.

## 4. Testar antes do dominio

Abra `/health` e confirme `ok: true`. Depois teste login, logout, `/#admin`, aulas, tutor, compilador e visualizador. Quando banco e armazenamento estiverem prontos, teste progresso em dois navegadores e upload/exclusao de audio.

Nao habilite Stripe live durante a migracao. No modo de teste, recrie o webhook apontando para:

```text
https://URL-TEMPORARIA-DA-HOSTINGER/api/commerce/webhook
```

## 5. Mover o dominio

1. Adicione o dominio no aplicativo Hostinger e espere o SSL ficar ativo.
2. Altere `PUBLIC_BASE_URL` para a URL final.
3. Atualize `RECAPTCHA_ALLOWED_HOSTNAMES`.
4. Adicione dominio raiz e `www` no Google OAuth e reCAPTCHA.
5. Atualize o webhook Stripe para `https://DOMINIO/api/commerce/webhook`.
6. Teste novamente login, compra de teste e Customer Portal.

Se o DNS estiver no Cloudflare, troque os registros para o destino informado pela Hostinger. Mantenha `DNS only` ate a Hostinger emitir o certificado; depois avalie ativar o proxy.

## 6. Encerrar o Render

Mantenha os dois servicos por pelo menos 48 horas depois da troca de DNS. So entao:

1. confirme que o dominio resolve exclusivamente para a Hostinger;
2. confirme que nenhum webhook Stripe continua chegando ao Render;
3. exporte logs ou configuracoes que queira preservar;
4. suspenda o Web Service do Render primeiro;
5. aguarde mais 24 horas e, se tudo continuar normal, exclua o servico.

Remova o host `onrender.com` do Google OAuth, reCAPTCHA, CORS do R2 e Stripe apenas depois da exclusao.
