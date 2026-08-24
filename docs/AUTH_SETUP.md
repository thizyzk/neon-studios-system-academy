# Neon Studios System Academy: login e domínio

A Academy é servida pelo backend em `server/`. Quando esse servidor é usado, a rota `/` exige uma sessão válida. Abrir `index.html` diretamente por `file://` continua sendo apenas um modo local sem autenticação.

## 1. Instalar e executar localmente

```powershell
cd server
npm install
npm start
```

Abra `http://localhost:3000`. Enquanto as chaves não forem configuradas, a tela de login informa quais variáveis estão faltando.

## 2. Criar o cliente Google

1. No Google Cloud, crie ou selecione um projeto.
2. Configure o Google Auth Platform e a tela de consentimento.
3. Crie um OAuth Client ID do tipo **Web application**.
4. Em **Authorized JavaScript origins**, adicione:
   - `http://localhost:3000`
   - `https://guia.seudominio.com.br`
5. Copie o Client ID para `GOOGLE_CLIENT_ID`.

O fluxo usa o botão Google Identity Services em modo popup. O ID token volta ao navegador e é validado no servidor com `google-auth-library`. Um Client Secret não é colocado no frontend.

## 3. Criar o reCAPTCHA

1. Crie uma chave **reCAPTCHA v3**.
2. Cadastre `neon-studios-system-academy.onrender.com` e, quando existir, `neonstudiosacademy.com.br`.
3. Copie a chave pública para `RECAPTCHA_SITE_KEY`.
4. Copie o segredo para `RECAPTCHA_SECRET_KEY`.
5. Liste os hosts em `RECAPTCHA_ALLOWED_HOSTNAMES`.

O backend envia o token para o endpoint `siteverify` e confere o hostname, a ação `login` e a pontuação mínima devolvidos pelo Google.

## 4. Configurar `server/.env`

Não coloque segredos em arquivos do site. Adicione ao `server/.env` existente:

```dotenv
PORT=3000
PUBLIC_BASE_URL=https://neon-studios-system-academy.onrender.com
GOOGLE_CLIENT_ID=000000000000-exemplo.apps.googleusercontent.com
GOOGLE_ALLOWED_EMAIL_DOMAIN=
RECAPTCHA_SITE_KEY=sua_chave_publica
RECAPTCHA_SECRET_KEY=seu_segredo
RECAPTCHA_VERSION=v3
RECAPTCHA_ACTION=login
RECAPTCHA_MINIMUM_SCORE=0.5
RECAPTCHA_ALLOWED_HOSTNAMES=neon-studios-system-academy.onrender.com
AUTH_SESSION_SECRET=gere_uma_chave_aleatoria_com_32_bytes_ou_mais
AUTH_SESSION_MAX_AGE_SECONDS=604800
AUTH_RATE_LIMIT_MAX=8
AUTH_RATE_LIMIT_WINDOW_SECONDS=600
TRUST_PROXY=true
```

Deixe `GOOGLE_ALLOWED_EMAIL_DOMAIN` vazio para aceitar qualquer conta Google verificada. Para aceitar somente contas administradas por um Google Workspace, use o domínio exato, por exemplo `minhaempresa.com.br`.

Gere `AUTH_SESSION_SECRET` uma única vez e mantenha o mesmo valor no Render:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

A sessão é assinada e fica no cookie `HttpOnly`; por isso ela sobrevive à hibernação do Render Free sem disco. Trocar essa variável invalida todas as sessões existentes.

## 5. Apontar o domínio

1. Publique a pasta do projeto em um host que execute Node.js 20 ou superior.
2. Configure o comando de inicialização como `cd server && npm start`.
3. Aponte no DNS um `A`, `AAAA` ou `CNAME` conforme as instruções do host.
4. Ative HTTPS no domínio.
5. Defina `PUBLIC_BASE_URL` com a origem exata, sem barra final.
6. Se houver proxy reverso, mantenha `TRUST_PROXY=true` e só aceite headers do proxy confiável.

Para a configuração pública do Google, verifique a propriedade de domínio no Google Search Console por registro TXT e adicione o domínio autorizado no Google Auth Platform.

## 6. Antes de publicar

- Substitua o e-mail de exemplo em `privacy.html` e `terms.html`.
- Use as mesmas URLs de privacidade e termos na tela de consentimento Google.
- Nunca publique `server/.env`, `AUTH_SESSION_SECRET` ou a chave secreta do reCAPTCHA.
- Teste login, logout, CAPTCHA expirado, conta não autorizada e sessão vencida.
- Confirme que o cookie de produção aparece como `__Host-neon_academy_session`, `Secure`, `HttpOnly`, `SameSite=Lax` e `Path=/`.
