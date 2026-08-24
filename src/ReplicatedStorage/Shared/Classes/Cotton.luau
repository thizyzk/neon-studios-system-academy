local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local CottonConfig = require(ReplicatedStorage.Shared.Modules.CottonConfig)
local Studs = require(ReplicatedStorage.Shared.Modules.Studs)
local WorldVisualStyle = require(ReplicatedStorage.Shared.Modules.WorldVisualStyle)

local Cotton = {}
Cotton.__index = Cotton

function Cotton.new(data)
	local cottonType = CottonConfig.GetCottonType(data.TypeId)

	local self = setmetatable({
		Id = data.Id or HttpService:GenerateGUID(false),
		TypeId = cottonType.Id,
		TypeName = data.TypeName or cottonType.Name,
		Rarity = data.Rarity or "Common",
		Quality = math.clamp(math.floor(data.Quality or 50), 1, 100),
		Value = math.max(0, math.floor(data.Value or cottonType.BaseValue)),
		OwnerUserId = data.OwnerUserId or 0,
		ProcessedUpgrades = {},
		Part = nil,
	}, Cotton)

	self.Part = self:_createPart(data.CFrame, data.Parent, data.Part)
	self:_syncAttributes()

	return self
end

function Cotton:_createPart(cframe: CFrame?, parent: Instance?, templatePart: BasePart?)
	local cottonType = CottonConfig.GetCottonType(self.TypeId)
	local rarity = CottonConfig.GetRarity(self.Rarity)

	if templatePart then
		templatePart.Name = `Cotton_{self.Id}`
		templatePart.Anchored = true
		templatePart.CanCollide = false
		templatePart.CFrame = cframe or Studs.offset(0, 5, 0)
		templatePart.Color = cottonType.Color
		templatePart.Parent = parent

		local glow = templatePart:FindFirstChild("RarityGlow")
		if not glow then
			glow = Instance.new("PointLight")
			glow.Name = "RarityGlow"
			glow.Parent = templatePart
		end

		if glow:IsA("PointLight") then
			glow.Color = rarity.Color
			glow.Brightness = if self.Rarity == "Common" then 0 else 0.8
			glow.Range = Studs.scalar(8)
		end

		return templatePart
	end

	local part = Instance.new("Part")
	part.Name = `Cotton_{self.Id}`
	part.Anchored = true
	part.CanCollide = false
	part.Shape = Enum.PartType.Ball
	part.Size = Studs.vector(2, 2, 2)
	part.CFrame = cframe or Studs.offset(0, 5, 0)
	part.Color = cottonType.Color
	WorldVisualStyle.Apply(part, "Cotton")
	part.Parent = parent

	local glow = Instance.new("PointLight")
	glow.Name = "RarityGlow"
	glow.Color = rarity.Color
	glow.Brightness = if self.Rarity == "Common" then 0 else 0.8
	glow.Range = Studs.scalar(8)
	glow.Parent = part

	return part
end

function Cotton:_syncAttributes()
	if not self.Part then
		return
	end

	self.Part:SetAttribute("CottonId", self.Id)
	self.Part:SetAttribute("TypeId", self.TypeId)
	self.Part:SetAttribute("TypeName", self.TypeName)
	self.Part:SetAttribute("Rarity", self.Rarity)
	self.Part:SetAttribute("Quality", self.Quality)
	self.Part:SetAttribute("Value", self.Value)
	self.Part:SetAttribute("OwnerUserId", self.OwnerUserId)
end

function Cotton:SetParent(parent: Instance)
	self.Part.Parent = parent
end

function Cotton:SetCFrame(cframe: CFrame)
	self.Part.CFrame = cframe
end

function Cotton:MoveTo(position: Vector3)
	self.Part.Position = position
end

function Cotton:HasUpgrade(upgraderId: string)
	return self.ProcessedUpgrades[upgraderId] == true
end

function Cotton:MarkUpgrade(upgraderId: string)
	self.ProcessedUpgrades[upgraderId] = true
end

function Cotton:ApplyUpgrade(upgraderId: string, valueMultiplier: number?, qualityBonus: number?)
	if self:HasUpgrade(upgraderId) then
		return false
	end

	self:MarkUpgrade(upgraderId)
	self.Quality = math.clamp(self.Quality + math.floor(qualityBonus or 0), 1, 100)
	self.Value = math.max(0, math.floor(self.Value * (valueMultiplier or 1)))
	self:_syncAttributes()

	return true
end

function Cotton:GetSnapshot()
	return {
		Id = self.Id,
		TypeId = self.TypeId,
		TypeName = self.TypeName,
		Rarity = self.Rarity,
		Quality = self.Quality,
		Value = self.Value,
		OwnerUserId = self.OwnerUserId,
	}
end

function Cotton:Destroy()
	if self.Part then
		self.Part:Destroy()
		self.Part = nil
	end
end

return Cotton
