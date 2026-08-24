import assert from "node:assert/strict";
import lucide from "../../docs/economy-systems-guide/assets/lucide.min.js";
import { readFile } from "node:fs/promises";
import test from "node:test";

globalThis.window = {};
await import("../../docs/economy-systems-guide/integration-systems.js");
await import("../../docs/economy-systems-guide/system-expansion.js");

const integrationSystems = globalThis.window.INTEGRATION_SYSTEM_BLUEPRINTS;
const expansionSystems = globalThis.window.NEON_SYSTEM_EXPANSION;

test("curriculum expands from 70 to exactly 170 systems", async () => {
  const appSource = await readFile(new URL("../../docs/economy-systems-guide/app.js", import.meta.url), "utf8");
  const coreSource = appSource.slice(0, appSource.indexOf("systems.forEach"));
  const coreSystems = coreSource.match(/^ {6}id: /gm) || [];

  assert.equal(coreSystems.length, 20);
  assert.equal(integrationSystems.length, 50);
  assert.equal(expansionSystems.length, 100);
  assert.equal(coreSystems.length + integrationSystems.length + expansionSystems.length, 170);
  assert.match(appSource, /expansionBlueprints\.map\(createExpansionSystem\)/);
});

test("the 100 new systems are unique and balanced across ten domains", () => {
  const ids = expansionSystems.map((system) => system.id);
  const names = expansionSystems.map((system) => system.name);
  const domainCounts = expansionSystems.reduce((counts, system) => {
    counts.set(system.domain, (counts.get(system.domain) || 0) + 1);
    return counts;
  }, new Map());

  assert.equal(new Set(ids).size, 100);
  assert.equal(new Set(names).size, 100);
  assert.equal(domainCounts.size, 10);
  assert.deepEqual([...domainCounts.values()], Array(10).fill(10));
});

test("every new system contains explanations, contracts and all learning levels", () => {
  for (const system of expansionSystems) {
    assert.ok(system.role.length >= 45, `${system.name} needs a concrete role`);
    assert.ok(system.why.length >= 55, `${system.name} needs a concrete problem`);
    assert.ok(system.dependencies.length >= 1, `${system.name} needs dependencies`);
    assert.equal(system.operations.length, 3, `${system.name} needs three API operations`);
    assert.deepEqual(system.levels.map((level) => level.name), ["Básico", "Intermediário", "Avançado"]);

    for (const level of system.levels) {
      assert.ok(level.goal.length >= 40, `${system.name}/${level.name} needs a practical goal`);
      assert.ok(level.proof.length >= 45, `${system.name}/${level.name} needs a completion proof`);
    }
  }
});

test("every new system uses an icon available in the bundled Lucide build", () => {
  const toPascalCase = (name) => name.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join("");
  for (const system of expansionSystems) {
    assert.ok(lucide.icons[toPascalCase(system.icon)], `${system.name} references missing icon ${system.icon}`);
  }
});
