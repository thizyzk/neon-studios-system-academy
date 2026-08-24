# Publicar a Academy no Cloudflare Workers

Esta migracao e paralela. O Render continua funcionando ate o Worker passar por todos os testes.

## O que ja esta preparado

- `wrangler.jsonc`: configuracao do Worker e dos assets estaticos.
- `server/src/worker.js`: ponte entre Cloudflare Workers e o servidor Node existente.
- `npm run cf:build`: monta os arquivos publicos sem expor o backend.
- `npm run cf:check`: gera o bundle sem publicar.
- `npm run cf:dev`: executa localmente em `http://localhost:8787`.
- `npm run cf:deploy`: publica uma nova versao.

O site continua protegido por login. `/login`, Termos, Privacidade e os arquivos usados pelo login sao publicos; o restante exige um cookie de sessao assinado.

## 1. Criar a conta e o subdominio Workers

1. Acesse <https://dash.cloudflare.com/> e crie ou entre na conta gratuita.
2. No menu, abra **Workers & Pages**.
3. Escolha **Create application** e depois **Workers**.
4. O nome usado pelo projeto e `neon-studios-system-academy`.
5. A Cloudflare criara um endereco parecido com `neon-studios-system-academy.SEUSUBDOMINIO.workers.dev`.
6. Anote o endereco completo. Ele sera o ambiente de teste antes do dominio oficial.

## 2. Autorizar o Wrangler sem administrador

No terminal, na raiz do repositorio:

```powershell
npx wrangler login
```

O navegador abrira a pagina oficial da Cloudflare. Autorize a conta. Esse comando nao exige permissao de administrador do Windows.

Confira a conta:

```powershell
npx wrangler whoami
```

## 3. Configurar valores publicos

No painel Cloudflare, abra **Workers & Pages > neon-studios-system-academy > Settings > Variables and Secrets**.

Crie como texto:

```text
PUBLIC_BASE_URL=https://neon-studios-system-academy.SEUSUBDOMINIO.workers.dev
DEPLOYMENT_REVISION=cloudflare-preview
GOOGLE_ALLOWED_EMAIL_DOMAIN=
ADMIN_EMAILS=seu-email-google@gmail.com
RECAPTCHA_VERSION=v3
RECAPTCHA_ACTION=login
RECAPTCHA_MINIMUM_SCORE=0.5
RECAPTCHA_ALLOWED_HOSTNAMES=neon-studios-system-academy.SEUSUBDOMINIO.workers.dev
AUTH_SESSION_MAX_AGE_SECONDS=604800
AUTH_RATE_LIMIT_MAX=8
AUTH_RATE_LIMIT_WINDOW_SECONDS=600
R2_BUCKET_NAME=neon-academy-audio
R2_SIGNED_URL_TTL_SECONDS=300
R2_AUDIO_RETENTION_DAYS=30
STRIPE_AUTOMATIC_TAX=false
STRIPE_ALLOW_PROMOTION_CODES=false
PEXELS_API_KEY=
```

Nao coloque `https://` em `RECAPTCHA_ALLOWED_HOSTNAMES`; ali entra apenas o hostname.

## 4. Configurar segredos

Na mesma tela, use **Encrypt** para estes valores. Copie os valores que ja estao funcionando no Render, sem publica-los no GitHub:

```text
GOOGLE_CLIENT_ID
RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET_KEY
AUTH_SESSION_SECRET
DATABASE_URL
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PLUS_MONTHLY
STRIPE_PRICE_ENERGY_50
STRIPE_PRICE_ENERGY_150
STRIPE_PRICE_ENERGY_500
STRIPE_PRICE_ENERGY_1000
PEXELS_API_KEY
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
ROBLOX_SHARED_SECRET
```

Variaveis de recursos ainda nao configurados podem ficar ausentes. Para o primeiro teste de login, sao obrigatorios `GOOGLE_CLIENT_ID`, as duas chaves reCAPTCHA e `AUTH_SESSION_SECRET`. Para persistencia e painel administrativo, `DATABASE_URL` tambem e obrigatoria.

O `AUTH_SESSION_SECRET` deve permanecer exatamente igual ao do Render durante a migracao. Isso evita invalidar sessoes sem necessidade.

## 5. Publicar o ambiente de teste

Execute:

```powershell
npm run cf:check
npm run cf:deploy
```

Abra primeiro:

```text
https://neon-studios-system-academy.SEUSUBDOMINIO.workers.dev/health
https://neon-studios-system-academy.SEUSUBDOMINIO.workers.dev/login
```

O health check deve retornar `"ok": true`. O login pode continuar bloqueado ate os dominios Google e reCAPTCHA serem autorizados.

## 6. Autorizar o novo endereco no Google

No Google Cloud Console, abra o cliente OAuth Web usado pela Academy e adicione em **Authorized JavaScript origins**:

```text
https://neon-studios-system-academy.SEUSUBDOMINIO.workers.dev
```

No painel do reCAPTCHA, adicione em **Domains**:

```text
neon-studios-system-academy.SEUSUBDOMINIO.workers.dev
```

Salve e aguarde alguns minutos. Nao remova o endereco do Render ainda.

## 7. Testes obrigatorios antes do dominio

1. Abrir `/login` em janela anonima.
2. Entrar com Google e confirmar o redirecionamento para `/`.
3. Atualizar a pagina e confirmar que a sessao permanece.
4. Salvar progresso e abrir em outro navegador.
5. Conferir o painel administrativo com o e-mail de `ADMIN_EMAILS`.
6. Gravar, enviar, reproduzir e apagar um audio no R2.
7. Testar Checkout apenas no modo de teste do Stripe.
8. Conferir os logs em **Workers & Pages > Logs**.

## 8. Conectar o dominio depois dos testes

Quando o dominio estiver usando o DNS da Cloudflare:

1. Abra o Worker e escolha **Settings > Domains & Routes > Add > Custom domain**.
2. Adicione `neonstudiosacademy.com.br` e depois `www.neonstudiosacademy.com.br`.
3. Atualize `PUBLIC_BASE_URL` para `https://neonstudiosacademy.com.br`.
4. Atualize `RECAPTCHA_ALLOWED_HOSTNAMES` com o dominio principal, `www` e o endereco `workers.dev`.
5. Confirme que os dois dominios continuam cadastrados no OAuth Google e no reCAPTCHA.
6. Teste novamente login, progresso, admin, R2 e Stripe.

Mantenha o Render por pelo menos 48 horas depois da troca. So depois remova o servico antigo.

## Limites e protecao de custo

O plano gratuito do Workers possui limites diarios de requisicoes e CPU. O site estatico nao consulta o Neon para cada CSS ou imagem; apenas APIs e validacoes necessarias chegam ao backend. Acompanhe **Workers & Pages > Metrics**. Nao habilite o plano pago nem faturamento automatico antes de entender o consumo real.
