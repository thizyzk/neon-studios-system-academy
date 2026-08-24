import assert from "node:assert/strict";
import test from "node:test";

import { createAdminStore, hasAdminPermission, normalizeAdminRole } from "../src/adminStore.js";

test("administration hierarchy grants only the intended permissions", () => {
  assert.equal(hasAdminPermission("user", "users.read"), false);
  assert.equal(hasAdminPermission("support", "users.read"), true);
  assert.equal(hasAdminPermission("support", "users.ban"), false);
  assert.equal(hasAdminPermission("moderator", "users.ban"), true);
  assert.equal(hasAdminPermission("administrator", "energy.adjust"), true);
  assert.equal(hasAdminPermission("administrator", "roles.manage"), false);
  assert.equal(hasAdminPermission("administrator", "integrations.manage"), false);
  assert.equal(hasAdminPermission("owner", "roles.manage"), true);
  assert.equal(hasAdminPermission("owner", "integrations.manage"), true);
  assert.equal(normalizeAdminRole("invented"), "user");
});

test("ADMIN_EMAILS remains a fail-safe owner bootstrap without PostgreSQL", async () => {
  const store = createAdminStore("", ["owner@example.com"]);
  const owner = await store.recordLogin({ sub: "owner-sub", email: "OWNER@example.com", name: "Owner" });
  const user = await store.recordLogin({ sub: "user-sub", email: "user@example.com", name: "User" });

  assert.equal(store.available, false);
  assert.equal(owner.role, "owner");
  assert.equal(owner.isAdmin, true);
  assert.equal(user.role, "user");
  assert.equal(user.isAdmin, false);
  assert.deepEqual(await store.listUsers(), { users: [], total: 0 });
  await store.close();
});
