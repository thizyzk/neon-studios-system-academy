--[[
	VersionControlTag

	Proposito:
	Mantem versao, canal e compatibilidade minima do servidor em atributos
	replicados. Isso ajuda clientes, UI de debug e ferramentas internas a saber
	qual build esta rodando sem consultar servico externo.

	Exemplo de uso:
	local VersionControlTag = require(ServerScriptService.Services.Core.VersionControlTag)
	print(VersionControlTag:GetTag())
	if VersionControlTag:IsClientVersionAllowed("1.2.0") then end
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local VersionControlTag = {}
VersionControlTag.__index = VersionControlTag

local DEFAULT_CONFIG = {
	Version = "0.1.0",
	Channel = "local",
	MinClientVersion = "0.1.0",
	AttributePrefix = "Build",
}

local function parseVersion(version)
	local numbers = {}

	for part in string.gmatch(version or "0", "%d+") do
		table.insert(numbers, tonumber(part) or 0)
	end

	while #numbers < 3 do
		table.insert(numbers, 0)
	end

	return numbers
end

function VersionControlTag.new(config)
	local self = setmetatable({}, VersionControlTag)

	self.Config = table.clone(DEFAULT_CONFIG)
	for key, value in config or {} do
		self.Config[key] = value
	end

	return self
end

function VersionControlTag:CompareVersions(left, right)
	local leftParts = parseVersion(left)
	local rightParts = parseVersion(right)

	for index = 1, math.max(#leftParts, #rightParts) do
		local leftValue = leftParts[index] or 0
		local rightValue = rightParts[index] or 0

		if leftValue < rightValue then
			return -1
		elseif leftValue > rightValue then
			return 1
		end
	end

	return 0
end

function VersionControlTag:SetVersion(version, channel, minClientVersion)
	self.Config.Version = version or self.Config.Version
	self.Config.Channel = channel or self.Config.Channel
	self.Config.MinClientVersion = minClientVersion or self.Config.MinClientVersion
	self:PublishAttributes()
end

function VersionControlTag:GetTag()
	return {
		Version = self.Config.Version,
		Channel = self.Config.Channel,
		MinClientVersion = self.Config.MinClientVersion,
		JobId = game.JobId,
		PlaceId = game.PlaceId,
	}
end

function VersionControlTag:IsClientVersionAllowed(clientVersion)
	return self:CompareVersions(clientVersion, self.Config.MinClientVersion) >= 0
end

function VersionControlTag:PublishAttributes()
	local prefix = self.Config.AttributePrefix

	-- Atributos em ReplicatedStorage sao simples de ler no cliente e tambem
	-- aparecem bem em ferramentas de inspecao do Studio.
	ReplicatedStorage:SetAttribute(`{prefix}Version`, self.Config.Version)
	ReplicatedStorage:SetAttribute(`{prefix}Channel`, self.Config.Channel)
	ReplicatedStorage:SetAttribute(`{prefix}MinClientVersion`, self.Config.MinClientVersion)
	ReplicatedStorage:SetAttribute(`{prefix}JobId`, game.JobId)
end

function VersionControlTag:Init()
	self:PublishAttributes()
end

--[[
	Resumo em blocos:
	- Configuracao: guarda versao atual, canal e versao minima do cliente em uma
	  tabela unica para facilitar substituicao por pipeline de build.
	- Comparacao: trata versoes semver simples sem depender de biblioteca externa.
	- Publicacao: replica atributos para cliente e ferramentas, mantendo o dado
	  disponivel sem criar remotes novos.
]]

return VersionControlTag.new()
