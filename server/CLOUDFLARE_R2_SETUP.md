# Cloudflare R2 para audios do tutor

O codigo usa um bucket privado. O navegador recebe URLs assinadas de curta duracao e nunca recebe a chave secreta do R2.

## 1. Criar o bucket

1. Entre no Cloudflare Dashboard.
2. Abra `Storage & databases > R2 > Overview`.
3. Ative o R2 e crie o bucket `neon-academy-audio` com classe `Standard`.
4. Nao habilite `r2.dev` nem acesso publico.

## 2. Criar credenciais limitadas

1. Em R2, abra `Manage API Tokens`.
2. Crie um token `Object Read & Write`.
3. Restrinja o token somente ao bucket `neon-academy-audio`.
4. Guarde o `Access Key ID` e o `Secret Access Key`. O segredo aparece uma unica vez.
5. Copie tambem o `Account ID` mostrado no endpoint S3.

## 3. Configurar CORS

No bucket, abra `Settings > CORS Policy > Add CORS policy` e salve:

```json
[
  {
    "AllowedOrigins": [
      "https://neon-studios-system-academy.onrender.com",
      "https://neonstudiosacademy.com.br",
      "https://www.neonstudiosacademy.com.br",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type", "Accept-Ranges", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

As origens devem ser exatas e nao podem terminar com `/`.

## 4. Configurar exclusao automatica

Em `Settings > Object lifecycle rules`, adicione uma regra:

- Prefixo: `tutor-audio/`
- Acao: excluir
- Idade: 30 dias

O PostgreSQL tambem deixa de emitir URLs depois da retencao configurada. A lifecycle rule remove o arquivo fisico e evita custo acumulado.

## 5. Adicionar no Render

No Web Service, abra `Environment` e adicione:

```text
DATABASE_URL=<internal database url do Render Postgres>
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET_NAME=neon-academy-audio
R2_SIGNED_URL_TTL_SECONDS=300
R2_AUDIO_RETENTION_DAYS=30
```

Salve e aguarde o deploy. Em `/health`, estes campos devem ficar `true`:

```json
{
  "learningSyncConfigured": true,
  "audioStorageConfigured": true
}
```

## Limites iniciais

- Conta comum: 60 segundos, 3 MB e 10 audios por dia.
- Plus: 5 minutos, 10 MB e 100 audios por dia.
- Formatos: WebM/Opus, Ogg/Opus, MP3, M4A e WAV.
- URL assinada: 5 minutos.
- Retencao padrao: 30 dias.

O `Content-Type` faz parte da assinatura. Alterar o tipo no `PUT` faz o R2 recusar o envio.
