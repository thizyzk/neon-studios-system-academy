--[[
	LevelingService

	Proposito:
	Gerencia XP, subida de nivel e sincronizacao com o leaderstat Nivel. A curva
	de progressao fica no config e o estado pode ser importado pelo save atual.

	Exemplo de uso:
	local Leveling = require(ServerScriptService.Services.Progression.LevelingService)
	local result = Leveling:AddXP(player, 250, "Harvest")
	print(result.Level, result.XP)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EventBus = require(ServerScriptService.Services.Core.EventBus)
local LeaderstatsService = require(ServerScriptService.Services.LeaderstatsService)
local ProgressionConfig = require(ServerScriptService.Config.ProgressionSystemsConfig)

local LevelingService = {}
LevelingService.__index = LevelingService

function LevelingService.new(config, dependencies)
	local self = setmetatable({}, LevelingService)
	local deps = dependencies or {}

	self.Config = config or ProgressionConfig.Leveling
	self.Leaderstats = deps.Leaderstats or LeaderstatsService
	self.Events = deps.Events or EventBus
	self._profiles = {}

	return self
end

function LevelingService:GetXPRequired(level)
	local normalizedLevel = math.clamp(math.floor(tonumber(level) or 1), 1, self.Config.MaximumLevel)
	return math.max(1, math.floor(self.Config.BaseXP * self.Config.GrowthFactor ^ (normalizedLevel - 1)))
end

function LevelingService:_getProfile(player)
	local profile = self._profiles[player.UserId]
	if not profile then
		profile = { Level = 1, XP = 0 }
		self._profiles[player.UserId] = profile
	end
	return profile
end

function LevelingService:_sync(player, profile)
	self.Leaderstats:SetStat(player, "Level", profile.Level)
	player:SetAttribute(self.Config.LevelAttribute, profile.Level)
	player:SetAttribute(self.Config.XPAttribute, profile.XP)
end

function LevelingService:GetSnapshot(player)
	local profile = self:_getProfile(player)
	self:_sync(player, profile)
	return {
		Level = profile.Level,
		XP = profile.XP,
		XPRequired = if profile.Level >= self.Config.MaximumLevel then 0 else self:GetXPRequired(profile.Level),
		MaximumLevel = self.Config.MaximumLevel,
	}
end

function LevelingService:AddXP(player, amount, source)
	local normalized = math.floor(tonumber(amount) or 0)
	if normalized <= 0 then
		return { Ok = false, Error = "InvalidXPAmount" }
	end

	local profile = self:_getProfile(player)
	if profile.Level >= self.Config.MaximumLevel then
		return { Ok = false, Error = "MaximumLevelReached", Snapshot = self:GetSnapshot(player) }
	end

	profile.XP += normalized
	local levelsGained = 0
	while profile.Level < self.Config.MaximumLevel do
		local required = self:GetXPRequired(profile.Level)
		if profile.XP < required then
			break
		end
		profile.XP -= required
		profile.Level += 1
		levelsGained += 1
	end

	if profile.Level >= self.Config.MaximumLevel then
		profile.XP = 0
	end
	self:_sync(player, profile)

	local result = self:GetSnapshot(player)
	result.Ok = true
	result.AddedXP = normalized
	result.LevelsGained = levelsGained
	result.Source = tostring(source or "Unspecified")
	self.Events:Publish("Progression.XPAdded", player, result)
	if levelsGained > 0 then
		self.Events:Publish("Progression.LevelUp", player, result)
	end
	return result
end

function LevelingService:ExportPlayer(player)
	return table.clone(self:_getProfile(player))
end

function LevelingService:ImportPlayer(player, state)
	if type(state) ~= "table" then
		return false
	end

	local level = math.clamp(math.floor(tonumber(state.Level) or 1), 1, self.Config.MaximumLevel)
	local xp = math.max(0, math.floor(tonumber(state.XP) or 0))
	if level >= self.Config.MaximumLevel then
		xp = 0
	else
		xp = math.min(xp, self:GetXPRequired(level) - 1)
	end
	self._profiles[player.UserId] = { Level = level, XP = xp }
	self:_sync(player, self._profiles[player.UserId])
	return true
end

--[[
	Resumo em blocos:
	- Curva: calcula XP por nivel a partir de dois parametros, evitando uma tabela
	  extensa e mantendo o balanceamento previsivel.
	- Progressao: o loop aceita recompensas grandes e pode subir varios niveis em
	  uma unica operacao sem perder o excedente.
	- Integracao: leaderstat e atributos sao apenas espelhos; o perfil interno
	  exportavel continua sendo a fonte de verdade.
]]

return LevelingService.new()
