--[[
	PlayerDataService

	Proposito:
	Gerencia o ciclo de vida dos dados do jogador no servidor: carregar,
	ler, alterar, marcar como sujo e salvar no DataStore. Ele nao tenta ser
	um "save batcher"; a ideia e oferecer uma camada OOP de perfil que pode
	ser chamada por um batcher existente quando voce quiser centralizar filas.

	Exemplo de uso:
	local PlayerDataService = require(ServerScriptService.Services.Core.PlayerDataService)
	local profile = PlayerDataService:GetProfile(player)
	PlayerDataService:Add(player, "Cash", 25)
	PlayerDataService:Set(player, "Flags.CompletedTutorial", true)
]]

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local PlayerDataService = {}
PlayerDataService.__index = PlayerDataService

local DEFAULT_CONFIG = {
	DataStoreName = "CottonFabricTycoon_PlayerData_v1",
	KeyPrefix = "Player_",
	AutoSaveSeconds = 120,
	SaveOnLeave = true,
	BindToCloseTimeoutSeconds = 8,
	DefaultData = {
		Cash = 0,
		Inventory = {},
		Flags = {},
		LastJoin = 0,
	},
}

local function deepClone(value)
	if type(value) ~= "table" then
		return value
	end

	local clone = {}
	for key, child in value do
		clone[key] = deepClone(child)
	end

	return clone
end

local function mergeDefaults(data, defaults)
	local result = deepClone(defaults)

	if type(data) ~= "table" then
		return result
	end

	for key, value in data do
		if type(value) == "table" and type(result[key]) == "table" then
			result[key] = mergeDefaults(value, result[key])
		else
			result[key] = value
		end
	end

	return result
end

local function splitPath(path)
	local parts = {}

	for part in string.gmatch(path, "[^%.]+") do
		table.insert(parts, part)
	end

	return parts
end

function PlayerDataService.new(config)
	local self = setmetatable({}, PlayerDataService)

	self.Config = mergeDefaults(config, DEFAULT_CONFIG)
	self._profiles = {}
	self._dirty = {}
	self._saving = {}
	self._dataStore = nil

	return self
end

function PlayerDataService:_getKey(player)
	return `{self.Config.KeyPrefix}{player.UserId}`
end

function PlayerDataService:_createDefaultProfile()
	return mergeDefaults(nil, self.Config.DefaultData)
end

function PlayerDataService:_loadFromStore(player)
	if RunService:IsStudio() and not game:GetService("RunService"):IsRunning() then
		return nil
	end

	local ok, data = pcall(function()
		return self._dataStore:GetAsync(self:_getKey(player))
	end)

	if not ok then
		warn(`[PlayerDataService] Falha ao carregar {player.UserId}: {data}`)
		return nil
	end

	return data
end

function PlayerDataService:LoadPlayer(player)
	if self._profiles[player] then
		return self._profiles[player]
	end

	-- O perfil sempre nasce com defaults completos. Isso permite adicionar
	-- campos novos no futuro sem quebrar saves antigos ou testes locais.
	local loadedData = self:_loadFromStore(player)
	local profile = mergeDefaults(loadedData, self.Config.DefaultData)
	profile.LastJoin = os.time()

	self._profiles[player] = profile
	self._dirty[player] = false

	return profile
end

function PlayerDataService:GetProfile(player)
	return self._profiles[player] or self:LoadPlayer(player)
end

function PlayerDataService:Get(player, path)
	local current = self:GetProfile(player)

	for _, part in splitPath(path) do
		if type(current) ~= "table" then
			return nil
		end

		current = current[part]
	end

	return current
end

function PlayerDataService:Set(player, path, value)
	local parts = splitPath(path)
	local profile = self:GetProfile(player)
	local current = profile

	-- Caminhos pontuados mantem a API simples para sistemas de gameplay,
	-- enquanto este bloco garante que sub-tabelas existam antes da escrita.
	for index = 1, #parts - 1 do
		local part = parts[index]
		if type(current[part]) ~= "table" then
			current[part] = {}
		end
		current = current[part]
	end

	current[parts[#parts]] = value
	self:MarkDirty(player)

	return value
end

function PlayerDataService:Add(player, path, amount)
	local current = self:Get(player, path)
	local nextValue = (tonumber(current) or 0) + amount

	return self:Set(player, path, nextValue)
end

function PlayerDataService:Update(player, path, updater)
	local nextValue = updater(self:Get(player, path), self:GetProfile(player))

	return self:Set(player, path, nextValue)
end

function PlayerDataService:MarkDirty(player)
	if self._profiles[player] then
		self._dirty[player] = true
	end
end

function PlayerDataService:SavePlayer(player)
	local profile = self._profiles[player]
	if not profile or self._saving[player] then
		return false
	end

	self._saving[player] = true

	-- UpdateAsync preserva melhor dados concorrentes do que SetAsync quando
	-- outro servidor ainda esta fechando uma sessao antiga do mesmo jogador.
	local ok, err = pcall(function()
		self._dataStore:UpdateAsync(self:_getKey(player), function()
			return profile
		end)
	end)

	self._saving[player] = false

	if not ok then
		warn(`[PlayerDataService] Falha ao salvar {player.UserId}: {err}`)
		return false
	end

	self._dirty[player] = false
	return true
end

function PlayerDataService:SaveAll()
	local saved = 0

	for player in self._profiles do
		if self:SavePlayer(player) then
			saved += 1
		end
	end

	return saved
end

function PlayerDataService:ReleasePlayer(player)
	if self.Config.SaveOnLeave then
		self:SavePlayer(player)
	end

	self._profiles[player] = nil
	self._dirty[player] = nil
	self._saving[player] = nil
end

function PlayerDataService:Init()
	self._dataStore = DataStoreService:GetDataStore(self.Config.DataStoreName)
end

function PlayerDataService:Start()
	for _, player in Players:GetPlayers() do
		task.spawn(function()
			self:LoadPlayer(player)
		end)
	end

	Players.PlayerAdded:Connect(function(player)
		self:LoadPlayer(player)
	end)

	Players.PlayerRemoving:Connect(function(player)
		self:ReleasePlayer(player)
	end)

	-- Auto-save simples reduz perda de progresso sem assumir politica de fila.
	-- Projetos maiores podem desativar isso e delegar ao save batcher existente.
	task.spawn(function()
		while true do
			task.wait(self.Config.AutoSaveSeconds)
			for player, isDirty in self._dirty do
				if isDirty then
					task.spawn(function()
						self:SavePlayer(player)
					end)
				end
			end
		end
	end)

	game:BindToClose(function()
		local startedAt = os.clock()
		self:SaveAll()

		while os.clock() - startedAt < self.Config.BindToCloseTimeoutSeconds do
			local stillSaving = false
			for _, saving in self._saving do
				if saving then
					stillSaving = true
					break
				end
			end

			if not stillSaving then
				break
			end

			task.wait()
		end
	end)
end

--[[
	Resumo em blocos:
	- Configuracao: concentra nome do DataStore, chave, autosave e defaults para
	  facilitar troca de versao sem espalhar constantes pelo jogo.
	- Perfil: carrega dados uma vez por jogador e faz merge com defaults para
	  manter compatibilidade com saves antigos.
	- Leitura e escrita: aceita caminhos pontuados para reduzir acoplamento dos
	  sistemas de gameplay com a estrutura interna do save.
	- Persistencia: usa UpdateAsync e marcacao de dirty para salvar somente quem
	  mudou, mantendo o servico simples e compatvel com um batcher externo.
]]

return PlayerDataService.new()
