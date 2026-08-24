import assert from "node:assert/strict";
import test from "node:test";

import { createLearningStore } from "../src/learningStore.js";

test("learning store provides an explicit no-database fallback", async () => {
  const store = createLearningStore("");

  assert.equal(store.available, false);
  assert.equal(await store.read({ sub: "user" }), null);
  assert.equal(await store.write({ sub: "user" }, { progress: {} }), null);
  await store.close();
});
