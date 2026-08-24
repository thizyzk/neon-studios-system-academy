import assert from "node:assert/strict";
import test from "node:test";

import { buildReadinessReport } from "../src/readiness.js";

function productionConfig(overrides = {}) {
  return {
    publicBaseUrl: "https://neonstudiosacademy.com.br",
    googleClientId: "google-client",
    recaptchaSiteKey: "site-key",
    recaptchaSecretKey: "secret-key",
    recaptchaAllowedHostnames: ["neonstudiosacademy.com.br"],
    authSessionSecret: "a".repeat(48),
    databaseUrl: "postgresql://database",
    stripeSecretKey: "sk_test_example",
    stripeWebhookSecret: "whsec_example",
    stripePriceIds: {
      "plus-monthly": "price_plus",
      "energy-50": "price_50",
      "energy-150": "price_150",
      "energy-500": "price_500",
      "energy-1000": "price_1000",
    },
    promotionalPricesVerified: false,
    r2AccountId: "account",
    r2AccessKeyId: "access",
    r2SecretAccessKey: "secret",
    r2BucketName: "neon-academy-audio",
    pexelsApiKey: "pexels",
    adminEmails: ["owner@example.com"],
    ...overrides,
  };
}

test("readiness reports a fully configured automatic launch surface", () => {
  const report = buildReadinessReport(productionConfig());

  assert.equal(report.launchReady, true);
  assert.equal(report.automaticReady, report.automaticTotal);
  assert.equal(report.sections.find((section) => section.id === "monetization").ready, true);
  assert.equal(report.sections.find((section) => section.id === "cloudflare").ready, true);
});

test("readiness names durable database and Stripe prices as blockers", () => {
  const report = buildReadinessReport(productionConfig({
    databaseUrl: "",
    stripePriceIds: {},
  }));
  const blockers = report.sections.flatMap((section) => section.checks).filter((item) => !item.ready && item.kind === "automatic");

  assert.equal(report.launchReady, false);
  assert.equal(blockers.some((item) => item.id === "database"), true);
  assert.equal(blockers.some((item) => item.id === "stripe-prices"), true);
});

