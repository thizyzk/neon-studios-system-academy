# Lançamento da Neon Studios System Academy

Este é o roteiro operacional do código atual. Execute na ordem. Não habilite compras reais antes de todas as verificações automáticas do painel Administração ficarem verdes e as verificações manuais serem concluídas.

## Arquitetura recomendada de baixo custo

| Necessidade | Serviço | O que guardar |
| --- | --- | --- |
| Aplicação Node | Render | Site, API, login, webhooks e URLs assinadas |
| Dados relacionais | Neon Postgres | Usuários, progresso, mensagens de texto, saldo, ledger, cargos e metadados de áudio |
| Arquivos | Cloudflare R2 Standard | Áudios privados do tutor |
| Pagamentos | Stripe Checkout/Billing | Cartão, assinatura, faturas, reembolsos e Customer Portal |
| DNS | Cloudflare DNS | Domínio próprio apontando para o Render |

O plano gratuito atual do Neon informa 0,5 GB por projeto. Isso é suficiente para o início porque áudios não entram no PostgreSQL. O R2 Standard possui franquia gratuita mensal e não cobra egress direto. Confirme preços nas páginas oficiais antes do lançamento:

- https://neon.com/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://stripe.com/br/pricing

## 1. Ativar PostgreSQL

1. Crie uma conta em https://console.neon.tech/.
2. Crie um projeto chamado `neon-studios-academy`.
3. Escolha uma região próxima do público quando estiver disponível.
4. Abra `Connection Details` e selecione a URL com pool de conexões.
5. Copie a URL completa. Ela normalmente começa com `postgresql://` e inclui `sslmode=require`.
6. No Render, abra o Web Service > `Environment`.
7. Crie `DATABASE_URL` com essa URL e marque como secret.
8. Configure `ADMIN_EMAILS` com o e-mail Google do proprietário. Mais de um e-mail deve ser separado por vírgula.
9. Salve e aguarde o deploy.
10. Abra `/health`. Estes campos devem mudar para `true`: `learningSyncConfigured` e `administrationConfigured`.
11. Entre novamente. O primeiro login cria as tabelas automaticamente e registra o owner.

Nunca coloque áudios, imagens ou vídeos no PostgreSQL. O banco guarda somente texto, IDs, datas, tamanhos e extratos.

## 2. Configurar Stripe em modo de teste

### Criar produtos e preços

No Stripe Dashboard, mantenha o modo de teste ativo e crie:

| Produto | Tipo | Valor | Variável no Render |
| --- | --- | ---: | --- |
| Neon Academy Plus | Recorrente mensal | R$ 129,90 | `STRIPE_PRICE_PLUS_MONTHLY` |
| 50 Cubic Energy | Uma vez | R$ 14,99 | `STRIPE_PRICE_ENERGY_50` |
| 150 Cubic Energy | Uma vez | R$ 39,90 | `STRIPE_PRICE_ENERGY_150` |
| 500 Cubic Energy | Uma vez | R$ 59,90 | `STRIPE_PRICE_ENERGY_500` |
| 1000 Cubic Energy | Uma vez | R$ 99,90 | `STRIPE_PRICE_ENERGY_1000` |

1. Copie cada ID que começa com `price_` para a variável correspondente.
2. Copie a chave secreta de teste `sk_test_...` para `STRIPE_SECRET_KEY`.
3. Não use o ID de Product (`prod_...`) no lugar do Price ID.
4. Mantenha `PROMOTIONAL_PRICES_VERIFIED=false`. Isso oculta preços riscados.
5. Mantenha `STRIPE_AUTOMATIC_TAX=false` até um profissional fiscal definir a configuração correta.
6. Use `STRIPE_ALLOW_PROMOTION_CODES=true` somente depois de criar regras de cupom no Stripe.
7. Em Stripe > Settings > Public details, configure o nome, suporte, `https://SEU-DOMINIO/terms` e `https://SEU-DOMINIO/privacy`. O Checkout exige aceite dos Termos.

### Criar webhook

Crie um endpoint em Stripe > Developers > Webhooks:

```text
https://SEU-DOMINIO/api/commerce/webhook
```

Eventos necessários:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.closed
```

Copie `whsec_...` para `STRIPE_WEBHOOK_SECRET`.

### Customer Portal

1. Abra Stripe > Billing > Customer Portal.
2. Ative atualização de método de pagamento, histórico de faturas e cancelamento.
3. Configure o comportamento do cancelamento: imediato ou no fim do período.
4. Configure branding, nome público e contato de suporte.
5. Faça uma assinatura de teste e use `Gerenciar assinatura` dentro da Academy.

### Testes obrigatórios

1. Comprar cada pacote uma vez.
2. Reenviar o mesmo evento e provar que não duplica energia.
3. Cancelar Plus e confirmar `plusActive=false`.
4. Simular `invoice.payment_failed`.
5. Reembolsar uma compra e verificar o extrato.
6. Repetir a mesma requisição com o mesmo `requestId` e confirmar que o Stripe não cria outra sessão.
7. Verificar consentimento dos Termos no Checkout.

Somente depois troque `sk_test_` e o webhook de teste pelas credenciais live. Price IDs de teste e live são diferentes.

## 3. Configurar Cloudflare R2

1. No Cloudflare Dashboard, abra R2 e crie `neon-academy-audio` com classe Standard.
2. Mantenha o bucket privado. Não habilite `r2.dev`.
3. Crie um token `Object Read & Write` restrito somente a esse bucket.
4. Configure no Render:

```text
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=neon-academy-audio
R2_SIGNED_URL_TTL_SECONDS=300
R2_AUDIO_RETENTION_DAYS=30
```

5. Adicione a política CORS descrita em `CLOUDFLARE_R2_SETUP.md`.
6. Crie uma lifecycle rule que exclui `tutor-audio/` depois de 30 dias.
7. Faça upload, reprodução e exclusão em Chrome, Firefox e celular.
8. Confira `/health`: `audioStorageConfigured=true`.

URLs assinadas R2 funcionam no domínio S3 da Cloudflare, não em um domínio personalizado do bucket. Trate a URL como um token temporário.

## 4. Ligar domínio Cloudflare ao Render

1. Adicione `neonstudiosacademy.com.br` em Render > Settings > Custom Domains.
2. No Cloudflare DNS, remova registros `AAAA` conflitantes.
3. Crie CNAME `@` apontando para `neon-studios-system-academy.onrender.com`.
4. Crie CNAME `www` para o mesmo destino.
5. Deixe ambos como `DNS only` durante a verificação.
6. Em Cloudflare SSL/TLS, use modo `Full`.
7. Volte ao Render e clique em Verify.
8. Depois do certificado válido, o proxy laranja pode ser ativado opcionalmente.
9. No Render, defina `PUBLIC_BASE_URL=https://neonstudiosacademy.com.br`.
10. Defina `RECAPTCHA_ALLOWED_HOSTNAMES=neonstudiosacademy.com.br,www.neonstudiosacademy.com.br`.

Documentação oficial:

- https://render.com/docs/configure-cloudflare-dns
- https://render.com/docs/custom-domains

## 5. Atualizar Google e reCAPTCHA

No cliente OAuth Web do Google, adicione exatamente:

```text
https://neonstudiosacademy.com.br
https://www.neonstudiosacademy.com.br
https://neon-studios-system-academy.onrender.com
http://localhost:3000
```

No reCAPTCHA, mantenha apenas hostnames, sem `https://` e sem caminho. Inclua o domínio raiz, `www` e o host Render enquanto ele continuar acessível.

## 6. Pexels para membros Plus

1. Solicite uma chave em https://www.pexels.com/api/.
2. Configure `PEXELS_API_KEY` no Render.
3. Teste busca de foto e vídeo usando uma conta Plus.
4. Confirme que a atribuição do criador e do Pexels aparece.
5. Confira `/health`: `pexelsConfigured=true`.

## 7. Revisão comercial e suporte

Antes de aceitar dinheiro real:

1. Defina quem é o vendedor responsável e os dados públicos da operação.
2. Revise Termos e Privacidade com profissionais jurídicos.
3. Defina emissão fiscal e tributação com profissional contábil.
4. Documente política de reembolso e direito de arrependimento aplicável.
5. Defina canal e prazo de suporte.
6. Configure e-mails de pagamento, falha e cancelamento no Stripe.
7. Não ative preços promocionais sem histórico comprovável.

## 8. QA final

Teste em mobile, tablet e desktop:

- login, logout, sessão expirada e conta banida;
- compra, retorno do checkout, atualização por webhook e extrato;
- cancelamento no portal e falha de pagamento;
- progresso em dois dispositivos;
- upload, reprodução, expiração e exclusão de áudio;
- temas Plus, Pexels e perda de entitlement;
- painel admin, hierarquia, ban, revogação e auditoria;
- teclado, leitor de tela, movimento reduzido e contraste;
- instalação PWA, cache offline e atualização do service worker.

## Recursos que continuam deliberadamente bloqueados

- Comunidade, chat, grupos, imagens e WebRTC: exigem idade, consentimento, bloqueio, denúncia, moderação e resposta a incidentes.
- Tutor com LLM externo: o tutor atual usa o conteúdo local e não envia scripts a um modelo. Escolher um provedor exige orçamento, política de dados, limites e proteção contra prompt injection.
- Mythic e Legendary vendidos separadamente: falta definir preço e entitlement permanente. Não invente valores nem venda antes desse contrato existir no ledger.
- RBXM totalmente fiel a todo Roblox Studio: o visualizador exporta o subconjunto indexado e não executa runtime Roblox no navegador.

## Integrações opcionais

- TikTok Reels: configure `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` e `ROBLOX_SHARED_SECRET` no Render. Entre como `owner` antes de abrir `/auth/tiktok`; os tokens ficam criptografados no PostgreSQL.
- Roblox: nunca coloque `ROBLOX_SHARED_SECRET` em LocalScript. Ele pertence somente a scripts de servidor e deve ser trocado se aparecer em log, imagem ou repositório.

## Como conferir o estado

Entre como owner, abra `Administração` e consulte `Prontidão da Academy`. A API privada equivalente é:

```text
GET /api/admin/readiness
```

A rota pública `/health` mostra somente estados gerais e deve terminar com:

```json
{
  "authConfigured": true,
  "learningSyncConfigured": true,
  "administrationConfigured": true,
  "commerceConfigured": true,
  "audioStorageConfigured": true,
  "pexelsConfigured": true
}
```
