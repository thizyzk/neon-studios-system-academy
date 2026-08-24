local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local PlotConfig = require(ReplicatedStorage.Shared.Modules.PlotConfig)
local Studs = require(ReplicatedStorage.Shared.Modules.Studs)
local WorldVisualStyle = require(ReplicatedStorage.Shared.Modules.WorldVisualStyle)
local ModelTemplateResolver = require(ServerScriptService.Modules.ModelTemplateResolver)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)

local PlotService = {}

PlotService.Plots = {}
PlotService.PlayerPlots = {}
PlotService.Remotes = nil
PlotService.FloorCreated = Instance.new("BindableEvent")

local GENERATED_ATTRIBUTE = "GeneratedByCottonFabricPlotService"

local function createFromTemplate(templatePaths: { { string } }, name: string, cframe: CFrame, parent: Instance)
	for _, templatePath in templatePaths do
		local clone = ModelTemplateResolver:Clone(templatePath, parent)
		if clone then
			clone.Name = name
			ModelTemplateResolver:SetAnchored(clone, true)
			ModelTemplateResolver:PivotTo(clone, cframe)
			clone:SetAttribute("UsesCottonFabricTemplate", true)

			return clone
		end
	end

	return nil
end

local function createPart(name: string, size: Vector3, cframe: CFrame, color: Color3, parent: Instance)
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent

	return part
end

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local plotsFolder = remotesFolder:FindFirstChild("Plots")
	if not plotsFolder then
		plotsFolder = Instance.new("Folder")
		plotsFolder.Name = "Plots"
		plotsFolder.Parent = remotesFolder
	end

	local unlockFloor = plotsFolder:FindFirstChild("UnlockFloor")
	if not unlockFloor then
		unlockFloor = Instance.new("RemoteFunction")
		unlockFloor.Name = "UnlockFloor"
		unlockFloor.Parent = plotsFolder
	end

	local plotUpdated = plotsFolder:FindFirstChild("PlotUpdated")
	if not plotUpdated then
		plotUpdated = Instance.new("RemoteEvent")
		plotUpdated.Name = "PlotUpdated"
		plotUpdated.Parent = plotsFolder
	end

	return {
		UnlockFloor = unlockFloor,
		PlotUpdated = plotUpdated,
	}
end

local function setSlotAttributes(slot)
	slot.Part:SetAttribute("SlotIndex", slot.Index)
	slot.Part:SetAttribute("SlotIndexOnFloor", slot.IndexOnFloor)
	slot.Part:SetAttribute("FloorIndex", slot.FloorIndex)
	slot.Part:SetAttribute("IsUnlocked", true)
	slot.Part:SetAttribute("State", slot.State)
	slot.Part:SetAttribute("CottonTypeId", slot.CottonTypeId)
	slot.Part:SetAttribute("Rarity", slot.Rarity)
	slot.Part:SetAttribute("Quality", slot.Quality)
	slot.Part:SetAttribute("GrowthStartedAt", slot.GrowthStartedAt)
	slot.Part:SetAttribute("GrowthReadyAt", slot.GrowthReadyAt)

	if slot.Model and slot.Model ~= slot.Part then
		ModelTemplateResolver:SetAttributeRecursive(slot.Model, "SlotIndex", slot.Index)
		ModelTemplateResolver:SetAttributeRecursive(slot.Model, "SlotIndexOnFloor", slot.IndexOnFloor)
		ModelTemplateResolver:SetAttributeRecursive(slot.Model, "FloorIndex", slot.FloorIndex)
		ModelTemplateResolver:SetAttributeRecursive(slot.Model, "OwnerUserId", slot.Part:GetAttribute("OwnerUserId"))
		ModelTemplateResolver:SetAttributeRecursive(slot.Model, "IsUnlocked", true)
		ModelTemplateResolver:SetAttributeRecursive(slot.Model, "State", slot.State)
	end
end

local function updateSlotVisual(slot)
	local visualPart = slot.VisualPart or slot.Part
	visualPart.Color = slot.Floor.Config.SlotColor
	visualPart.Transparency = 0

	local promptPart = slot.PromptPart or slot.Part
	local prompt = promptPart:FindFirstChild("CottonPrompt")
	if prompt and prompt:IsA("ProximityPrompt") then
		prompt.ActionText = "Plant"
		prompt.ObjectText = "Cotton Slot"
	end
end

local function createSlotPrompt(plot, slot)
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

	if prompt:IsA("ProximityPrompt") then
		prompt.ActionText = "Plant"
		prompt.ObjectText = "Cotton Slot"
	end

	if not prompt:GetAttribute("CottonServicePromptBound") then
		prompt:SetAttribute("CottonServicePromptBound", true)
		prompt.Triggered:Connect(function(player)
			if plot.Owner ~= player then
				return
			end

			local CottonConfig = require(ReplicatedStorage.Shared.Modules.CottonConfig)
			local CottonService = require(ServerScriptService.Services.CottonService)

			if slot.State == "Empty" then
				CottonService:PlantCotton(player, slot.Index, CottonConfig.DefaultCottonTypeId)
			elseif slot.State == "Ready" then
				CottonService:HarvestCotton(player, slot.Index)
			end
		end)
	end

	return prompt
end

function PlotService:_createRamp(plot, fromFloorIndex: number)
	local currentFloor = PlotConfig.GetFloorConfig(fromFloorIndex)
	local nextFloor = PlotConfig.GetFloorConfig(fromFloorIndex + 1)
	if not currentFloor or not nextFloor then
		return nil
	end

	local rampName = `Ramp_{fromFloorIndex}_To_{fromFloorIndex + 1}`
	local oldRamp = plot.Model:FindFirstChild(rampName)
	if oldRamp then
		oldRamp:Destroy()
	end

	local heightStuds = nextFloor.HeightStuds - currentFloor.HeightStuds
	local runStuds = Studs.scalar(28)
	local lengthStuds = math.sqrt((heightStuds * heightStuds) + (runStuds * runStuds))
	local angle = math.atan2(heightStuds, runStuds)
	local midpointYStuds = currentFloor.HeightStuds + (heightStuds / 2)
	local midpointStuds = plot.Position + Studs.vector(-24, midpointYStuds + Studs.scalar(0.75), -4)
	local rampCFrame = Studs.cframe(midpointStuds) * CFrame.Angles(-angle, 0, 0)

	local rampModel = createFromTemplate({
		{ "Ramps", `Ramp_{fromFloorIndex}_To_{fromFloorIndex + 1}` },
		{ "Ramps", "Ramp" },
	}, rampName, rampCFrame, plot.Model)
	if rampModel then
		rampModel:SetAttribute(GENERATED_ATTRIBUTE, true)
		rampModel:SetAttribute("FromFloorIndex", fromFloorIndex)
		rampModel:SetAttribute("ToFloorIndex", fromFloorIndex + 1)

		return rampModel
	end

	local ramp = createPart(
		rampName,
		Studs.vector(9, 1, lengthStuds),
		rampCFrame,
		Color3.fromRGB(104, 101, 94),
		plot.Model
	)
	WorldVisualStyle.Apply(ramp, "Ramp")
	ramp:SetAttribute(GENERATED_ATTRIBUTE, true)

	return ramp
end

function PlotService:_clearUnlockPad(plot)
	if plot.UnlockPad then
		if plot.UnlockPadModel then
			plot.UnlockPadModel:Destroy()
			plot.UnlockPadModel = nil
		else
			plot.UnlockPad:Destroy()
		end
		plot.UnlockPad = nil
	end
end

function PlotService:_getHighestCreatedFloorIndex(plot)
	local highestFloorIndex = 0

	for floorIndex in plot.Floors do
		if floorIndex > highestFloorIndex then
			highestFloorIndex = floorIndex
		end
	end

	return highestFloorIndex
end

function PlotService:_refreshUnlockPad(plot)
	self:_clearUnlockPad(plot)

	local currentFloorIndex = self:_getHighestCreatedFloorIndex(plot)
	local nextFloorConfig = PlotConfig.GetFloorConfig(currentFloorIndex + 1)
	local currentFloor = plot.Floors[currentFloorIndex]
	if not nextFloorConfig or not currentFloor then
		return
	end

	local padName = `Unlock_Floor_{nextFloorConfig.Index}`
	local padCFrame = currentFloor.Part.CFrame * Studs.offset(19, 1.1, -20)
	local padModel = createFromTemplate({
		{ "Pads", `Unlock_Floor_{nextFloorConfig.Index}` },
		{ "Pads", "UnlockFloor" },
	}, padName, padCFrame, plot.Model)
	local pad
	if padModel then
		pad = ModelTemplateResolver:FindPart(padModel, { "PromptPart", "Pad", "Base" })
		plot.UnlockPadModel = padModel
	else
		pad = createPart(
			padName,
			Studs.vector(14, 0.6, 10),
			padCFrame,
			Color3.fromRGB(210, 170, 75),
			plot.Model
		)
		WorldVisualStyle.Apply(pad, "UpgradePad")
		pad.Material = Enum.Material.Neon
		plot.UnlockPadModel = nil
	end
	if not pad then
		padModel:Destroy()
		padModel = nil
		plot.UnlockPadModel = nil
		pad = createPart(
			padName,
			Studs.vector(14, 0.6, 10),
			padCFrame,
			Color3.fromRGB(210, 170, 75),
			plot.Model
		)
		WorldVisualStyle.Apply(pad, "UpgradePad")
		pad.Material = Enum.Material.Neon
	end

	pad:SetAttribute(GENERATED_ATTRIBUTE, true)
	pad:SetAttribute("PlotIndex", plot.Index)
	pad:SetAttribute("OwnerUserId", plot.OwnerUserId)
	pad:SetAttribute("UnlockFloorIndex", nextFloorConfig.Index)
	pad:SetAttribute("UnlockCost", nextFloorConfig.UnlockCost)

	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "UnlockFloorPrompt"
	prompt.HoldDuration = 0.45
	prompt.MaxActivationDistance = Studs.scalar(14)
	prompt.RequiresLineOfSight = false
	prompt.ActionText = "Build Floor"
	prompt.ObjectText = `{nextFloorConfig.Name} | ${nextFloorConfig.UnlockCost}`
	prompt.Parent = pad

	prompt.Triggered:Connect(function(player)
		if plot.Owner == player then
			self:UnlockFloor(player, nextFloorConfig.Index)
		end
	end)

	plot.UnlockPad = pad
end

function PlotService:_createFloor(plot, floorConfig)
	if plot.Floors[floorConfig.Index] then
		return plot.Floors[floorConfig.Index]
	end

	local floorPosition = PlotConfig.GetFloorPosition(plot.Position, floorConfig.Index)
	local floorModel = Instance.new("Folder")
	floorModel.Name = `Floor_{floorConfig.Index}`
	floorModel.Parent = plot.Model

	local floorName = if floorConfig.Index == 1 then "Floor" else `Floor_{floorConfig.Index}_Platform`
	local floorTemplate = createFromTemplate({
		{ "Floors", `Floor_{floorConfig.Index}` },
		{ "Floors", "Floor" },
	}, floorName, Studs.cframe(floorPosition), floorModel)
	local floorPart = if floorTemplate
		then ModelTemplateResolver:GetMainPart(floorTemplate)
		else createPart(
			floorName,
			PlotConfig.PlotSizeStuds,
			Studs.cframe(floorPosition),
			floorConfig.Color,
			floorModel
		)
	if not floorTemplate then
		WorldVisualStyle.Apply(floorPart, "Floor")
	end
	if not floorPart then
		floorTemplate:Destroy()
		floorTemplate = nil
		floorPart = createPart(
			floorName,
			PlotConfig.PlotSizeStuds,
			Studs.cframe(floorPosition),
			floorConfig.Color,
			floorModel
		)
		WorldVisualStyle.Apply(floorPart, "Floor")
	end
	floorPart:SetAttribute("PlotIndex", plot.Index)
	floorPart:SetAttribute("FloorIndex", floorConfig.Index)
	floorPart:SetAttribute("OwnerUserId", plot.OwnerUserId)
	floorPart:SetAttribute("IsUnlocked", true)

	local slotsFolder = Instance.new("Folder")
	slotsFolder.Name = "Slots"
	slotsFolder.Parent = floorModel

	local floor = {
		Index = floorConfig.Index,
		Config = floorConfig,
		Model = floorModel,
		Part = floorPart,
		IsUnlocked = true,
		Slots = {},
	}

	local globalSlotStart = PlotConfig.GetFloorSlotStart(floorConfig.Index)
	for slotIndexOnFloor = 1, floorConfig.Slots do
		local globalSlotIndex = globalSlotStart + slotIndexOnFloor - 1
		local slotPosition = floorPosition + PlotConfig.GetSlotOffset(slotIndexOnFloor, floorConfig.Index)
		local slotName = `Slot_{globalSlotIndex}`
		local slotModel = createFromTemplate({
			{ "Slots", `Floor_{floorConfig.Index}`, `Slot_{slotIndexOnFloor}` },
			{ "Slots", `Slot_{globalSlotIndex}` },
			{ "Slots", "Slot" },
		}, slotName, Studs.cframe(slotPosition), slotsFolder)
		local slotPart = if slotModel
			then ModelTemplateResolver:GetMainPart(slotModel)
			else createPart(
				slotName,
				PlotConfig.SlotSizeStuds,
				Studs.cframe(slotPosition),
				floorConfig.SlotColor,
				slotsFolder
			)
		if not slotPart then
			slotModel:Destroy()
			slotModel = nil
			slotPart = createPart(
				slotName,
				PlotConfig.SlotSizeStuds,
				Studs.cframe(slotPosition),
				floorConfig.SlotColor,
				slotsFolder
			)
		end
		if not slotModel then
			slotPart.Material = Enum.Material.Ground
			WorldVisualStyle.Apply(slotPart, "Soil")
		end
		slotPart:SetAttribute("OwnerUserId", plot.OwnerUserId)

		local slot = {
			Index = globalSlotIndex,
			IndexOnFloor = slotIndexOnFloor,
			FloorIndex = floorConfig.Index,
			Floor = floor,
			Model = slotModel or slotPart,
			Part = slotPart,
			PromptPart = if slotModel then ModelTemplateResolver:FindPart(slotModel, { "PromptPart", "Slot", "Soil", "Base" }) else slotPart,
			VisualPart = if slotModel then ModelTemplateResolver:FindPart(slotModel, { "StateColorPart", "Soil", "Slot", "Base" }) else slotPart,
			IsUnlocked = true,
			State = "Empty",
			CottonTypeId = "",
			Rarity = "",
			Quality = 0,
			GrowthStartedAt = 0,
			GrowthReadyAt = 0,
			PlantModel = nil,
		}

		floor.Slots[slotIndexOnFloor] = slot
		plot.Slots[globalSlotIndex] = slot
		setSlotAttributes(slot)
		createSlotPrompt(plot, slot)
		updateSlotVisual(slot)
	end

	plot.Floors[floor.Index] = floor
	plot.UnlockedFloors[floor.Index] = true

	if floor.Index == 1 then
		plot.Floor = floorPart
	else
		self:_createRamp(plot, floor.Index - 1)
	end

	return floor
end

function PlotService:_createPlot(plotIndex: number)
	local plotsFolder = Workspace:FindFirstChild("Plots")
	if not plotsFolder then
		plotsFolder = Instance.new("Folder")
		plotsFolder.Name = "Plots"
		plotsFolder.Parent = Workspace
	end

	local plotPosition = PlotConfig.GetPlotPosition(plotIndex)
	local plotModel = plotsFolder:FindFirstChild(`Plot_{plotIndex}`)
	if plotModel and not plotModel:IsA("Model") then
		plotModel = nil
	end

	if not plotModel then
		plotModel = ModelTemplateResolver:Clone({ "Plots", `Plot_{plotIndex}` }, plotsFolder)
			or ModelTemplateResolver:Clone({ "Plots", "PlotTemplate" }, plotsFolder)

		if plotModel then
			plotModel.Name = `Plot_{plotIndex}`
			ModelTemplateResolver:SetAnchored(plotModel, true)
			ModelTemplateResolver:PivotTo(plotModel, Studs.cframe(plotPosition))
			plotModel:SetAttribute("UsesCottonFabricTemplate", true)
		else
			plotModel = Instance.new("Model")
			plotModel.Name = `Plot_{plotIndex}`
			plotModel.Parent = plotsFolder
			plotModel:SetAttribute(GENERATED_ATTRIBUTE, true)
		end
	else
		local plotMainPart = ModelTemplateResolver:GetMainPart(plotModel)
		if plotMainPart then
			plotPosition = plotMainPart.Position
		end
	end

	local plot = {
		Index = plotIndex,
		Position = plotPosition,
		Model = plotModel,
		Floor = nil,
		Floors = {},
		UnlockedFloors = {},
		Owner = nil,
		OwnerUserId = 0,
		Slots = {},
		UnlockPad = nil,
		UnlockPadModel = nil,
	}

	self:_createFloor(plot, PlotConfig.Floors[1])
	plotModel:SetAttribute("PlotIndex", plotIndex)
	plotModel:SetAttribute("OwnerUserId", 0)
	plotModel:SetAttribute("OwnerName", "")
	plotModel:SetAttribute("UnlockedFloorCount", 1)
	self:_refreshUnlockPad(plot)

	self.Plots[plotIndex] = plot
end

function PlotService:_clearGeneratedPlots()
	local plotsFolder = Workspace:FindFirstChild("Plots")
	if not plotsFolder then
		return
	end

	for _, child in plotsFolder:GetChildren() do
		if child:GetAttribute(GENERATED_ATTRIBUTE) then
			child:Destroy()
		end
	end
end

function PlotService:EnsurePlots()
	local existingCount = 0

	for _ in self.Plots do
		existingCount += 1
	end

	if existingCount > 0 then
		return
	end

	self:_clearGeneratedPlots()

	for plotIndex = 1, PlotConfig.PlotCount do
		self:_createPlot(plotIndex)
	end
end

function PlotService:_notifyPlayer(player: Player)
	if self.Remotes then
		self.Remotes.PlotUpdated:FireClient(player, self:GetSnapshot(player))
	end
end

function PlotService:_setPlotOwner(plot, player: Player?)
	plot.Owner = player
	plot.OwnerUserId = if player then player.UserId else 0

	plot.Model:SetAttribute("OwnerUserId", plot.OwnerUserId)
	plot.Model:SetAttribute("OwnerName", if player then player.Name else "")

	for _, floor in plot.Floors do
		floor.Part:SetAttribute("OwnerUserId", plot.OwnerUserId)
	end

	for _, slot in plot.Slots do
		slot.Part:SetAttribute("OwnerUserId", plot.OwnerUserId)
		if slot.Model and slot.Model ~= slot.Part then
			ModelTemplateResolver:SetAttributeRecursive(slot.Model, "OwnerUserId", plot.OwnerUserId)
		end
	end

	if plot.UnlockPad then
		plot.UnlockPad:SetAttribute("OwnerUserId", plot.OwnerUserId)
	end

	if plot.UnlockPadModel then
		ModelTemplateResolver:SetAttributeRecursive(plot.UnlockPadModel, "OwnerUserId", plot.OwnerUserId)
	end
end

function PlotService:_resetSlot(slot)
	if slot.PlantModel then
		slot.PlantModel:Destroy()
	end

	slot.State = "Empty"
	slot.CottonTypeId = ""
	slot.Rarity = ""
	slot.Quality = 0
	slot.GrowthStartedAt = 0
	slot.GrowthReadyAt = 0
	slot.PlantModel = nil

	setSlotAttributes(slot)
	updateSlotVisual(slot)
end

function PlotService:_removeFloorsAbove(plot, floorIndex: number)
	for existingFloorIndex, floor in plot.Floors do
		if existingFloorIndex > floorIndex then
			for _, slot in floor.Slots do
				if slot.PlantModel then
					slot.PlantModel:Destroy()
				end
				plot.Slots[slot.Index] = nil
			end

			floor.Model:Destroy()
			plot.Floors[existingFloorIndex] = nil
			plot.UnlockedFloors[existingFloorIndex] = nil
		end
	end

	for _, child in plot.Model:GetChildren() do
		if child.Name:match("^Ramp_%d+_To_%d+$") then
			local fromFloorIndex = tonumber(child.Name:match("^Ramp_(%d+)_To_%d+$"))
			if fromFloorIndex and fromFloorIndex >= floorIndex then
				child:Destroy()
			end
		end
	end
end

function PlotService:Init()
	self.Remotes = getOrCreateRemotes()
	self.Remotes.UnlockFloor.OnServerInvoke = function(player, floorIndex)
		return self:UnlockFloor(player, floorIndex)
	end

	self:EnsurePlots()
end

function PlotService:Start()
	for _, player in Players:GetPlayers() do
		self:AssignPlot(player)
	end

	Players.PlayerAdded:Connect(function(player)
		self:AssignPlot(player)
	end)

	Players.PlayerRemoving:Connect(function(player)
		self:ReleasePlot(player)
	end)
end

function PlotService:AssignPlot(player: Player)
	self:EnsurePlots()

	if self.PlayerPlots[player] then
		return self.PlayerPlots[player]
	end

	for _, plot in self.Plots do
		if plot.Owner == nil then
			self:_setPlotOwner(plot, player)
			self.PlayerPlots[player] = plot
			self:_notifyPlayer(player)
			return plot
		end
	end

	warn(`[PlotService] No available plot for {player.Name}`)
	return nil
end

function PlotService:ReleasePlot(player: Player)
	local plot = self.PlayerPlots[player]
	if not plot then
		return
	end

	for _, slot in plot.Slots do
		self:_resetSlot(slot)
	end

	self:_removeFloorsAbove(plot, 1)
	plot.UnlockedFloors = {
		[1] = true,
	}
	plot.Model:SetAttribute("UnlockedFloorCount", 1)
	self:_refreshUnlockPad(plot)

	self.PlayerPlots[player] = nil
	self:_setPlotOwner(plot, nil)
end

function PlotService:GetPlot(player: Player)
	return self.PlayerPlots[player] or self:AssignPlot(player)
end

function PlotService:GetFloor(player: Player, floorIndex: number)
	local plot = self:GetPlot(player)
	if not plot then
		return nil
	end

	return plot.Floors[floorIndex]
end

function PlotService:GetFloorIndexForSlot(slotIndex: number)
	return PlotConfig.GetFloorIndexForSlot(slotIndex)
end

function PlotService:IsSlotLocked(player: Player, slotIndex: number)
	local floorIndex = self:GetFloorIndexForSlot(slotIndex)
	if not floorIndex then
		return false
	end

	return not self:IsFloorUnlocked(player, floorIndex)
end

function PlotService:GetSlot(player: Player, slotIndex: number)
	local plot = self:GetPlot(player)
	if not plot then
		return nil
	end

	return plot.Slots[slotIndex]
end

function PlotService:IsFloorUnlocked(player: Player, floorIndex: number)
	local floor = self:GetFloor(player, floorIndex)

	return floor ~= nil
end

function PlotService:UnlockFloor(player: Player, floorIndex: number)
	if typeof(floorIndex) ~= "number" then
		return {
			Ok = false,
			Error = "InvalidFloor",
		}
	end

	local floorConfig = PlotConfig.GetFloorConfig(floorIndex)
	local plot = self:GetPlot(player)
	if not plot or not floorConfig then
		return {
			Ok = false,
			Error = "FloorNotFound",
		}
	end

	if plot.Floors[floorIndex] then
		return {
			Ok = false,
			Error = "AlreadyUnlocked",
			Plot = self:GetSnapshot(player),
		}
	end

	local previousFloor = plot.Floors[floorIndex - 1]
	if not previousFloor then
		return {
			Ok = false,
			Error = "PreviousFloorLocked",
		}
	end

	local cost = floorConfig.UnlockCost
	local cash = CurrencyExchangeService:GetBalance(player, "Cash") or 0
	if cost > 0 and cash < cost then
		return {
			Ok = false,
			Error = "NotEnoughCash",
			Cost = cost,
		}
	end

	if cost > 0 then
		local debited = CurrencyExchangeService:AdjustBalance(player, "Cash", -cost, {
			Reason = "FloorPurchase",
			ReferenceId = tostring(floorIndex),
		})
		if not debited then
			return {
				Ok = false,
				Error = "NotEnoughCash",
				Cost = cost,
			}
		end
	end

	local floor = self:_createFloor(plot, floorConfig)
	self:_refreshUnlockPad(plot)

	local unlockedFloorCount = self:_getHighestCreatedFloorIndex(plot)
	plot.Model:SetAttribute("UnlockedFloorCount", unlockedFloorCount)

	self.FloorCreated:Fire(plot.Index, floor.Index)
	self:_notifyPlayer(player)

	return {
		Ok = true,
		FloorIndex = floorIndex,
		Cost = cost,
		Plot = self:GetSnapshot(player),
	}
end

function PlotService:GetSnapshot(player: Player)
	local plot = self:GetPlot(player)
	if not plot then
		return nil
	end

	local floors = {}
	local slots = {}

	for _, floorConfig in PlotConfig.Floors do
		local floor = plot.Floors[floorConfig.Index]
		table.insert(floors, {
			Index = floorConfig.Index,
			Name = floorConfig.Name,
			Description = floorConfig.Description,
			IsUnlocked = floor ~= nil,
			IsCreated = floor ~= nil,
			UnlockCost = floorConfig.UnlockCost,
			SlotCount = floorConfig.Slots,
			CreatedSlotCount = if floor then #floor.Slots else 0,
		})
	end

	for _, floorConfig in PlotConfig.Floors do
		local floor = plot.Floors[floorConfig.Index]
		if floor then
			for _, slot in floor.Slots do
				table.insert(slots, {
					Index = slot.Index,
					IndexOnFloor = slot.IndexOnFloor,
					FloorIndex = slot.FloorIndex,
					IsUnlocked = true,
					State = slot.State,
					CottonTypeId = slot.CottonTypeId,
					Rarity = slot.Rarity,
					Quality = slot.Quality,
					GrowthStartedAt = slot.GrowthStartedAt,
					GrowthReadyAt = slot.GrowthReadyAt,
				})
			end
		end
	end

	return {
		PlotIndex = plot.Index,
		OwnerUserId = plot.OwnerUserId,
		Floors = floors,
		Slots = slots,
	}
end

function PlotService:SetSlotState(slot, patch)
	for key, value in patch do
		slot[key] = value
	end

	setSlotAttributes(slot)
end

return PlotService
