--[[
	BadgeService

	Proposito:
	Mapeia IDs internos para badges oficiais do Roblox, consulta propriedade com
	cache e concede badges habilitados pelo servidor. IDs iguais a zero ficam
	desativados ate que o asset real seja configurado.

	Exemplo de uso:
	local Badges = require(ServerScriptService.Services.Progression.BadgeService)
	local result = Badges:Award(player, "FirstHarvest")
]]

local RobloxBadgeService = game:GetService("BadgeService")
local Players = game:GetService("Players")
local ServerScriptService = game:GetService("ServerScriptService")

local EventBus = require(ServerScriptService.Services.Core.EventBus)
local ProgressionConfig = require(ServerScriptService.Config.ProgressionSystemsConfig)

local BadgeService = {}
BadgeService.__index = BadgeService

function BadgeService.new(config, dependencies)
	local self = setmetatable({}, BadgeService)
	local deps = dependencies or {}
	self.Config = config or ProgressionConfig.Badge
	self.Platform = deps.Platform or RobloxBadgeService
	self.Events = deps.Events or EventBus
	self._ownershipCache = {}
	self._infoCache = {}
	return self
end

function BadgeService:GetBadgeId(badgeKey)
	local badgeId = self.Config.Badges[badgeKey]
	return if type(badgeId) == "number" and badgeId > 0 then badgeId else nil
end

function BadgeService:_getCached(userId, badgeId)
	local userCache = self._ownershipCache[userId]
	local entry = userCache and userCache[badgeId]
	if entry and os.time() - entry.CheckedAt <= self.Config.CacheSeconds then
		return entry.Value
	end
	return nil
end

function BadgeService:_setCached(userId, badgeId, value)
	local userCache = self._ownershipCache[userId]
	if not userCache then
		userCache = {}
		self._ownershipCache[userId] = userCache
	end
	userCache[badgeId] = { Value = value, CheckedAt = os.time() }
end

function BadgeService:Has(player, badgeKey)
	local badgeId = self:GetBadgeId(badgeKey)
	if not badgeId then
		return false, "BadgeNotConfigured"
	end

	local cached = self:_getCached(player.UserId, badgeId)
	if cached ~= nil then
		return cached
	end

	local ok, owned = pcall(function()
		return self.Platform:UserHasBadgeAsync(player.UserId, badgeId)
	end)
	if not ok then
		return false, "BadgeLookupFailed"
	end

	self:_setCached(player.UserId, badgeId, owned == true)
	return owned == true
end

function BadgeService:GetInfo(badgeKey)
	local badgeId = self:GetBadgeId(badgeKey)
	if not badgeId then
		return nil, "BadgeNotConfigured"
	end
	if self._infoCache[badgeId] then
		return table.clone(self._infoCache[badgeId])
	end

	local ok, info = pcall(function()
		return self.Platform:GetBadgeInfoAsync(badgeId)
	end)
	if not ok or type(info) ~= "table" then
		return nil, "BadgeInfoFailed"
	end

	self._infoCache[badgeId] = table.clone(info)
	return table.clone(info)
end

function BadgeService:Award(player, badgeKey)
	if player.Parent ~= Players then
		return { Ok = false, Error = "PlayerNotConnected" }
	end

	local badgeId = self:GetBadgeId(badgeKey)
	if not badgeId then
		return { Ok = false, Error = "BadgeNotConfigured" }
	end

	local owned, ownershipError = self:Has(player, badgeKey)
	if owned then
		return { Ok = true, AlreadyOwned = true, BadgeKey = badgeKey, BadgeId = badgeId }
	end
	if ownershipError and ownershipError ~= "BadgeNotConfigured" then
		return { Ok = false, Error = ownershipError }
	end

	local info, infoError = self:GetInfo(badgeKey)
	if not info then
		return { Ok = false, Error = infoError }
	end
	if info.IsEnabled ~= true then
		return { Ok = false, Error = "BadgeDisabled" }
	end

	local ok, awarded = pcall(function()
		return self.Platform:AwardBadgeAsync(player.UserId, badgeId)
	end)
	if not ok or awarded ~= true then
		return { Ok = false, Error = "BadgeAwardFailed" }
	end

	self:_setCached(player.UserId, badgeId, true)
	local result = { Ok = true, AlreadyOwned = false, BadgeKey = badgeKey, BadgeId = badgeId }
	self.Events:Publish("Progression.BadgeAwarded", player, result)
	return result
end

function BadgeService:ClearCache(player)
	if player then
		self._ownershipCache[player.UserId] = nil
	else
		table.clear(self._ownershipCache)
		table.clear(self._infoCache)
	end
end

--[[
	Resumo em blocos:
	- Catalogo: chaves internas evitam IDs numericos espalhados e valor zero
	  desativa com seguranca um badge ainda nao publicado.
	- Plataforma: todas as chamadas que cedem usam pcall, verificam jogador
	  conectado e confirmam que o badge esta habilitado.
	- Cache: reduz consultas repetidas sem tratar falha de rede como propriedade
	  negativa permanente.
]]

return BadgeService.new()
