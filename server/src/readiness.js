import { COMMERCE_CATALOG } from "./commerceCatalog.js";

function check(id, label, ready, action, kind = "automatic") {
  return { id, label, ready: ready === true, action, kind };
}

function section(id, label, checks) {
  const automaticChecks = checks.filter((item) => item.kind === "automatic");
  return {
    id,
    label,
    ready: automaticChecks.every((item) => item.ready),
    checks,
  };
}

export function buildReadinessReport(config) {
  const publicUrl = new URL(config.publicBaseUrl);
  const customDomain = !["localhost", "127.0.0.1"].includes(publicUrl.hostname)
    && !publicUrl.hostname.endsWith(".onrender.com");
  const priceIdsReady = COMMERCE_CATALOG.every((product) => String(config.stripePriceIds?.[product.id] || "").startsWith("price_"));
  const sections = [
    section("foundation", "Base e autenticação", [
      check("https", "HTTPS canônico", publicUrl.protocol === "https:", "Defina PUBLIC_BASE_URL com a URL HTTPS usada pelos usuários."),
      check("google", "Google Identity", Boolean(config.googleClientId), "Adicione GOOGLE_CLIENT_ID no Render."),
      check("captcha", "reCAPTCHA", Boolean(config.recaptchaSiteKey && config.recaptchaSecretKey), "Adicione as duas chaves reCAPTCHA no Render."),
      check("session", "Sessão assinada", Buffer.byteLength(config.authSessionSecret || "", "utf8") >= 32, "Mantenha AUTH_SESSION_SECRET fixo com pelo menos 32 bytes."),
      check("database", "PostgreSQL durável", Boolean(config.databaseUrl), "Adicione DATABASE_URL antes de vender ou sincronizar dados."),
    ]),
    section("monetization", "Monetização Stripe", [
      check("stripe-key", "Chave secreta Stripe", Boolean(config.stripeSecretKey), "Adicione STRIPE_SECRET_KEY em modo de teste primeiro."),
      check("stripe-webhook", "Webhook assinado", Boolean(config.stripeWebhookSecret), "Crie o webhook Stripe e adicione STRIPE_WEBHOOK_SECRET."),
      check("stripe-prices", "Price IDs canônicos", priceIdsReady, "Crie os cinco Prices no Stripe e preencha STRIPE_PRICE_* no Render."),
      check("promotion-proof", "Preços promocionais comprovados", config.promotionalPricesVerified, "Só ative PROMOTIONAL_PRICES_VERIFIED após documentar preços anteriores reais.", "manual"),
      check("portal", "Customer Portal testado", false, "Ative e teste cancelamento, faturas e método de pagamento no Stripe Customer Portal.", "manual"),
      check("legal", "Revisão fiscal e jurídica", false, "Revise termos, política, emissão fiscal e CDC com profissionais no Brasil.", "manual"),
    ]),
    section("cloudflare", "Cloudflare e mídia", [
      check("r2-account", "Conta e credenciais R2", Boolean(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey), "Crie um token R2 limitado ao bucket e configure as três credenciais."),
      check("r2-bucket", "Bucket privado", Boolean(config.r2BucketName), "Crie o bucket privado neon-academy-audio."),
      check("r2-cors", "CORS do bucket", false, "Aplique a política CORS para Render, domínio próprio e localhost.", "manual"),
      check("r2-lifecycle", "Lifecycle de 30 dias", false, "Crie a regra de exclusão para o prefixo tutor-audio/.", "manual"),
      check("pexels", "Pexels para fundos Plus", Boolean(config.pexelsApiKey), "Adicione PEXELS_API_KEY para a busca de fundos Plus."),
    ]),
    section("domain", "Domínio e entrega", [
      check("custom-domain", "Domínio próprio", customDomain, "Adicione neonstudiosacademy.com.br ao Render e defina PUBLIC_BASE_URL."),
      check("captcha-host", "Domínio no reCAPTCHA", config.recaptchaAllowedHostnames.includes(publicUrl.hostname), "Inclua o hostname canônico em RECAPTCHA_ALLOWED_HOSTNAMES."),
      check("cloudflare-dns", "DNS e TLS verificados", false, "Valide os CNAMEs no Render e só depois ative o proxy Cloudflare.", "manual"),
      check("oauth-origin", "Origem Google OAuth", false, "Adicione a origem HTTPS canônica no cliente OAuth do Google.", "manual"),
    ]),
    section("experience", "Produto e operação", [
      check("admin", "Administração persistente", Boolean(config.databaseUrl && config.adminEmails.length), "Configure DATABASE_URL e ADMIN_EMAILS."),
      check("community", "Comunidade segura", false, "Mantenha bloqueado até existirem idade, bloqueio, denúncia e moderação.", "manual"),
      check("visual-qa", "QA visual em dispositivos", false, "Teste login, loja, tutor e aulas em mobile, tablet e desktop.", "manual"),
      check("support", "Suporte e incidentes", false, "Defina SLA, canal de suporte, backups e procedimento de incidente.", "manual"),
    ]),
  ];
  const automatic = sections.flatMap((item) => item.checks).filter((item) => item.kind === "automatic");
  const readyCount = automatic.filter((item) => item.ready).length;
  return {
    generatedAt: new Date().toISOString(),
    automaticReady: readyCount,
    automaticTotal: automatic.length,
    launchReady: readyCount === automatic.length,
    sections,
  };
}

