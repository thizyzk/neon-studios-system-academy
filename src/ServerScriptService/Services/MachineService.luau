local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local MachineConfig = require(ReplicatedStorage.Shared.Modules.MachineConfig)
local Studs = require(ReplicatedStorage.Shared.Modules.Studs)
local WorldVisualStyle = require(ReplicatedStorage.Shared.Modules.WorldVisualStyle)
local EconomyService = require(ServerScriptService.Services.EconomyService)
local InventoryService = require(ServerScriptService.Services.InventoryService)
local ModelTemplateResolver = require(ServerScriptService.Modules.ModelTemplateResolver)
local PlotService = require(ServerScriptService.Services.PlotService)
local SkillTreeService = require(ServerScriptService.Services.SkillTreeService)
local UpgradeService = require(ServerScriptService.Services.UpgradeService)

local MachineService = {}

MachineService.ActiveCycles = {}
MachineService.Remotes = nil

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local factoryFolder = remotesFolder:FindFirstChild("Factory")
	if not factoryFolder then
		factoryFolder = Instance.new("Folder")
		factoryFolder.Name = "Factory"
		factoryFolder.Parent = remotesFolder
	end

	local feedMachine = factoryFolder:FindFirstChild("FeedMachine")
	if not feedMachine then
		feedMachine = Instance.new("RemoteFunction")
		feedMachine.Name = "FeedMachine"
		feedMachine.Parent = factoryFolder
	end

	local getFactory = factoryFolder:FindFirstChild("GetFactory")
	if not getFactory then
		getFactory = Instance.new("RemoteFunction")
		getFactory.Name = "GetFactory"
		getFactory.Parent = factoryFolder
	end

	local factoryUpdated = factoryFolder:FindFirstChild("FactoryUpdated")
	if not factoryUpdated then
		factoryUpdated = Instance.new("RemoteEvent")
		factoryUpdated.Name = "FactoryUpdated"
		factoryUpdated.Parent = factoryFolder
	end

	return {
		FeedMachine = feedMachine,
		GetFactory = getFactory,
		FactoryUpdated = factoryUpdated,
	}
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

local function createPrompt(parent: BasePart, name: string, actionText: string, objectText: string)
	local prompt = parent:FindFirstChild(name)
	if not prompt then
		prompt = Instance.new("ProximityPrompt")
		prompt.Name = name
		prompt.HoldDuration = 0.25
		prompt.MaxActivationDistance = Studs.scalar(12)
		prompt.RequiresLineOfSight = false
		prompt.Parent = parent
	end

	if prompt:IsA("ProximityPrompt") then
		prompt.ActionText = actionText
		prompt.ObjectText = objectText
	end

	return prompt
end

function MachineService:_getPlayerCycleKey(player: Player, machineId: string)
	return `{player.UserId}:{machineId}`
end

function MachineService:_notify(player: Player)
	if self.Remotes then
		self.Remotes.FactoryUpdated:FireClient(player, self:GetSnapshot(player))
	end
end

function MachineService:GetSnapshot(player: Player)
	local machines = {}

	for _, machineId in MachineConfig.Order do
		local level = UpgradeService:GetMachineLevel(player, machineId)
		local machine = MachineConfig.GetMachine(machineId)

		machines[machineId] = {
			Id = machineId,
			DisplayName = machine.DisplayName,
			InputItemId = machine.InputItemId,
			OutputItemId = machine.OutputItemId,
			Level = level,
			CycleTime = math.max(
				1,
				math.floor(MachineConfig.GetCycleTime(machineId, level) / SkillTreeService:GetMachineSpeedMultiplier(player, machineId))
			),
			UpgradeCost = MachineConfig.GetUpgradeCost(machineId, level),
			IsRunning = self.ActiveCycles[self:_getPlayerCycleKey(player, machineId)] ~= nil,
		}
	end

	return {
		Machines = machines,
	}
end

function MachineService:RunMachine(player: Player, machineId: string)
	local machine = MachineConfig.GetMachine(machineId)
	if not machine then
		return {
			Ok = false,
			Error = "MachineNotFound",
		}
	end

	local plot = PlotService:GetPlot(player)
	if not plot then
		return {
			Ok = false,
			Error = "PlotNotFound",
		}
	end

	local cycleKey = self:_getPlayerCycleKey(player, machineId)
	if self.ActiveCycles[cycleKey] then
		return {
			Ok = false,
			Error = "MachineBusy",
		}
	end

	if InventoryService:GetItemCount(player, machine.InputItemId) < machine.InputAmount then
		return {
			Ok = false,
			Error = "MissingInput",
			InputItemId = machine.InputItemId,
		}
	end

	if not InventoryService:RemoveItem(player, machine.InputItemId, machine.InputAmount) then
		return {
			Ok = false,
			Error = "MissingInput",
			InputItemId = machine.InputItemId,
		}
	end

	local level = UpgradeService:GetMachineLevel(player, machineId)
	local cycleTime = math.max(
		1,
		math.floor(MachineConfig.GetCycleTime(machineId, level) / SkillTreeService:GetMachineSpeedMultiplier(player, machineId))
	)
	self.ActiveCycles[cycleKey] = true
	self:_setMachineVisual(plot, machineId, true)
	self:_notify(player)

	task.delay(cycleTime, function()
		self.ActiveCycles[cycleKey] = nil

		local accepted = InventoryService:AddItem(player, machine.OutputItemId, machine.OutputAmount)
		if accepted < machine.OutputAmount then
			InventoryService:AddItem(player, machine.InputItemId, machine.InputAmount)
		end

		self:_setMachineVisual(plot, machineId, false)
		self:_notify(player)
	end)

	return {
		Ok = true,
		MachineId = machineId,
		CycleTime = cycleTime,
		Factory = self:GetSnapshot(player),
	}
end

function MachineService:_setMachineVisual(plot, machineId: string, isRunning: boolean)
	if not plot.FactoryParts then
		return
	end

	local part = if plot.FactoryVisualParts then plot.FactoryVisualParts[machineId] else plot.FactoryParts[machineId]
	if part then
		local machine = MachineConfig.GetMachine(machineId)
		part.Color = if isRunning then machine.RunningColor else machine.Color
	end
end

function MachineService:_createFactoryParts(plot)
	if plot.FactoryParts then
		return
	end

	local factoryFolder = Instance.new("Folder")
	factoryFolder.Name = "FactoryControls"
	factoryFolder.Parent = plot.Model

	local floorCFrame = plot.Floor.CFrame
	local sellPadModel = createFromTemplate({
		{ "Factory", "SellPad" },
		{ "Pads", "SellPad" },
	}, "SellPad", floorCFrame * Studs.offset(20, 1, 17), factoryFolder)
	local sellPad = if sellPadModel
		then ModelTemplateResolver:FindPart(sellPadModel, { "PromptPart", "Pad", "Base" })
		else createPart(
			"SellPad",
			Studs.vector(10, 0.5, 8),
			floorCFrame * Studs.offset(20, 1, 17),
			Color3.fromRGB(80, 160, 95),
			factoryFolder
		)
	if not sellPadModel then
		WorldVisualStyle.Apply(sellPad, "SellPad")
	end
	if not sellPad then
		sellPadModel:Destroy()
		sellPadModel = nil
		sellPad = createPart(
			"SellPad",
			Studs.vector(10, 0.5, 8),
			floorCFrame * Studs.offset(20, 1, 17),
			Color3.fromRGB(80, 160, 95),
			factoryFolder
		)
		WorldVisualStyle.Apply(sellPad, "SellPad")
	end

	plot.FactoryParts = {
		SellPad = sellPad,
	}
	plot.FactoryVisualParts = {}

	for _, machineId in MachineConfig.Order do
		local currentMachineId = machineId
		local machine = MachineConfig.GetMachine(currentMachineId)
		local factoryOffsetStuds = machine.FactoryOffsetStuds
		local machineModel = createFromTemplate({
			{ "Machines", currentMachineId },
			{ "Factory", currentMachineId },
			{ "Machines", "Machine" },
		}, currentMachineId, floorCFrame * Studs.cframe(factoryOffsetStuds), factoryFolder)
		local machinePart = if machineModel
			then ModelTemplateResolver:FindPart(machineModel, { "PromptPart", "ControlPart", "Body", "Base" })
			else createPart(
				currentMachineId,
				Studs.vector(9, 5, 7),
				floorCFrame * Studs.cframe(factoryOffsetStuds),
				machine.Color,
				factoryFolder
			)
		if not machineModel then
			WorldVisualStyle.Apply(machinePart, "Machine")
		end
	if not machinePart then
		machineModel:Destroy()
		machineModel = nil
		machinePart = createPart(
			currentMachineId,
				Studs.vector(9, 5, 7),
				floorCFrame * Studs.cframe(factoryOffsetStuds),
				machine.Color,
				factoryFolder
			)
			WorldVisualStyle.Apply(machinePart, "Machine")
		end
		machinePart:SetAttribute("MachineId", currentMachineId)
		plot.FactoryParts[currentMachineId] = machinePart
		plot.FactoryVisualParts[currentMachineId] = if machineModel
			then ModelTemplateResolver:FindPart(machineModel, { "StateColorPart", "Body", "Base" })
			else machinePart

		local machinePrompt = createPrompt(machinePart, `{currentMachineId}Prompt`, "Run", machine.DisplayName)
		machinePrompt.Triggered:Connect(function(player)
			if plot.Owner == player then
				self:RunMachine(player, currentMachineId)
			end
		end)

		local upgradeName = `{currentMachineId}UpgradePad`
		local upgradePadModel = createFromTemplate({
			{ "Pads", upgradeName },
			{ "Factory", upgradeName },
			{ "Pads", "MachineUpgradePad" },
		}, upgradeName, floorCFrame * Studs.offset(factoryOffsetStuds.X, 1, 8), factoryFolder)
		local upgradePad = if upgradePadModel
			then ModelTemplateResolver:FindPart(upgradePadModel, { "PromptPart", "Pad", "Base" })
			else createPart(
				upgradeName,
				Studs.vector(9, 0.5, 4),
				floorCFrame * Studs.offset(factoryOffsetStuds.X, 1, 8),
				Color3.fromRGB(189, 150, 74),
				factoryFolder
			)
		if not upgradePadModel then
			WorldVisualStyle.Apply(upgradePad, "UpgradePad")
		end
	if not upgradePad then
		upgradePadModel:Destroy()
		upgradePadModel = nil
		upgradePad = createPart(
			upgradeName,
				Studs.vector(9, 0.5, 4),
				floorCFrame * Studs.offset(factoryOffsetStuds.X, 1, 8),
				Color3.fromRGB(189, 150, 74),
				factoryFolder
			)
			WorldVisualStyle.Apply(upgradePad, "UpgradePad")
		end
		upgradePad:SetAttribute("MachineId", currentMachineId)

		local upgradePrompt = createPrompt(upgradePad, `{currentMachineId}UpgradePrompt`, "Upgrade", machine.DisplayName)
		upgradePrompt.Triggered:Connect(function(player)
			if plot.Owner == player then
				UpgradeService:BuyMachineUpgrade(player, currentMachineId)
				self:_notify(player)
			end
		end)
	end

	local sellPrompt = createPrompt(sellPad, "SellPrompt", "Sell", "Finished Goods")
	sellPrompt.Triggered:Connect(function(player)
		if plot.Owner == player then
			EconomyService:SellProducts(player)
			self:_notify(player)
		end
	end)
end

function MachineService:Init()
	self.Remotes = getOrCreateRemotes()
	self.Remotes.FeedMachine.OnServerInvoke = function(player, machineId)
		return self:RunMachine(player, machineId or "Cleaner")
	end
	self.Remotes.GetFactory.OnServerInvoke = function(player)
		return self:GetSnapshot(player)
	end
end

function MachineService:Start()
	for _, plot in PlotService.Plots do
		self:_createFactoryParts(plot)
	end
end

return MachineService
