import assert from "node:assert/strict";
import test from "node:test";
import { newDb } from "pg-mem";

import { COMMERCE_CATALOG, findCommerceProduct, stripePriceMatchesProduct } from "../src/commerceCatalog.js";
import { calculateRefundEnergyTarget, createCommerceStore } from "../src/commerceStore.js";

function createTestStore() {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  return createCommerceStore("memory", { pool: new adapter.Pool() });
}

function energyCheckoutEvent(overrides = {}) {
  return {
    id: overrides.eventId || "evt_checkout",
    type: overrides.type || "checkout.session.completed",
    data: {
      object: {
        id: overrides.sessionId || "cs_test_energy",
        customer: "cus_test_user",
        customer_details: { email: "learner@example.com" },
        client_reference_id: "google-user-1",
        payment_intent: overrides.paymentIntentId || "pi_energy_1",
        payment_status: overrides.paymentStatus || "paid",
        amount_total: 1499,
        currency: "brl",
        metadata: {
          user_sub: "google-user-1",
          product_id: "energy-50",
          product_type: "energy",
          energy: "50",
        },
      },
    },
  };
}

function chargeContext(amountRefunded = 0, overrides = {}) {
  return {
    id: overrides.chargeId || "ch_energy_1",
    customer: "cus_test_user",
    payment_intent: overrides.paymentIntentId || "pi_energy_1",
    amount: 1499,
    amount_refunded: amountRefunded,
    currency: "brl",
    billing_details: { email: "learner@example.com" },
    metadata: {
      user_sub: "google-user-1",
      product_id: "energy-50",
      product_type: "energy",
      energy: "50",
    },
  };
}

test("commerce catalog keeps canonical server-side BRL prices", () => {
  assert.deepEqual(
    COMMERCE_CATALOG.map(({ id, amountCents, energy }) => ({ id, amountCents, energy })),
    [
      { id: "plus-monthly", amountCents: 9990, energy: undefined },
      { id: "energy-50", amountCents: 1499, energy: 50 },
      { id: "energy-150", amountCents: 3990, energy: 150 },
      { id: "energy-500", amountCents: 5990, energy: 500 },
      { id: "energy-1000", amountCents: 9990, energy: 1000 },
    ]
  );
  assert.equal(findCommerceProduct("missing"), null);
});

test("Stripe prices must match the public amount, currency and billing mode", () => {
  const plus = findCommerceProduct("plus-monthly");
  const energy = findCommerceProduct("energy-50");

  assert.equal(stripePriceMatchesProduct(plus, { active: true, currency: "brl", unit_amount: 9990, type: "recurring", recurring: { interval: "month" } }), true);
  assert.equal(stripePriceMatchesProduct(plus, { active: true, currency: "brl", unit_amount: 999, type: "recurring", recurring: { interval: "month" } }), false);
  assert.equal(stripePriceMatchesProduct(energy, { active: true, currency: "brl", unit_amount: 1499, type: "one_time" }), true);
  assert.equal(stripePriceMatchesProduct(energy, { active: true, currency: "brl", unit_amount: 1499, type: "recurring", recurring: { interval: "month" } }), false);
});

test("commerce store fails closed without a durable database", async () => {
  const store = createCommerceStore("");

  assert.equal(store.available, false);
  assert.equal(await store.getAccount({ sub: "user" }), null);
  assert.equal(await store.getStripeCustomerId({ sub: "user" }), null);
  assert.deepEqual(await store.listLedger({ sub: "user" }), []);
  assert.deepEqual(await store.consumeEnergy({ sub: "user" }, 1, "test"), { ok: false, error: "unavailable" });
  assert.deepEqual(await store.adminAdjustEnergy({ sub: "user" }, 50, "admin"), { ok: false, error: "unavailable" });
  assert.deepEqual(await store.processStripeEvent({}), { processed: false, reason: "unavailable" });
  await store.close();
});

test("refund target is cumulative, proportional and bounded", () => {
  assert.equal(calculateRefundEnergyTarget(50, 0, 1499), 0);
  assert.equal(calculateRefundEnergyTarget(50, 750, 1499), 26);
  assert.equal(calculateRefundEnergyTarget(50, 1499, 1499), 50);
  assert.equal(calculateRefundEnergyTarget(50, 9999, 1499), 50);
});

test("checkout credits energy once across duplicate and asynchronous events", async () => {
  const store = createTestStore();
  const first = await store.processStripeEvent(energyCheckoutEvent());
  const duplicate = await store.processStripeEvent(energyCheckoutEvent());
  const asynchronous = await store.processStripeEvent(energyCheckoutEvent({
    eventId: "evt_async_paid",
    type: "checkout.session.async_payment_succeeded",
  }));

  assert.equal(first.processed, true);
  assert.deepEqual(duplicate, { processed: false, reason: "duplicate" });
  assert.equal(asynchronous.processed, true);
  const account = await store.getAccount({ sub: "google-user-1", email: "learner@example.com" });
  assert.equal(account.purchasedEnergy, 50);
  assert.equal(account.energyDebt, 0);
  assert.equal(account.plusActive, false);
  const ledger = await store.listLedger({ sub: "google-user-1" });
  assert.equal(ledger.filter((entry) => entry.source === "stripe_checkout").length, 1);
  assert.equal(ledger.find((entry) => entry.source === "stripe_checkout").delta, 50);
  await store.close();
});

test("partial and full refunds reconcile only the cumulative difference", async () => {
  const store = createTestStore();
  await store.processStripeEvent(energyCheckoutEvent());

  await store.processStripeEvent({
    id: "evt_refund_partial",
    type: "charge.refunded",
    data: { object: chargeContext(750) },
  });
  let account = await store.getAccount({ sub: "google-user-1", email: "learner@example.com" });
  assert.equal(account.purchasedEnergy, 24);
  assert.equal(account.energyDebt, 0);

  await store.processStripeEvent({
    id: "evt_refund_same_amount",
    type: "refund.updated",
    data: { object: { id: "re_partial", charge: "ch_energy_1", status: "succeeded" } },
    commerceRelatedCharge: chargeContext(750),
  });
  account = await store.getAccount({ sub: "google-user-1", email: "learner@example.com" });
  assert.equal(account.purchasedEnergy, 24);

  await store.processStripeEvent({
    id: "evt_refund_failed",
    type: "refund.failed",
    data: { object: { id: "re_partial", charge: "ch_energy_1", status: "failed" } },
    commerceRelatedCharge: chargeContext(0),
  });
  account = await store.getAccount({ sub: "google-user-1", email: "learner@example.com" });
  assert.equal(account.purchasedEnergy, 50);
  assert.equal(account.energyDebt, 0);

  await store.processStripeEvent({
    id: "evt_refund_full",
    type: "charge.refunded",
    data: { object: chargeContext(1499) },
  });
  account = await store.getAccount({ sub: "google-user-1", email: "learner@example.com" });
  assert.equal(account.purchasedEnergy, 0);
  assert.equal(account.energyDebt, 0);
  await store.close();
});

test("a dispute creates debt for spent energy and a win restores the exact entitlement", async () => {
  const store = createTestStore();
  const user = { sub: "google-user-1", email: "learner@example.com" };
  await store.processStripeEvent(energyCheckoutEvent());
  assert.equal((await store.adminAdjustEnergy(user, -20, "test-admin")).purchasedEnergy, 30);

  await store.processStripeEvent({
    id: "evt_dispute_created",
    type: "charge.dispute.created",
    data: { object: { id: "dp_energy_1", charge: "ch_energy_1", status: "needs_response" } },
    commerceRelatedCharge: chargeContext(0),
  });
  let account = await store.getAccount(user);
  assert.equal(account.purchasedEnergy, 0);
  assert.equal(account.energyDebt, 20);

  await store.processStripeEvent({
    id: "evt_dispute_won",
    type: "charge.dispute.closed",
    data: { object: { id: "dp_energy_1", charge: "ch_energy_1", status: "won" } },
    commerceRelatedCharge: chargeContext(0),
  });
  account = await store.getAccount(user);
  assert.equal(account.purchasedEnergy, 30);
  assert.equal(account.energyDebt, 0);
  await store.close();
});

test("closing one dispute never consumes debt allocated to another purchase", async () => {
  const store = createTestStore();
  const user = { sub: "google-user-1", email: "learner@example.com" };
  await store.processStripeEvent(energyCheckoutEvent());
  await store.processStripeEvent(energyCheckoutEvent({
    eventId: "evt_checkout_2",
    sessionId: "cs_test_energy_2",
    paymentIntentId: "pi_energy_2",
  }));
  await store.adminAdjustEnergy(user, -100, "test-admin");

  for (const sequence of [1, 2]) {
    await store.processStripeEvent({
      id: `evt_dispute_${sequence}`,
      type: "charge.dispute.created",
      data: { object: { id: `dp_energy_${sequence}`, charge: `ch_energy_${sequence}`, status: "needs_response" } },
      commerceRelatedCharge: chargeContext(0, {
        chargeId: `ch_energy_${sequence}`,
        paymentIntentId: `pi_energy_${sequence}`,
      }),
    });
  }
  assert.equal((await store.getAccount(user)).energyDebt, 100);

  await store.processStripeEvent(energyCheckoutEvent({
    eventId: "evt_checkout_3",
    sessionId: "cs_test_energy_3",
    paymentIntentId: "pi_energy_3",
  }));
  let account = await store.getAccount(user);
  assert.equal(account.purchasedEnergy, 0);
  assert.equal(account.energyDebt, 50);

  await store.processStripeEvent({
    id: "evt_dispute_1_won",
    type: "charge.dispute.closed",
    data: { object: { id: "dp_energy_1", charge: "ch_energy_1", status: "won" } },
    commerceRelatedCharge: chargeContext(0),
  });
  account = await store.getAccount(user);
  assert.equal(account.purchasedEnergy, 50);
  assert.equal(account.energyDebt, 50);
  await store.close();
});

test("Plus follows paid checkout and subscription lifecycle events", async () => {
  const store = createTestStore();
  const user = { sub: "google-user-plus", email: "plus@example.com" };
  await store.processStripeEvent({
    id: "evt_plus_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_plus",
        customer: "cus_plus",
        customer_details: { email: user.email },
        client_reference_id: user.sub,
        subscription: "sub_plus",
        payment_status: "paid",
        metadata: {
          user_sub: user.sub,
          product_id: "plus-monthly",
          product_type: "subscription",
          energy: "0",
        },
      },
    },
  });
  assert.equal((await store.getAccount(user)).plusActive, true);

  await store.processStripeEvent({
    id: "evt_plus_deleted",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: "sub_plus",
        customer: "cus_plus",
        status: "canceled",
        metadata: { user_sub: user.sub, product_type: "subscription" },
      },
    },
  });
  assert.equal((await store.getAccount(user)).plusActive, false);
  await store.close();
});
