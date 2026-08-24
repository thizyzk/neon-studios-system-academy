# Monetizacao e comunidade

## Estado atual

O catalogo, a interface da loja, o checkout Stripe e o ledger de energia estao implementados. O checkout falha fechado enquanto qualquer um destes itens estiver ausente:

- `DATABASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Isso impede que uma compra exista apenas no navegador. Energia e Plus so mudam depois de um evento Stripe assinado e idempotente.

## Ativar a loja no Render

1. Crie um PostgreSQL persistente e copie a URL interna para `DATABASE_URL`.
2. No Stripe, use o modo de teste primeiro e copie a chave secreta para `STRIPE_SECRET_KEY`.
3. Crie um webhook para `https://neon-studios-system-academy.onrender.com/api/commerce/webhook`.
4. Selecione `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded` e `charge.dispute.created`.
5. Copie o segredo de assinatura do endpoint para `STRIPE_WEBHOOK_SECRET`.
6. Ative o Stripe Customer Portal para permitir cancelamento e gerenciamento da assinatura.
7. Publique e confira `/health`: `commerceConfigured` deve ser `true`.
8. Faca uma compra de teste e confirme que repetir o mesmo evento nao duplica energia.
9. Teste cancelamento, reembolso e saldo insuficiente antes de trocar para chaves de producao.

O Plus usa assinatura mensal. Pacotes de energia usam pagamento unico. Pix pode ser habilitado para pagamentos unicos se estiver disponivel na conta Stripe, mas nao deve ser usado como forma recorrente do Plus.

Os valores riscados da promocao so devem ser publicados quando forem precos anteriores reais e comprovaveis.

## Presentes

Presentes devem usar o mesmo ledger, nunca uma alteracao direta entre navegadores. A proxima fase precisa de:

1. pedido de presente criado no servidor;
2. checkout ou debito atomico de energia;
3. destinatario e remetente imutaveis no ledger;
4. limite diario, antifraude e estorno;
5. confirmacao assinada antes do credito.

## Comunidade e video

Amizades, grupos, imagens, chamadas e transmissoes estao representados na interface, mas bloqueados. `COMMUNITY_ENABLED` nao libera as capacidades por conta propria.

Antes do lancamento, implemente e audite:

- afericao de idade e consentimento aplicavel;
- privacidade por padrao e descoberta limitada;
- bloquear, denunciar, silenciar e sair da sala imediatamente;
- moderacao de texto, imagem, audio e video;
- papeis de grupo e trilha de auditoria;
- limites de envio, retencao minima e exclusao;
- resposta a incidentes e canal de suporte;
- termos e politica de privacidade revisados para o publico real.

Comece com amizades sem chat. Depois adicione grupos de texto moderados. Imagens e WebRTC devem ser as ultimas fases.
