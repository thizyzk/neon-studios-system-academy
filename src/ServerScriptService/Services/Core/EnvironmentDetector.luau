--[[
	EnvironmentDetector

	Proposito:
	Detecta informacoes do ambiente Roblox atual: Studio, servidor, cliente,
	tipo de servidor e canal pratico de execucao. Isso ajuda configs e flags a
	mudarem comportamento sem espalhar chamadas de RunService pelo codigo.

	Exemplo de uso:
	local EnvironmentDetector = require(ServerScriptService.Services.Core.EnvironmentDetector)
	if EnvironmentDetector:IsStudio() then print("Ambiente local") end
	local snapshot = EnvironmentDetector:GetSnapshot()
]]

local RunService = game:GetService("RunService")

local EnvironmentDetector = {}
EnvironmentDetector.__index = EnvironmentDetector

local DEFAULT_CONFIG = {
	AttributePrefix = "Environment",
}

function EnvironmentDetector.new(config)
	local self = setmetatable({}, EnvironmentDetector)

	self.Config = table.clone(DEFAULT_CONFIG)
	for key, value in config or {} do
		self.Config[key] = value
	end

	self._snapshot = nil

	return self
end

function EnvironmentDetector:_detectServerKind()
	if game.PrivateServerId ~= "" then
		if game.PrivateServerOwnerId ~= 0 then
			return "PrivateServer"
		end

		return "ReservedServer"
	end

	return "PublicServer"
end

function EnvironmentDetector:Detect()
	local isStudio = RunService:IsStudio()
	local isServer = RunService:IsServer()
	local isClient = RunService:IsClient()

	-- O nome do ambiente e derivado de sinais nativos do Roblox. Isso evita
	-- depender de variaveis externas que podem nao existir em publicacao.
	local name = "Production"
	if isStudio then
		name = "Studio"
	elseif game.PlaceId == 0 then
		name = "Local"
	end

	return {
		Name = name,
		IsStudio = isStudio,
		IsServer = isServer,
		IsClient = isClient,
		IsProduction = name == "Production",
		ServerKind = self:_detectServerKind(),
		PlaceId = game.PlaceId,
		JobId = game.JobId,
		PrivateServerId = game.PrivateServerId,
		PrivateServerOwnerId = game.PrivateServerOwnerId,
	}
end

function EnvironmentDetector:GetSnapshot()
	if not self._snapshot then
		self._snapshot = self:Detect()
	end

	return table.clone(self._snapshot)
end

function EnvironmentDetector:GetName()
	return self:GetSnapshot().Name
end

function EnvironmentDetector:IsStudio()
	return self:GetSnapshot().IsStudio
end

function EnvironmentDetector:IsProduction()
	return self:GetSnapshot().IsProduction
end

function EnvironmentDetector:IsPrivateServer()
	return self:GetSnapshot().ServerKind == "PrivateServer"
end

function EnvironmentDetector:PublishAttributes()
	local snapshot = self:GetSnapshot()
	local prefix = self.Config.AttributePrefix

	game:SetAttribute(`{prefix}Name`, snapshot.Name)
	game:SetAttribute(`{prefix}ServerKind`, snapshot.ServerKind)
	game:SetAttribute(`{prefix}IsStudio`, snapshot.IsStudio)
	game:SetAttribute(`{prefix}IsProduction`, snapshot.IsProduction)
end

function EnvironmentDetector:Init()
	self._snapshot = self:Detect()
	self:PublishAttributes()
end

--[[
	Resumo em blocos:
	- Deteccao: encapsula RunService e campos de game para padronizar leitura de
	  ambiente em todo o servidor.
	- Snapshot: congela a visao inicial porque o ambiente nao muda durante uma
	  sessao normal.
	- Atributos: publica dados basicos para debug e para scripts que nao precisam
	  depender diretamente deste modulo.
]]

return EnvironmentDetector.new()
