local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Studs = require(ReplicatedStorage.Shared.Modules.Studs)
local SimulatorUITheme = require(ReplicatedStorage.Shared.Modules.SimulatorUITheme)
local WorldVisualStyle = require(ReplicatedStorage.Shared.Modules.WorldVisualStyle)

local ConveyorUpgrader = {}
ConveyorUpgrader.__index = ConveyorUpgrader

function ConveyorUpgrader.new(config)
	local self = setmetatable({
		Id = config.Id,
		Name = config.Name or config.Id,
		CFrame = config.CFrame,
		RadiusStuds = config.RadiusStuds or Studs.scalar(4),
		QualityBonus = config.QualityBonus or 0,
		ValueMultiplier = config.ValueMultiplier or 1,
		Color = config.Color or Color3.fromRGB(80, 160, 220),
		TemplateModel = config.Model,
		Model = nil,
	}, ConveyorUpgrader)
	self.Model = self:_createModel(config.Parent)

	return self
end

function ConveyorUpgrader:_createModel(parent: Instance?)
	if self.TemplateModel then
		local model = self.TemplateModel
		model.Name = `Upgrader_{self.Id}`
		model.Parent = parent
		model:SetAttribute("UpgraderId", self.Id)
		model:SetAttribute("ValueMultiplier", self.ValueMultiplier)
		model:SetAttribute("QualityBonus", self.QualityBonus)

		return model
	end

	local model = Instance.new("Model")
	model.Name = `Upgrader_{self.Id}`
	model.Parent = parent

	local base = Instance.new("Part")
	base.Name = "Base"
	base.Anchored = true
	base.Size = Studs.vector(5, 0.8, 6)
	base.CFrame = self.CFrame * Studs.offset(0, -0.6, 0)
	base.Color = Color3.fromRGB(52, 56, 64)
	WorldVisualStyle.Apply(base, "Metal")
	base.Parent = model

	local scanner = Instance.new("Part")
	scanner.Name = "Scanner"
	scanner.Anchored = true
	scanner.CanCollide = false
	scanner.Size = Studs.vector(4.5, 4, 0.5)
	scanner.CFrame = self.CFrame * Studs.offset(0, 1.35, 0)
	scanner.Color = self.Color
	scanner.Material = Enum.Material.Neon
	scanner.Transparency = 0.2
	scanner.Parent = model

	local label = Instance.new("BillboardGui")
	label.Name = "Label"
	label.AlwaysOnTop = true
	label.Size = UDim2.fromOffset(180, 48)
	label.StudsOffset = Studs.vector(0, 3.5, 0)
	label.Parent = scanner

	local text = Instance.new("TextLabel")
	text.BackgroundTransparency = 1
	text.Size = UDim2.fromScale(1, 1)
	text.Font = Enum.Font.GothamBold
	text.Text = self.Name
	text.TextColor3 = Color3.fromRGB(255, 255, 255)
	text.TextScaled = true
	text.Parent = label
	SimulatorUITheme.AddTextStroke(text, 3)

	model:SetAttribute("UpgraderId", self.Id)
	model:SetAttribute("ValueMultiplier", self.ValueMultiplier)
	model:SetAttribute("QualityBonus", self.QualityBonus)

	return model
end

function ConveyorUpgrader:CanProcess(cotton)
	if cotton:HasUpgrade(self.Id) then
		return false
	end

	return (cotton.Part.Position - self.CFrame.Position).Magnitude <= self.RadiusStuds
end

function ConveyorUpgrader:Process(cotton)
	if not self:CanProcess(cotton) then
		return false
	end

	return cotton:ApplyUpgrade(self.Id, self.ValueMultiplier, self.QualityBonus)
end

function ConveyorUpgrader:Destroy()
	if self.Model then
		self.Model:Destroy()
		self.Model = nil
	end
end

return ConveyorUpgrader
