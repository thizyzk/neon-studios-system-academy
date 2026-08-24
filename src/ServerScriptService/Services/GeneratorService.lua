local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Conveyor = require(ReplicatedStorage.Shared.Classes.Conveyor)
local ConveyorUpgrader = require(ReplicatedStorage.Shared.Classes.ConveyorUpgrader)
local Cotton = require(ReplicatedStorage.Shared.Classes.Cotton)
local Studs = require(ReplicatedStorage.Shared.Modules.Studs)

local ServerScriptService = game:GetService("ServerScriptService")
local InventoryService = require(ServerScriptService.Services.InventoryService)
local ModelTemplateResolver = require(ServerScriptService.Modules.ModelTemplateResolver)
local PlotService = require(ServerScriptService.Services.PlotService)
local SkillTreeService = require(ServerScriptService.Services.SkillTreeService)

local GeneratorService = {}

GeneratorService.Factories = {}

local GENERATED_ATTRIBUTE = "GeneratedByCottonFabricGeneratorService"

local function createFromTemplate(templatePaths, name, cframe, parent)
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

local UPGRADER_CONFIGS = {
	{
		Id = "fiber_cleaner",
		Name = "Fiber Cleaner",
		OffsetStuds = Studs.vector(-7, 2.2, 23),
		RadiusStuds = Studs.scalar(4.5),
		QualityBonus = 8,
		ValueMultiplier = 1.15,
		Color = Color3.fromRGB(85, 190, 255),
	},
	{
		Id = "soft_press",
		Name = "Soft Press",
		OffsetStuds = Studs.vector(8, 2.2, 23),
		RadiusStuds = Studs.scalar(4.5),
		QualityBonus = 4,
		ValueMultiplier = 1.35,
		Color = Color3.fromRGB(255, 188, 86),
	},
}

function GeneratorService:Init()
	if not ReplicatedStorage:FindFirstChild("Cottons") then
		local cottonsFolder = Instance.new("Folder")
		cottonsFolder.Name = "Cottons"
		cottonsFolder.Parent = ReplicatedStorage
	end
end

function GeneratorService:Start()
	PlotService:EnsurePlots()
	self:_createFactories()
end

function GeneratorService:_createFactories()
	for _, plot in PlotService.Plots do
		self:_createFactory(plot)
	end
end

function GeneratorService:_createFactory(plot)
	if self.Factories[plot.Index] then
		return self.Factories[plot.Index]
	end

	local oldFactory = plot.Model:FindFirstChild("ConveyorSystem")
	if oldFactory and oldFactory:GetAttribute(GENERATED_ATTRIBUTE) then
		oldFactory:Destroy()
	end

	local factory = Instance.new("Folder")
	factory.Name = "ConveyorSystem"
	factory.Parent = plot.Model
	factory:SetAttribute(GENERATED_ATTRIBUTE, true)

	local conveyorCenterStuds = plot.Floor.Position + Studs.vector(0, 2, 23)
	local conveyorModel = createFromTemplate({
		{ "Conveyors", "MainConveyor" },
		{ "Factory", "MainConveyor" },
	}, `Conveyor_Plot_{plot.Index}_Main`, Studs.cframe(conveyorCenterStuds), factory)
	local conveyor = Conveyor.new({
		Id = `Plot_{plot.Index}_Main`,
		Parent = factory,
		CFrame = Studs.cframe(conveyorCenterStuds),
		SizeStuds = Studs.vector(40, 0.7, 5.5),
		SpeedStudsPerSecond = Studs.perSecond(8),
		Direction = Vector3.xAxis,
		Model = conveyorModel,
		Delivered = function(cotton)
			self:_deliverCotton(plot, cotton)
		end,
	})

	for _, upgraderConfig in UPGRADER_CONFIGS do
		local upgraderPositionStuds = plot.Floor.Position + upgraderConfig.OffsetStuds
		local upgraderModel = createFromTemplate({
			{ "Upgraders", upgraderConfig.Id },
			{ "Upgraders", "Upgrader" },
		}, `Upgrader_{upgraderConfig.Id}`, Studs.cframe(upgraderPositionStuds), factory)
		local upgrader = ConveyorUpgrader.new({
			Id = upgraderConfig.Id,
			Name = upgraderConfig.Name,
			Parent = factory,
			CFrame = Studs.cframe(upgraderPositionStuds),
			RadiusStuds = upgraderConfig.RadiusStuds,
			QualityBonus = upgraderConfig.QualityBonus,
			ValueMultiplier = upgraderConfig.ValueMultiplier,
			Color = upgraderConfig.Color,
			Model = upgraderModel,
		})

		conveyor:AddUpgrader(upgrader)
	end

	conveyor:Start()

	self.Factories[plot.Index] = {
		Plot = plot,
		Conveyor = conveyor,
		CottonsFolder = conveyor.CottonsFolder,
	}

	return self.Factories[plot.Index]
end

function GeneratorService:GetFactory(player)
	local plot = PlotService:GetPlot(player)
	if not plot then
		return nil
	end

	return self.Factories[plot.Index] or self:_createFactory(plot)
end

function GeneratorService:ProcessCotton(player, cottonData)
	local factory = self:GetFactory(player)
	if not factory then
		return false
	end

	local cottonPart = ModelTemplateResolver:Clone({ "Cottons", "CottonBale" }, nil)
	if cottonPart and not cottonPart:IsA("BasePart") then
		cottonPart:Destroy()
		cottonPart = nil
	end

	local cotton = Cotton.new({
		TypeId = cottonData.TypeId,
		TypeName = cottonData.TypeName,
		Rarity = cottonData.Rarity,
		Quality = cottonData.Quality,
		Value = cottonData.Value,
		OwnerUserId = player.UserId,
		Parent = factory.CottonsFolder,
		Part = cottonPart,
	})

	return factory.Conveyor:AddCotton(cotton), cotton:GetSnapshot()
end

function GeneratorService:_deliverCotton(plot, cotton)
	local owner = plot.Owner

	if owner and owner.UserId == cotton.OwnerUserId then
		InventoryService:AddItem(owner, "RawCotton", SkillTreeService:GetHarvestAmount(owner))
	end

	cotton:Destroy()
end

return GeneratorService
