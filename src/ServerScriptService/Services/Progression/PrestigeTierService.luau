--[[
	PrestigeTierService

	Proposito:
	Traduz a quantidade de rebirths do sistema existente em uma faixa de
	prestigio e multiplicadores. Ele nao executa reset nem concede rebirth.

	Exemplo de uso:
	local Prestige = require(ServerScriptService.Services.Progression.PrestigeTierService)
	local tier = Prestige:GetTier(player)
	local reward = Prestige:ApplyRewardMultiplier(player, 100)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local ProgressionConfig = require(ServerScriptService.Config.ProgressionSystemsConfig)

local PrestigeTierService = {}
PrestigeTierService.__index = PrestigeTierService

function PrestigeTierService.new(config, rebirthResolver)
	local self = setmetatable({}, PrestigeTierService)
	self.Config = config or ProgressionConfig.PrestigeTier
	self._rebirthResolver = rebirthResolver
	return self
end

function PrestigeTierService:SetRebirthResolver(resolver)
	assert(resolver == nil or type(resolver) == "function", "Resolver precisa ser function ou nil")
	self._rebirthResolver = resolver
end

function PrestigeTierService:GetRebirthCount(player)
	if self._rebirthResolver then
		local ok, value = pcall(self._rebirthResolver, player)
		if ok and type(value) == "number" then
			return math.max(0, math.floor(value))
		end
	end
	return math.max(0, math.floor(tonumber(player:GetAttribute(self.Config.RebirthAttribute)) or 0))
end

function PrestigeTierService:GetTierForRebirths(rebirths)
	local count = math.max(0, math.floor(tonumber(rebirths) or 0))
	local selected = self.Config.Tiers[1]
	for _, tier in self.Config.Tiers do
		if count >= tier.MinimumRebirths then
			selected = tier
		else
			break
		end
	end
	return table.clone(selected)
end

function PrestigeTierService:GetTier(player)
	return self:GetTierForRebirths(self:GetRebirthCount(player))
end

function PrestigeTierService:GetNextTier(player)
	local rebirths = self:GetRebirthCount(player)
	for _, tier in self.Config.Tiers do
		if tier.MinimumRebirths > rebirths then
			local result = table.clone(tier)
			result.RemainingRebirths = tier.MinimumRebirths - rebirths
			return result
		end
	end
	return nil
end

function PrestigeTierService:ApplyRewardMultiplier(player, baseValue)
	local tier = self:GetTier(player)
	return baseValue * (tonumber(tier.RewardMultiplier) or 1)
end

function PrestigeTierService:GetSnapshot(player)
	return {
		Rebirths = self:GetRebirthCount(player),
		Tier = self:GetTier(player),
		NextTier = self:GetNextTier(player),
	}
end

--[[
	Resumo em blocos:
	- Adaptador: o resolver conecta qualquer RebirthService existente sem exigir
	  uma interface ou armazenamento duplicado.
	- Faixas: a selecao percorre limites ordenados e retorna copias para proteger
	  o config contra mutacao externa.
	- Recompensa: aplica somente o multiplicador da faixa; reset, custo e contagem
	  de rebirth continuam pertencendo ao sistema original.
]]

return PrestigeTierService.new()
