--[[
	DiscountService

	Proposito:
	Resolve descontos por escopo, periodo e politica de acumulacao, sempre com um
	teto global. O modulo calcula precos, mas nao concede beneficios: VIP, eventos
	ou promocoes decidem quais IDs cada jogador possui.

	Exemplo de uso:
	local Discounts = require(ServerScriptService.Services.Economy.DiscountService)
	local result = Discounts:Calculate(1000, { "Welcome", "VIP" }, "Shop")
	print(result.FinalPrice)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)

local DiscountService = {}
DiscountService.__index = DiscountService

local function contains(list, expected)
	for _, value in list or {} do
		if value == expected then
			return true
		end
	end
	return false
end

function DiscountService.new(config)
	local self = setmetatable({}, DiscountService)

	self.Config = config or EconomyConfig.Discount
	self._discounts = {}
	for discountId, definition in self.Config.Discounts do
		self._discounts[discountId] = table.clone(definition)
	end

	return self
end

function DiscountService:Register(discountId, definition)
	if type(discountId) ~= "string" or type(definition) ~= "table" or type(definition.Rate) ~= "number" then
		return false
	end

	self._discounts[discountId] = table.clone(definition)
	return true
end

function DiscountService:Remove(discountId)
	self._discounts[discountId] = nil
end

function DiscountService:IsApplicable(definition, scope, context)
	local now = if context and context.Now then context.Now else os.time()
	if definition.StartsAt and now < definition.StartsAt then
		return false
	end
	if definition.EndsAt and now >= definition.EndsAt then
		return false
	end
	if scope and definition.Scopes and not contains(definition.Scopes, scope) then
		return false
	end
	return true
end

function DiscountService:Calculate(basePrice, discountIds, scope, context)
	local normalizedBase = math.max(0, math.floor(tonumber(basePrice) or 0))
	local applied = {}
	local seen = {}
	local multiplier = 1
	local additiveRate = 0

	for _, discountId in discountIds or {} do
		local definition = self._discounts[discountId]
		if definition and not seen[discountId] and self:IsApplicable(definition, scope, context) then
			seen[discountId] = true
			local rate = math.clamp(definition.Rate, 0, self.Config.MaximumTotalDiscount)
			table.insert(applied, { Id = discountId, Rate = rate })

			if self.Config.StackMode == "Additive" then
				additiveRate += rate
			else
				multiplier *= 1 - rate
			end
		end
	end

	local totalRate = if self.Config.StackMode == "Additive" then additiveRate else 1 - multiplier
	totalRate = math.clamp(totalRate, 0, self.Config.MaximumTotalDiscount)
	local finalPrice = math.max(0, math.floor(normalizedBase * (1 - totalRate)))

	return {
		BasePrice = normalizedBase,
		FinalPrice = finalPrice,
		DiscountAmount = normalizedBase - finalPrice,
		TotalRate = totalRate,
		Applied = applied,
	}
end

function DiscountService:Apply(basePrice, discountIds, scope, context)
	return self:Calculate(basePrice, discountIds, scope, context).FinalPrice
end

--[[
	Resumo em blocos:
	- Catalogo: configs e registros em runtime suportam beneficios permanentes e
	  campanhas temporarias sem misturar elegibilidade com precificacao.
	- Filtro: escopo e janela de tempo impedem um desconto de crafting de vazar
	  para loja ou permanecer ativo apos o evento.
	- Acumulacao: modos aditivo e multiplicativo compartilham um teto, garantindo
	  resultado previsivel e nunca negativo.
]]

return DiscountService.new()
