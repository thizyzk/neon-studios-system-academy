import assert from "node:assert/strict";
import test from "node:test";

import { COMMERCE_CATALOG, findCommerceProduct } from "../src/commerceCatalog.js";
import { createCommerceStore } from "../src/commerceStore.js";

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

test("commerce store fails closed without a durable database", async () => {
  const store = createCommerceStore("");

  assert.equal(store.available, false);
  assert.equal(await store.getAccount({ sub: "user" }), null);
  assert.equal(await store.getStripeCustomerId({ sub: "user" }), null);
  assert.deepEqual(await store.consumeEnergy({ sub: "user" }, 1, "test"), { ok: false, error: "unavailable" });
  assert.deepEqual(await store.adminAdjustEnergy({ sub: "user" }, 50, "admin"), { ok: false, error: "unavailable" });
  assert.deepEqual(await store.processStripeEvent({}), { processed: false, reason: "unavailable" });
  await store.close();
});
