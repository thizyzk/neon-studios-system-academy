--[[
	RemoteRegistry

	Proposito:
	Cria e reutiliza RemoteEvent e RemoteFunction em namespaces previsiveis.
	Ele remove repeticao de "get or create Remotes" sem impor formato unico de
	payload para todos os sistemas.

	Exemplo de uso:
	local RemoteRegistry = require(ServerScriptService.Services.Core.RemoteRegistry)
	local sold = RemoteRegistry:GetRemote("Economy", "SellProducts", "RemoteFunction")
	sold.OnServerInvoke = function(player) return true end
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local RemoteRegistry = {}
RemoteRegistry.__index = RemoteRegistry

local DEFAULT_CONFIG = {
	RootName = "Remotes",
	AllowedClasses = {
		RemoteEvent = true,
		RemoteFunction = true,
		UnreliableRemoteEvent = true,
	},
}

function RemoteRegistry.new(config)
	local self = setmetatable({}, RemoteRegistry)

	self.Config = table.clone(DEFAULT_CONFIG)
	self.Config.AllowedClasses = table.clone(DEFAULT_CONFIG.AllowedClasses)

	for key, value in config or {} do
		self.Config[key] = value
	end

	self._root = nil
	self._cache = {}

	return self
end

function RemoteRegistry:_getOrCreateFolder(parent, name)
	local folder = parent:FindFirstChild(name)

	if folder and not folder:IsA("Folder") then
		error(`[RemoteRegistry] {folder:GetFullName()} existe, mas nao e Folder`)
	end

	if not folder then
		folder = Instance.new("Folder")
		folder.Name = name
		folder.Parent = parent
	end

	return folder
end

function RemoteRegistry:GetRoot()
	if not self._root then
		self._root = self:_getOrCreateFolder(ReplicatedStorage, self.Config.RootName)
	end

	return self._root
end

function RemoteRegistry:GetNamespace(namespace)
	return self:_getOrCreateFolder(self:GetRoot(), namespace)
end

function RemoteRegistry:GetRemote(namespace, remoteName, className)
	className = className or "RemoteEvent"

	if not self.Config.AllowedClasses[className] then
		error(`[RemoteRegistry] Classe de remote nao permitida: {className}`)
	end

	local cacheKey = `{namespace}/{remoteName}/{className}`
	if self._cache[cacheKey] then
		return self._cache[cacheKey]
	end

	local folder = self:GetNamespace(namespace)
	local remote = folder:FindFirstChild(remoteName)

	-- Validar a classe evita bugs silenciosos quando dois sistemas tentam usar
	-- o mesmo nome para tipos diferentes de comunicacao.
	if remote and not remote:IsA(className) then
		error(`[RemoteRegistry] {remote:GetFullName()} existe com classe diferente`)
	end

	if not remote then
		remote = Instance.new(className)
		remote.Name = remoteName
		remote.Parent = folder
	end

	self._cache[cacheKey] = remote
	return remote
end

function RemoteRegistry:BindFunction(namespace, remoteName, callback)
	local remote = self:GetRemote(namespace, remoteName, "RemoteFunction")
	remote.OnServerInvoke = callback

	return remote
end

function RemoteRegistry:OnEvent(namespace, remoteName, callback)
	local remote = self:GetRemote(namespace, remoteName, "RemoteEvent")

	return remote.OnServerEvent:Connect(callback)
end

function RemoteRegistry:FireClient(player, namespace, remoteName, ...)
	local remote = self:GetRemote(namespace, remoteName, "RemoteEvent")
	remote:FireClient(player, ...)
end

function RemoteRegistry:FireAllClients(namespace, remoteName, ...)
	local remote = self:GetRemote(namespace, remoteName, "RemoteEvent")
	remote:FireAllClients(...)
end

function RemoteRegistry:Init()
	self:GetRoot()
end

--[[
	Resumo em blocos:
	- Root e namespaces: organizam remotes por sistema para evitar uma pasta
	  global dificil de auditar.
	- Cache: reduz buscas repetidas na hierarquia de instancias.
	- Validacao: impede colisao entre RemoteEvent e RemoteFunction com mesmo
	  nome, um erro comum que costuma aparecer so em runtime.
]]

return RemoteRegistry.new()
