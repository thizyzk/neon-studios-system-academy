--[[
	MarketPriceFluctuationService

	Proposito:
	Calcula variacoes periodicas e limitadas no preco de itens. O servico nao
	vende itens: ele fornece precos para que economia, UI ou eventos de mercado
	possam consultar a mesma regra.

	Exemplo de uso:
	local Market = require(ServerScriptService.Services.Economy.MarketPriceFluctuationService)
	local price = Market:GetPrice("CottonFabric", 10)
	local snapshot = Market:GetSnapshot()
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local EventBus = require(ServerScriptService.Services.Core.EventBus)

local MarketPriceFluctuationService = {}
MarketPriceFluctuationService.__index = MarketPriceFluctuationService

function MarketPriceFluctuationService.new(config, eventBus, random)
	local self = setmetatable({}, MarketPriceFluctuationService)

	self.Config = config or EconomyConfig.MarketPriceFluctuation
	self.Events = eventBus or EventBus
	self.Random = random or Random.new()
	self._multipliers = {}
	self._running = false

	for itemId in self.Config.Items do
		self._multipliers[itemId] = 1
	end

	return self
end

function MarketPriceFluctuationService:GetMultiplier(itemId)
	return self._multipliers[itemId]
end

function MarketPriceFluctuationService:GetPrice(itemId, amount)
	local basePrice = self.Config.Items[itemId]
	local multiplier = self._multipliers[itemId]
	if not basePrice or not multiplier then
		return nil
	end

	local quantity = math.max(1, math.floor(tonumber(amount) or 1))
	return math.max(0, math.floor(basePrice * multiplier * quantity))
end

function MarketPriceFluctuationService:UpdateNow()
	local changed = {}

	for itemId, current in self._multipliers do
		-- A reversao em direcao a 1 evita que uma sequencia aleatoria mantenha um
		-- item preso nos limites por muito tempo.
		local randomStep = self.Random:NextNumber(-self.Config.MaximumStep, self.Config.MaximumStep)
		local reversion = (1 - current) * self.Config.ReversionStrength
		local nextMultiplier = math.clamp(
			current + randomStep + reversion,
			self.Config.MinimumMultiplier,
			self.Config.MaximumMultiplier
		)

		self._multipliers[itemId] = nextMultiplier
		changed[itemId] = {
			Multiplier = nextMultiplier,
			UnitPrice = self:GetPrice(itemId, 1),
		}
	end

	self.Events:Publish("Market.PricesUpdated", changed)
	return changed
end

function MarketPriceFluctuationService:SetMultiplier(itemId, multiplier)
	if not self.Config.Items[itemId] or type(multiplier) ~= "number" or multiplier ~= multiplier then
		return false
	end

	self._multipliers[itemId] = math.clamp(
		multiplier,
		self.Config.MinimumMultiplier,
		self.Config.MaximumMultiplier
	)
	return true
end

function MarketPriceFluctuationService:GetSnapshot()
	local result = {}
	for itemId, multiplier in self._multipliers do
		result[itemId] = {
			BasePrice = self.Config.Items[itemId],
			Multiplier = multiplier,
			UnitPrice = self:GetPrice(itemId, 1),
		}
	end
	return result
end

function MarketPriceFluctuationService:Start()
	self._running = true
	task.spawn(function()
		while self._running do
			task.wait(self.Config.UpdateInterval)
			self:UpdateNow()
		end
	end)
end

function MarketPriceFluctuationService:Destroy()
	self._running = false
end

--[[
	Resumo em blocos:
	- Estado: guarda apenas multiplicadores; precos base continuam no config e
	  podem ser balanceados sem migracao de dados.
	- Variacao: combina passo aleatorio, limites e reversao a media para produzir
	  movimento sem inflacao descontrolada.
	- Consumo: snapshots e eventos permitem atualizar UI e outros servicos sem
	  transformar este modulo em uma segunda economia.
]]

return MarketPriceFluctuationService.new()
