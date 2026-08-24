--[[
	VIPBenefitsService

	Proposito:
	Resolve beneficios VIP de forma centralizada sem comprar ou validar passes.
	Um GamepassService existente pode fornecer a funcao de elegibilidade.

	Exemplo de uso:
	local VIP = require(ServerScriptService.Services.Economy.VIPBenefitsService)
	VIP:SetEligibilityResolver(function(player) return GamepassService:IsVIP(player) end)
	local multiplier = VIP:GetValue(player, "SaleMultiplier", 1)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)

local VIPBenefitsService = {}
VIPBenefitsService.__index = VIPBenefitsService

function VIPBenefitsService.new(config, resolver)
	local self = setmetatable({}, VIPBenefitsService)
	self.Config = config or EconomyConfig.VIPBenefits
	self._resolver = resolver
	return self
end

function VIPBenefitsService:SetEligibilityResolver(resolver)
	assert(resolver == nil or type(resolver) == "function", "Resolver precisa ser function ou nil")
	self._resolver = resolver
end

function VIPBenefitsService:IsVIP(player)
	if self._resolver then
		local ok, eligible = pcall(self._resolver, player)
		if ok then
			return eligible == true
		end
	end
	return player:GetAttribute(self.Config.PlayerAttribute) == true
end

function VIPBenefitsService:GetBenefits(player)
	if not self:IsVIP(player) then
		return {}
	end

	local result = table.clone(self.Config.Benefits)
	if type(self.Config.Benefits.DiscountIds) == "table" then
		result.DiscountIds = table.clone(self.Config.Benefits.DiscountIds)
	end
	return result
end

function VIPBenefitsService:GetValue(player, benefitId, fallback)
	if not self:IsVIP(player) then
		return fallback
	end
	local value = self.Config.Benefits[benefitId]
	return if value ~= nil then value else fallback
end

function VIPBenefitsService:GetDiscountIds(player)
	local ids = self:GetValue(player, "DiscountIds", {})
	return if type(ids) == "table" then table.clone(ids) else {}
end

function VIPBenefitsService:ApplyMultiplier(player, benefitId, baseValue)
	local multiplier = self:GetValue(player, benefitId, 1)
	return baseValue * (tonumber(multiplier) or 1)
end

--[[
	Resumo em blocos:
	- Elegibilidade: fica injetavel para aproveitar o GamepassService existente;
	  o atributo serve apenas como adaptador local.
	- Catalogo: todos os multiplicadores e IDs de desconto vivem no config, sem
	  condicionais VIP espalhadas pelo gameplay.
	- Consumo: retornos neutros para nao VIP deixam cada sistema aplicar o mesmo
	  calculo sem ramos especiais.
]]

return VIPBenefitsService.new()
