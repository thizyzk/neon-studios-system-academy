--[[
	CraftingCostCalculator

	Proposito:
	Calcula materiais e moedas necessarios para receitas, incluindo descontos,
	e informa o que falta ao jogador. Ele nao consome recursos porque execucao e
	rollback pertencem ao futuro servico de crafting.

	Exemplo de uso:
	local Costs = require(ServerScriptService.Services.Economy.CraftingCostCalculator)
	local quote = Costs:Calculate("CottonFabric", 3, { DiscountIds = { "VIP" } })
	local missing = Costs:GetMissing(player, quote)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)
local DiscountService = require(ServerScriptService.Services.Economy.DiscountService)
local InventoryService = require(ServerScriptService.Services.InventoryService)

local CraftingCostCalculator = {}
CraftingCostCalculator.__index = CraftingCostCalculator

function CraftingCostCalculator.new(config, dependencies)
	local self = setmetatable({}, CraftingCostCalculator)
	local deps = dependencies or {}

	self.Config = config or EconomyConfig.CraftingCostCalculator
	self.Inventory = deps.Inventory or InventoryService
	self.Currency = deps.Currency or CurrencyExchangeService
	self.Discounts = deps.Discounts or DiscountService

	return self
end

function CraftingCostCalculator:Calculate(recipeId, quantity, context)
	local recipe = self.Config.Recipes[recipeId]
	local normalizedQuantity = math.floor(tonumber(quantity) or 0)
	if not recipe then
		return { Ok = false, Error = "RecipeNotFound" }
	end
	if normalizedQuantity <= 0 then
		return { Ok = false, Error = "InvalidQuantity" }
	end

	local materials = {}
	for itemId, amount in recipe.Inputs or {} do
		materials[itemId] = math.max(0, math.floor(amount * normalizedQuantity))
	end

	local currencies = {}
	local discountIds = if context then context.DiscountIds else nil
	for currencyId, amount in recipe.CurrencyCosts or {} do
		local baseCost = math.max(0, math.floor(amount * normalizedQuantity))
		local discount = self.Discounts:Calculate(baseCost, discountIds, "Crafting", context)
		currencies[currencyId] = {
			Base = baseCost,
			Final = discount.FinalPrice,
			Discount = discount.DiscountAmount,
		}
	end

	return {
		Ok = true,
		RecipeId = recipeId,
		Quantity = normalizedQuantity,
		Materials = materials,
		Currencies = currencies,
	}
end

function CraftingCostCalculator:GetMissing(player, quote)
	if not quote or not quote.Ok then
		return { Materials = {}, Currencies = {}, HasMissing = true }
	end

	local missingMaterials = {}
	local missingCurrencies = {}

	for itemId, required in quote.Materials do
		local available = self.Inventory:GetItemCount(player, itemId)
		if available < required then
			missingMaterials[itemId] = required - available
		end
	end

	for currencyId, cost in quote.Currencies do
		local available = self.Currency:GetBalance(player, currencyId) or 0
		if available < cost.Final then
			missingCurrencies[currencyId] = cost.Final - available
		end
	end

	return {
		Materials = missingMaterials,
		Currencies = missingCurrencies,
		HasMissing = next(missingMaterials) ~= nil or next(missingCurrencies) ~= nil,
	}
end

function CraftingCostCalculator:CanAfford(player, quote)
	return not self:GetMissing(player, quote).HasMissing
end

--[[
	Resumo em blocos:
	- Receita: multiplica custos configurados e normaliza quantidades para que o
	  resultado seja previsivel e adequado ao inventario inteiro.
	- Desconto: somente custos monetarios recebem beneficios; materiais fisicos
	  continuam obedecendo a receita original.
	- Verificacao: consulta inventario e carteira sem consumir nada, separando a
	  cotacao do futuro fluxo transacional de crafting.
]]

return CraftingCostCalculator.new()
