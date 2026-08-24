import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {};
await import("../../docs/economy-systems-guide/roblox-ui-visualizer.js");

const visualizer = globalThis.window.NeonRobloxUI;

test("visualizer parses only the indexed Roblox UI subset without executing input", () => {
  globalThis.__unsafeVisualizerProbe = false;
  const model = visualizer.parse(`--!strict
local gui = Instance.new("MainGui")
local frame = Instance.new("Frame", gui)
frame.Size = UDim2.fromScale(0.5, 0.5)
frame.BackgroundColor3 = Color3.fromRGB(10, 20, 30)
frame.Text = (globalThis.__unsafeVisualizerProbe = true)`);

  assert.equal(globalThis.__unsafeVisualizerProbe, false);
  assert.equal(model.nodes.get("gui").className, "ScreenGui");
  assert.equal(model.nodes.get("frame").properties.Size.xs, 0.5);
  assert.equal(model.warnings.some((warning) => warning.message.includes("não está indexada")), true);
});

test("visualizer serializes supported values as importable RBXMX property types", () => {
  const model = visualizer.parse(`--!strict
local gui = Instance.new("ScreenGui")
gui.Name = "MainGui"
local label = Instance.new("TextLabel", gui)
label.Text = "Olá <Studio>"
label.TextXAlignment = Enum.TextXAlignment.Left
label.Size = UDim2.new(1, -20, 0, 40)`);
  const xml = visualizer.serializeRbxmx(model);

  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /<Item class="ScreenGui"/);
  assert.match(xml, /<token name="TextXAlignment">0<\/token>/);
  assert.match(xml, /Olá &lt;Studio&gt;/);
  assert.doesNotMatch(xml, /<script/i);
});
