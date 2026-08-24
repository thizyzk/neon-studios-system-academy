--[[
	TitleService

	Proposito:
	Gerencia titulos internos desbloqueados e o titulo equipado pelo jogador.
	O atributo replicado serve para UI; o estado exportavel continua canonico.

	Exemplo de uso:
	local Titles = require(ServerScriptService.Services.Progression.TitleService)
	Titles:Unlock(player, "CottonFarmer", "FirstHarvest")
	Titles:Equip(player, "CottonFarmer")
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EventBus = require(ServerScriptService.Services.Core.EventBus)
local ProgressionConfig = require(ServerScriptService.Config.ProgressionSystemsConfig)

local TitleService = {}
TitleService.__index = TitleService

function TitleService.new(config, eventBus)
	local self = setmetatable({}, TitleService)
	self.Config = config or ProgressionConfig.Title
	self.Events = eventBus or EventBus
	self._profiles = {}
	return self
end

function TitleService:_getProfile(player)
	local profile = self._profiles[player.UserId]
	if not profile then
		profile = {
			Unlocked = { [self.Config.DefaultTitleId] = true },
			Equipped = self.Config.DefaultTitleId,
		}
		self._profiles[player.UserId] = profile
	end
	return profile
end

function TitleService:_sync(player, profile)
	local title = self.Config.Titles[profile.Equipped]
	player:SetAttribute(self.Config.PlayerAttribute, if title then title.DisplayName else "")
end

function TitleService:IsUnlocked(player, titleId)
	return self:_getProfile(player).Unlocked[titleId] == true
end

function TitleService:Unlock(player, titleId, source)
	if not self.Config.Titles[titleId] then
		return { Ok = false, Error = "TitleNotFound" }
	end

	local profile = self:_getProfile(player)
	if profile.Unlocked[titleId] then
		return { Ok = true, AlreadyUnlocked = true, TitleId = titleId }
	end

	profile.Unlocked[titleId] = true
	local result = { Ok = true, AlreadyUnlocked = false, TitleId = titleId, Source = tostring(source or "Server") }
	self.Events:Publish("Progression.TitleUnlocked", player, result)
	return result
end

function TitleService:Equip(player, titleId)
	if not self.Config.Titles[titleId] then
		return { Ok = false, Error = "TitleNotFound" }
	end
	if not self:IsUnlocked(player, titleId) then
		return { Ok = false, Error = "TitleLocked" }
	end

	local profile = self:_getProfile(player)
	profile.Equipped = titleId
	self:_sync(player, profile)
	local result = { Ok = true, TitleId = titleId, DisplayName = self.Config.Titles[titleId].DisplayName }
	self.Events:Publish("Progression.TitleEquipped", player, result)
	return result
end

function TitleService:GetSnapshot(player)
	local profile = self:_getProfile(player)
	self:_sync(player, profile)
	local titles = {}
	for titleId, definition in self.Config.Titles do
		table.insert(titles, {
			Id = titleId,
			DisplayName = definition.DisplayName,
			SortOrder = definition.SortOrder,
			Unlocked = profile.Unlocked[titleId] == true,
			Equipped = profile.Equipped == titleId,
		})
	end
	table.sort(titles, function(left, right)
		return left.SortOrder < right.SortOrder
	end)
	return { Equipped = profile.Equipped, Titles = titles }
end

function TitleService:ExportPlayer(player)
	local profile = self:_getProfile(player)
	return { Unlocked = table.clone(profile.Unlocked), Equipped = profile.Equipped }
end

function TitleService:ImportPlayer(player, state)
	if type(state) ~= "table" then
		return false
	end

	local unlocked = { [self.Config.DefaultTitleId] = true }
	for titleId, value in state.Unlocked or {} do
		if value == true and self.Config.Titles[titleId] then
			unlocked[titleId] = true
		end
	end
	local equipped = tostring(state.Equipped or self.Config.DefaultTitleId)
	if not unlocked[equipped] then
		equipped = self.Config.DefaultTitleId
	end
	self._profiles[player.UserId] = { Unlocked = unlocked, Equipped = equipped }
	self:_sync(player, self._profiles[player.UserId])
	return true
end

--[[
	Resumo em blocos:
	- Desbloqueio: valida IDs do catalogo e e idempotente para que eventos possam
	  tentar conceder o mesmo titulo com seguranca.
	- Equipamento: somente titulos desbloqueados podem ser exibidos; o atributo
	  replica apenas o nome para clientes.
	- Persistencia: importacao filtra IDs removidos e sempre preserva um titulo
	  padrao valido.
]]

return TitleService.new()
