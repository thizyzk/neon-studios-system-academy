--[[
	ConfigLoader

	Proposito:
	Carrega ModuleScripts de configuracao por nome, com cache e validacao
	simples. Ele procura primeiro em ServerScriptService.Config e depois em
	ReplicatedStorage.Shared.Modules, combinando com a estrutura atual do jogo.

	Exemplo de uso:
	local ConfigLoader = require(ServerScriptService.Services.Core.ConfigLoader)
	local machineConfig = ConfigLoader:Load("MachineConfig")
	ConfigLoader:Validate("TikTokReelsConfig", { "ServerUrl", "MaxReels" })
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local ConfigLoader = {}
ConfigLoader.__index = ConfigLoader

local DEFAULT_CONFIG = {
	FreezeConfigs = false,
	SearchFolders = {},
}

function ConfigLoader.new(config)
	local self = setmetatable({}, ConfigLoader)

	self.Config = table.clone(DEFAULT_CONFIG)
	for key, value in config or {} do
		self.Config[key] = value
	end

	self._cache = {}
	self._folders = {}

	return self
end

function ConfigLoader:_buildDefaultFolders()
	local folders = {}

	local serverConfig = ServerScriptService:FindFirstChild("Config")
	if serverConfig then
		table.insert(folders, serverConfig)
	end

	local shared = ReplicatedStorage:FindFirstChild("Shared")
	local sharedModules = shared and shared:FindFirstChild("Modules")
	if sharedModules then
		table.insert(folders, sharedModules)
	end

	for _, folder in self.Config.SearchFolders do
		table.insert(folders, folder)
	end

	return folders
end

function ConfigLoader:SetSearchFolders(folders)
	self._folders = table.clone(folders)
	table.clear(self._cache)
end

function ConfigLoader:FindModule(configName)
	for _, folder in self._folders do
		local module = folder:FindFirstChild(configName)
		if module and module:IsA("ModuleScript") then
			return module
		end
	end

	return nil
end

function ConfigLoader:Load(configName)
	if self._cache[configName] then
		return self._cache[configName]
	end

	local module = self:FindModule(configName)
	if not module then
		error(`[ConfigLoader] Config nao encontrada: {configName}`)
	end

	local config = require(module)
	if type(config) ~= "table" then
		error(`[ConfigLoader] Config precisa retornar table: {configName}`)
	end

	-- Congelar e opcional porque algumas configs legadas podem montar indices
	-- em runtime. Em sistemas novos, ligar FreezeConfigs ajuda a evitar mutacao.
	if self.Config.FreezeConfigs and table.freeze then
		table.freeze(config)
	end

	self._cache[configName] = config
	return config
end

function ConfigLoader:Get(configName, fallback)
	local ok, result = pcall(function()
		return self:Load(configName)
	end)

	if ok then
		return result
	end

	return fallback
end

function ConfigLoader:Validate(configName, requiredKeys)
	local config = self:Load(configName)
	local missing = {}

	for _, key in requiredKeys do
		if config[key] == nil then
			table.insert(missing, key)
		end
	end

	return {
		Ok = #missing == 0,
		Missing = missing,
		Config = config,
	}
end

function ConfigLoader:ClearCache(configName)
	if configName then
		self._cache[configName] = nil
	else
		table.clear(self._cache)
	end
end

function ConfigLoader:Init()
	self._folders = self:_buildDefaultFolders()
end

--[[
	Resumo em blocos:
	- Busca: segue a convencao real do projeto, lendo configs de servidor e
	  modulos compartilhados sem duplicar caminhos em cada servico.
	- Cache: evita requires repetidos e deixa claro quando uma config deve ser
	  recarregada manualmente.
	- Validacao: oferece uma checagem leve para sistemas que precisam falhar
	  cedo quando uma chave obrigatoria nao existe.
]]

return ConfigLoader.new()
