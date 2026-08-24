local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local CottonConfig = require(ReplicatedStorage.Shared.Modules.CottonConfig)
local Studs = require(ReplicatedStorage.Shared.Modules.Studs)
local GeneratorService = require(ServerScriptService.Services.GeneratorService)
local InventoryService = require(ServerScriptService.Services.InventoryService)
local ModelTemplateResolver = require(ServerScriptService.Modules.ModelTemplateResolver)
local PlotService = require(ServerScriptService.Services.PlotService)
local SkillTreeService = require(ServerScriptService.Services.SkillTreeService)

local CottonService = {}

CottonService.Random = Random.new()
CottonService.Remotes = nil

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local cottonFolder = remotesFolder:FindFirstChild("Cotton")
	if not cottonFolder then
		cottonFolder = Instance.new("Folder")
		cottonFolder.Name = "Cotton"
		cottonFolder.Parent = remotesFolder
	end

	local plantCotton = cottonFolder:FindFirstChild("PlantCotton")
	if not plantCotton then
		plantCotton = Instance.new("RemoteFunction")
		plantCotton.Name = "PlantCotton"
		plantCotton.Parent = cottonFolder
	end

	local harvestCotton = cottonFolder:FindFirstChild("HarvestCotton")
	if not harvestCotton then
		harvestCotton = Instance.new("RemoteFunction")
		harvestCotton.Name = "HarvestCotton"
		harvestCotton.Parent = cottonFolder
	end

	local plotStateUpdated = cottonFolder:FindFirstChild("PlotStateUpdated")
	if not plotStateUpdated then
		plotStateUpdated = Instance.new("RemoteEvent")
		plotStateUpdated.Name = "PlotStateUpdated"
		plotStateUpdated.Parent = cottonFolder
	end

	return {
		PlantCotton = plantCotton,
		HarvestCotton = harvestCotton,
		PlotStateUpdated = plotStateUpdated,
	}
end

local function createPlantVisual(slot, cottonType, rarityName: string)
	if slot.PlantModel then
		slot.PlantModel:Destroy()
	end

	local plantParent = slot.PlantParent or slot.Model or slot.Part
	local plantCFrame = slot.Part.CFrame * Studs.offset(0, 1.2, 0)
	local template = ModelTemplateResolver:Clone({
		"Plants",
		cottonType.Id,
		"Planted",
	}, plantParent)
		or ModelTemplateResolver:Clone({
			"Plants",
			"Default",
			"Planted",
		}, plantParent)
		or ModelTemplateResolver:Clone({
			"Plants",
			cottonType.Id,
		}, plantParent)
		or ModelTemplateResolver:Clone({
			"Plants",
			"Default",
		}, plantParent)

	if template then
		template.Name = `CottonPlant_{slot.Index}`
		ModelTemplateResolver:SetAnchored(template, true)
		ModelTemplateResolver:PivotTo(template, plantCFrame)
		template:SetAttribute("CottonTypeId", cottonType.Id)
		template:SetAttribute("Rarity", rarityName)
		template:SetAttribute("GrowthStage", "Planted")

		local glowPart = ModelTemplateResolver:FindPart(template, { "CottonBoll", "GlowPart", "Boll" })
		if glowPart then
			local rarityGlow = glowPart:FindFirstChild("RarityGlow")
			if not rarityGlow then
				rarityGlow = Instance.new("PointLight")
				rarityGlow.Name = "RarityGlow"
				rarityGlow.Parent = glowPart
			end

			if rarityGlow:IsA("PointLight") then
				rarityGlow.Color = CottonConfig.GetRarity(rarityName).Color
				rarityGlow.Brightness = 0
				rarityGlow.Range = Studs.scalar(10)
			end
		end

		slot.PlantModel = template
		return template
	end

	local plantModel = Instance.new("Model")
	plantModel.Name = `CottonPlant_{slot.Index}`
	plantModel.Parent = plantParent

	local stem = Instance.new("Part")
	stem.Name = "Stem"
	stem.Anchored = true
	stem.Size = Studs.vector(0.35, 2, 0.35)
	stem.CFrame = slot.Part.CFrame * Studs.offset(0, 1.25, 0)
	stem.Color = Color3.fromRGB(77, 140, 72)
	stem.Material = Enum.Material.Grass
	stem.Parent = plantModel

	local boll = Instance.new("Part")
	boll.Name = "CottonBoll"
	boll.Anchored = true
	boll.Shape = Enum.PartType.Ball
	boll.Size = Studs.vector(2, 2, 2)
	boll.CFrame = slot.Part.CFrame * Studs.offset(0, 2.45, 0)
	boll.Color = cottonType.Color
	boll.Material = Enum.Material.SmoothPlastic
	boll.Parent = plantModel

	local rarityGlow = Instance.new("PointLight")
	rarityGlow.Name = "RarityGlow"
	rarityGlow.Color = CottonConfig.GetRarity(rarityName).Color
	rarityGlow.Brightness = 0
	rarityGlow.Range = Studs.scalar(10)
	rarityGlow.Parent = boll

	plantModel:ScaleTo(0.2)
	slot.PlantModel = plantModel

	return plantModel
end

local function scalePlantModel(plantModel: Instance, scale: number)
	if plantModel:IsA("Model") then
		plantModel:ScaleTo(scale)
	end
end

local function updatePlantVisual(slot, stageName: string)
	if not slot.PlantModel then
		return
	end

	local cottonType = CottonConfig.GetCottonType(slot.CottonTypeId)
	local plantParent = slot.PlantParent or slot.Model or slot.Part
	local replacement = ModelTemplateResolver:Clone({
		"Plants",
		cottonType.Id,
		stageName,
	}, plantParent)
		or ModelTemplateResolver:Clone({
			"Plants",
			"Default",
			stageName,
		}, plantParent)
	if replacement then
		replacement.Name = slot.PlantModel.Name
		ModelTemplateResolver:SetAnchored(replacement, true)
		ModelTemplateResolver:PivotTo(replacement, slot.Part.CFrame * Studs.offset(0, 1.2, 0))
		replacement:SetAttribute("CottonTypeId", cottonType.Id)
		replacement:SetAttribute("Rarity", slot.Rarity)
		replacement:SetAttribute("GrowthStage", stageName)

		slot.PlantModel:Destroy()
		slot.PlantModel = replacement
	end

	local scaleByStage = {
		Planted = 0.25,
		Sprout = 0.45,
		Growing = 0.75,
		Ready = 1,
	}

	scalePlantModel(slot.PlantModel, scaleByStage[stageName] or 1)
	slot.PlantModel:SetAttribute("GrowthStage", stageName)

	local boll = slot.PlantModel:FindFirstChild("CottonBoll", true)
	local glow = if boll then boll:FindFirstChild("RarityGlow") else nil

	if glow and glow:IsA("PointLight") then
		glow.Brightness = if stageName == "Ready" then 1.2 else 0
	end
end

local function updateSlotPrompt(slot)
	local promptPart = slot.PromptPart or slot.Part
	local prompt = promptPart:FindFirstChild("CottonPrompt")
	if not prompt or not prompt:IsA("ProximityPrompt") then
		return
	end

	if not slot.IsUnlocked then
		prompt.Enabled = true
		prompt.ActionText = "Locked"
		prompt.ObjectText = slot.Floor.Config.Name
	elseif slot.State == "Empty" then
		prompt.Enabled = true
		prompt.ActionText = "Plant"
		prompt.ObjectText = "Cotton Slot"
	elseif slot.State == "Ready" then
		prompt.Enabled = true
		prompt.ActionText = "Harvest"
		prompt.ObjectText = `{slot.Rarity} Cotton | Q{slot.Quality}`
	else
		prompt.Enabled = true
		prompt.ActionText = "Growing"
		prompt.ObjectText = "Cotton Plant"
	end
end

function CottonService:_notifyPlayer(player: Player)
	if self.Remotes then
		self.Remotes.PlotStateUpdated:FireClient(player, PlotService:GetSnapshot(player))
	end
end

function CottonService:_completeGrowth(player: Player, slotIndex: number, startedAt: number)
	local slot = PlotService:GetSlot(player, slotIndex)
	if not slot or slot.State == "Empty" or slot.GrowthStartedAt ~= startedAt then
		return
	end

	PlotService:SetSlotState(slot, {
		State = "Ready",
	})

	local visualPart = slot.VisualPart or slot.Part
	visualPart.Color = Color3.fromRGB(86, 146, 78)
	updatePlantVisual(slot, "Ready")
	updateSlotPrompt(slot)
	self:_notifyPlayer(player)
end

function CottonService:_scheduleGrowth(player: Player, slot, growthTime: number)
	local startedAt = slot.GrowthStartedAt
	local slotIndex = slot.Index
	local sproutDelay = math.max(1, math.floor(growthTime * 0.3))
	local growingDelay = math.max(2, math.floor(growthTime * 0.65))

	task.delay(sproutDelay, function()
		local currentSlot = PlotService:GetSlot(player, slotIndex)
		if currentSlot and currentSlot.GrowthStartedAt == startedAt and currentSlot.State == "Planted" then
			PlotService:SetSlotState(currentSlot, {
				State = "Sprout",
			})
			updatePlantVisual(currentSlot, "Sprout")
			updateSlotPrompt(currentSlot)
			self:_notifyPlayer(player)
		end
	end)

	task.delay(growingDelay, function()
		local currentSlot = PlotService:GetSlot(player, slotIndex)
		if currentSlot and currentSlot.GrowthStartedAt == startedAt and currentSlot.State == "Sprout" then
			PlotService:SetSlotState(currentSlot, {
				State = "Growing",
			})
			updatePlantVisual(currentSlot, "Growing")
			updateSlotPrompt(currentSlot)
			self:_notifyPlayer(player)
		end
	end)

	task.delay(growthTime, function()
		self:_completeGrowth(player, slotIndex, startedAt)
	end)
end

function CottonService:Init()
	self.Remotes = getOrCreateRemotes()
end

function CottonService:Start()
	self.Remotes.PlantCotton.OnServerInvoke = function(player, slotIndex, cottonTypeId)
		return self:PlantCotton(player, slotIndex, cottonTypeId)
	end

	self.Remotes.HarvestCotton.OnServerInvoke = function(player, slotIndex)
		return self:HarvestCotton(player, slotIndex)
	end

	self:_attachSlotPrompts()

	PlotService.FloorCreated.Event:Connect(function(plotIndex, floorIndex)
		local plot = PlotService.Plots[plotIndex]
		local floor = plot and plot.Floors[floorIndex]
		if plot and floor then
			self:_attachFloorPrompts(plot, floor)
		end
	end)
end

function CottonService:_attachFloorPrompts(plot, floor)
	for _, slot in floor.Slots do
		local promptPart = slot.PromptPart or slot.Part
		local prompt = promptPart:FindFirstChild("CottonPrompt")
		if not prompt then
			prompt = Instance.new("ProximityPrompt")
			prompt.Name = "CottonPrompt"
			prompt.HoldDuration = 0.2
			prompt.MaxActivationDistance = Studs.scalar(10)
			prompt.RequiresLineOfSight = false
			prompt.Parent = promptPart
		end

		updateSlotPrompt(slot)

		if prompt:GetAttribute("CottonServicePromptBound") then
			continue
		end

		prompt:SetAttribute("CottonServicePromptBound", true)
		prompt.Triggered:Connect(function(player)
			if plot.Owner ~= player then
				return
			end

			if not slot.IsUnlocked then
				updateSlotPrompt(slot)
			elseif slot.State == "Empty" then
				self:PlantCotton(player, slot.Index, CottonConfig.DefaultCottonTypeId)
			elseif slot.State == "Ready" then
				self:HarvestCotton(player, slot.Index)
			end
		end)
	end
end

function CottonService:_attachSlotPrompts()
	PlotService:EnsurePlots()

	for _, plot in PlotService.Plots do
		for _, floor in plot.Floors do
			self:_attachFloorPrompts(plot, floor)
		end
	end
end

function CottonService:PlantCotton(player: Player, slotIndex: number, cottonTypeId: string?)
	if typeof(slotIndex) ~= "number" then
		return {
			Ok = false,
			Error = "InvalidSlot",
		}
	end

	local slot = PlotService:GetSlot(player, slotIndex)
	if not slot then
		if PlotService:IsSlotLocked(player, slotIndex) then
			return {
				Ok = false,
				Error = "SlotLocked",
				FloorIndex = PlotService:GetFloorIndexForSlot(slotIndex),
			}
		end

		return {
			Ok = false,
			Error = "SlotNotFound",
		}
	end

	if slot.State ~= "Empty" then
		return {
			Ok = false,
			Error = "SlotOccupied",
		}
	end

	if not slot.IsUnlocked then
		return {
			Ok = false,
			Error = "SlotLocked",
			FloorIndex = slot.FloorIndex,
		}
	end

	local cottonType = CottonConfig.GetCottonType(cottonTypeId)
	local rarityName = CottonConfig.RollRarity(self.Random)
	local quality = CottonConfig.RollQuality(cottonType.Id, rarityName, self.Random)
	local growthTime = CottonConfig.GetGrowthTime(cottonType.Id)
	local now = Workspace:GetServerTimeNow()

	PlotService:SetSlotState(slot, {
		State = "Planted",
		CottonTypeId = cottonType.Id,
		Rarity = rarityName,
		Quality = quality,
		GrowthStartedAt = now,
		GrowthReadyAt = now + growthTime,
	})

	local visualPart = slot.VisualPart or slot.Part
	visualPart.Color = Color3.fromRGB(105, 74, 48)
	createPlantVisual(slot, cottonType, rarityName)
	updatePlantVisual(slot, "Planted")
	updateSlotPrompt(slot)
	self:_scheduleGrowth(player, slot, growthTime)
	self:_notifyPlayer(player)

	return {
		Ok = true,
		Plot = PlotService:GetSnapshot(player),
		Cotton = {
			TypeId = cottonType.Id,
			TypeName = cottonType.Name,
			Rarity = rarityName,
			Quality = quality,
			GrowthTime = growthTime,
			Value = CottonConfig.GetCottonValue(cottonType.Id, rarityName, quality),
		},
	}
end

function CottonService:HarvestCotton(player: Player, slotIndex: number)
	if typeof(slotIndex) ~= "number" then
		return {
			Ok = false,
			Error = "InvalidSlot",
		}
	end

	local slot = PlotService:GetSlot(player, slotIndex)
	if not slot then
		return {
			Ok = false,
			Error = "SlotNotFound",
		}
	end

	if slot.State ~= "Ready" then
		return {
			Ok = false,
			Error = "NotReady",
		}
	end

	local harvestedCotton = {
		TypeId = slot.CottonTypeId,
		TypeName = CottonConfig.GetCottonType(slot.CottonTypeId).Name,
		Rarity = slot.Rarity,
		Quality = slot.Quality,
		Value = CottonConfig.GetCottonValue(slot.CottonTypeId, slot.Rarity, slot.Quality),
	}

	local queuedOnConveyor = GeneratorService:ProcessCotton(player, harvestedCotton)
	if not queuedOnConveyor then
		local accepted = InventoryService:AddItem(player, "RawCotton", SkillTreeService:GetHarvestAmount(player))
		if accepted <= 0 then
			return {
				Ok = false,
				Error = "StorageFull",
				ItemId = "RawCotton",
			}
		end
	end

	if slot.PlantModel then
		slot.PlantModel:Destroy()
		slot.PlantModel = nil
	end

	PlotService:SetSlotState(slot, {
		State = "Empty",
		CottonTypeId = "",
		Rarity = "",
		Quality = 0,
		GrowthStartedAt = 0,
		GrowthReadyAt = 0,
	})

	local visualPart = slot.VisualPart or slot.Part
	visualPart.Color = slot.Floor.Config.SlotColor
	updateSlotPrompt(slot)
	self:_notifyPlayer(player)

	return {
		Ok = true,
		Plot = PlotService:GetSnapshot(player),
		Cotton = harvestedCotton,
		QueuedOnConveyor = queuedOnConveyor,
	}
end

return CottonService
