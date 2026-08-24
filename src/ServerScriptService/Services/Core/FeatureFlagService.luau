--[[
	FeatureFlagService

	Proposito:
	Controla ligas/desligas de funcionalidades por nome, com rollout percentual
	e sobrescrita por jogador. Ele nao depende de remote config externo; os
	flags podem vir de configs locais, comandos administrativos ou testes.

	Exemplo de uso:
	local FeatureFlagService = require(ServerScriptService.Services.Core.FeatureFlagService)
	FeatureFlagService:DefineFlag("NewFactoryUI", { Enabled = true, RolloutPercent = 25 })
	if FeatureFlagService:IsEnabled("NewFactoryUI", player) then end
]]

local FeatureFlagService = {}
FeatureFlagService.__index = FeatureFlagService

local DEFAULT_CONFIG = {
	DefaultFlags = {},
}

local function cloneDictionary(dictionary)
	local clone = {}

	for key, value in dictionary or {} do
		if type(value) == "table" then
			clone[key] = table.clone(value)
		else
			clone[key] = value
		end
	end

	return clone
end

local function getStableBucket(flagName, player)
	if not player then
		return 100
	end

	local seed = `{flagName}:{player.UserId}`
	local hash = 0

	for index = 1, #seed do
		hash = (hash * 31 + string.byte(seed, index)) % 10000
	end

	return (hash % 100) + 1
end

function FeatureFlagService.new(config)
	local self = setmetatable({}, FeatureFlagService)

	self.Config = table.clone(DEFAULT_CONFIG)
	for key, value in config or {} do
		self.Config[key] = value
	end

	self._flags = cloneDictionary(self.Config.DefaultFlags)
	self._playerOverrides = {}

	return self
end

function FeatureFlagService:DefineFlag(flagName, options)
	options = options or {}

	self._flags[flagName] = {
		Enabled = options.Enabled == true,
		RolloutPercent = math.clamp(options.RolloutPercent or 100, 0, 100),
		AllowUserIds = table.clone(options.AllowUserIds or {}),
		DenyUserIds = table.clone(options.DenyUserIds or {}),
		Metadata = table.clone(options.Metadata or {}),
	}

	return self._flags[flagName]
end

function FeatureFlagService:SetEnabled(flagName, enabled)
	local flag = self._flags[flagName] or self:DefineFlag(flagName, {})
	flag.Enabled = enabled == true
end

function FeatureFlagService:SetRollout(flagName, percent)
	local flag = self._flags[flagName] or self:DefineFlag(flagName, {})
	flag.RolloutPercent = math.clamp(percent, 0, 100)
end

function FeatureFlagService:SetPlayerOverride(player, flagName, enabled)
	local overrides = self._playerOverrides[player.UserId]
	if not overrides then
		overrides = {}
		self._playerOverrides[player.UserId] = overrides
	end

	overrides[flagName] = enabled
end

function FeatureFlagService:ClearPlayerOverride(player, flagName)
	local overrides = self._playerOverrides[player.UserId]
	if overrides then
		overrides[flagName] = nil
	end
end

function FeatureFlagService:_listContainsUserId(list, userId)
	for _, allowedUserId in list do
		if allowedUserId == userId then
			return true
		end
	end

	return false
end

function FeatureFlagService:IsEnabled(flagName, player)
	local flag = self._flags[flagName]
	if not flag then
		return false
	end

	-- A ordem favorece controles explicitos: bloqueio individual, liberacao
	-- individual, override local e por ultimo rollout percentual.
	if player then
		if self:_listContainsUserId(flag.DenyUserIds, player.UserId) then
			return false
		end

		if self:_listContainsUserId(flag.AllowUserIds, player.UserId) then
			return true
		end

		local overrides = self._playerOverrides[player.UserId]
		if overrides and overrides[flagName] ~= nil then
			return overrides[flagName] == true
		end
	end

	if not flag.Enabled then
		return false
	end

	return getStableBucket(flagName, player) <= flag.RolloutPercent
end

function FeatureFlagService:GetSnapshot()
	return cloneDictionary(self._flags)
end

function FeatureFlagService:Init()
	for flagName, options in self.Config.DefaultFlags do
		self:DefineFlag(flagName, options)
	end
end

--[[
	Resumo em blocos:
	- Definicao: cada flag guarda estado, rollout, listas de usuario e metadados
	  para cobrir testes simples sem backend externo.
	- Avaliacao: aplica regras explicitas antes do percentual, pois overrides
	  manuais precisam vencer experimentos.
	- Bucket estavel: usa UserId e nome do flag para manter o mesmo jogador no
	  mesmo grupo entre sessoes.
]]

return FeatureFlagService.new()
