--[[
	ResourceGatheringService

	Proposito:
	Orquestra coleta generica de recursos registrados, validando distancia,
	cooldown e capacidade do inventario. A lista de recursos inicia vazia para
	nao duplicar a colheita de algodao que CottonService ja controla.

	Exemplo de uso:
	local Gathering = require(ServerScriptService.Services.Economy.ResourceGatheringService)
	Gathering:RegisterNode(workspace.OreNode, "IronOre")
	local result = Gathering:Gather(player, workspace.OreNode)
]]

local CollectionService = game:GetService("CollectionService")
local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local EventBus = require(ServerScriptService.Services.Core.EventBus)
local InventoryService = require(ServerScriptService.Services.InventoryService)

local ResourceGatheringService = {}
ResourceGatheringService.__index = ResourceGatheringService

local function getPosition(instance)
	if instance:IsA("BasePart") then
		return instance.Position
	end
	if instance:IsA("Model") then
		return instance:GetPivot().Position
	end
	return nil
end

function ResourceGatheringService.new(config, dependencies)
	local self = setmetatable({}, ResourceGatheringService)
	local deps = dependencies or {}

	self.Config = config or EconomyConfig.ResourceGathering
	self.Inventory = deps.Inventory or InventoryService
	self.Events = deps.Events or EventBus
	self.Random = deps.Random or Random.new()
	self._nodes = {}
	self._connections = {}

	return self
end

function ResourceGatheringService:RegisterNode(instance, resourceId)
	if not getPosition(instance) or not self.Config.Resources[resourceId] then
		return false
	end

	self._nodes[instance] = {
		ResourceId = resourceId,
		NextAvailableAt = 0,
	}
	return true
end

function ResourceGatheringService:UnregisterNode(instance)
	self._nodes[instance] = nil
end

function ResourceGatheringService:_isInRange(player, instance)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local nodePosition = getPosition(instance)
	return root ~= nil and root:IsA("BasePart") and nodePosition ~= nil
		and (root.Position - nodePosition).Magnitude <= self.Config.MaximumDistance
end

function ResourceGatheringService:Gather(player, instance)
	local node = self._nodes[instance]
	if not node or not instance:IsDescendantOf(game) then
		return { Ok = false, Error = "NodeNotRegistered" }
	end
	if not self:_isInRange(player, instance) then
		return { Ok = false, Error = "TooFarAway" }
	end

	local now = os.clock()
	if now < node.NextAvailableAt then
		return { Ok = false, Error = "NodeOnCooldown", Remaining = node.NextAvailableAt - now }
	end

	local resource = self.Config.Resources[node.ResourceId]
	local minimumYield = math.max(1, math.floor(resource.MinYield or 1))
	local maximumYield = math.max(minimumYield, math.floor(resource.MaxYield or minimumYield))
	local rolledAmount = self.Random:NextInteger(minimumYield, maximumYield)
	local accepted = self.Inventory:AddItem(player, resource.ItemId, rolledAmount)

	if accepted <= 0 then
		return { Ok = false, Error = "StorageFull", ItemId = resource.ItemId }
	end

	node.NextAvailableAt = now + math.max(0, resource.Cooldown or 0)
	local result = {
		Ok = true,
		ResourceId = node.ResourceId,
		ItemId = resource.ItemId,
		Amount = accepted,
		NextAvailableAt = node.NextAvailableAt,
	}
	self.Events:Publish("Resource.Gathered", player, result)
	return result
end

function ResourceGatheringService:Start()
	for _, instance in CollectionService:GetTagged(self.Config.NodeTag) do
		local resourceId = instance:GetAttribute("ResourceId")
		if type(resourceId) == "string" then
			self:RegisterNode(instance, resourceId)
		end
	end

	table.insert(self._connections, CollectionService:GetInstanceAddedSignal(self.Config.NodeTag):Connect(function(instance)
		local resourceId = instance:GetAttribute("ResourceId")
		if type(resourceId) == "string" then
			self:RegisterNode(instance, resourceId)
		end
	end))

	table.insert(self._connections, CollectionService:GetInstanceRemovedSignal(self.Config.NodeTag):Connect(function(instance)
		self:UnregisterNode(instance)
	end))
end

function ResourceGatheringService:Destroy()
	for _, connection in self._connections do
		connection:Disconnect()
	end
	table.clear(self._connections)
	table.clear(self._nodes)
end

--[[
	Resumo em blocos:
	- Registro: tags e atributos conectam objetos do mapa ao config sem depender
	  de nomes ou caminhos fixos no Workspace.
	- Autoridade: distancia, cooldown, sorteio e capacidade sao verificados no
	  servidor, de modo que uma UI ou prompt apenas solicite a coleta.
	- Compatibilidade: nenhum recurso vem ativo por padrao, preservando totalmente
	  a colheita especializada que ja existe no CottonService.
]]

return ResourceGatheringService.new()
