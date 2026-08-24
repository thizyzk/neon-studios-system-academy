--[[
	ServiceLoader

	Proposito:
	Carrega servicos OOP com ordem de dependencias declarada. Este projeto ja
	possui `ReplicatedStorage.Shared.Framework.Loader`; portanto este modulo e
	uma alternativa opcional para sistemas novos que precisem de ordenacao por
	dependencia, sem substituir o bootstrap atual.

	Exemplo de uso:
	local loader = ServiceLoader.new()
	loader:AddService("Economy", EconomyService, { "PlayerData" })
	loader:Init()
	loader:Start()
]]

local ServiceLoader = {}
ServiceLoader.__index = ServiceLoader

local DEFAULT_CONFIG = {
	WarnOnDuplicate = true,
	WarnOnMissingDependency = true,
}

local function cloneArray(values)
	local clone = {}

	for _, value in values or {} do
		table.insert(clone, value)
	end

	return clone
end

function ServiceLoader.new(config)
	local self = setmetatable({}, ServiceLoader)

	self.Config = table.clone(DEFAULT_CONFIG)
	for key, value in config or {} do
		self.Config[key] = value
	end

	self._services = {}
	self._order = nil
	self._started = false
	self._initialized = false

	return self
end

function ServiceLoader:AddService(name, service, dependencies)
	assert(type(name) == "string", "Nome do servico precisa ser string")
	assert(type(service) == "table", "Servico precisa ser table")

	if self._services[name] and self.Config.WarnOnDuplicate then
		warn(`[ServiceLoader] Substituindo servico registrado: {name}`)
	end

	-- Dependencias ficam junto do registro, nao dentro da classe, para permitir
	-- testes e composicoes diferentes sem editar o modulo original.
	self._services[name] = {
		Name = name,
		Service = service,
		Dependencies = cloneArray(dependencies or service.Dependencies),
	}
	self._order = nil

	-- Como este modulo tambem pode ser carregado pelo bootstrap global, ele
	-- aceita registros tardios e inicializa o servico novo imediatamente.
	if self._initialized and type(service.Init) == "function" then
		local ok, err = pcall(service.Init, service, self)
		if not ok then
			warn(`[ServiceLoader] Init tardio falhou em {name}: {err}`)
		end
	end

	if self._started and type(service.Start) == "function" then
		task.spawn(function()
			local ok, err = pcall(service.Start, service, self)
			if not ok then
				warn(`[ServiceLoader] Start tardio falhou em {name}: {err}`)
			end
		end)
	end

	return service
end

function ServiceLoader:AddFolder(folder)
	for _, child in folder:GetDescendants() do
		if child:IsA("ModuleScript") then
			local ok, service = pcall(require, child)
			if ok and type(service) == "table" then
				self:AddService(child.Name, service, service.Dependencies)
			elseif not ok then
				warn(`[ServiceLoader] Falha ao carregar {child:GetFullName()}: {service}`)
			end
		end
	end
end

function ServiceLoader:_visit(name, visiting, visited, order)
	if visited[name] then
		return
	end

	if visiting[name] then
		error(`[ServiceLoader] Dependencia circular detectada em {name}`)
	end

	local record = self._services[name]
	if not record then
		if self.Config.WarnOnMissingDependency then
			warn(`[ServiceLoader] Dependencia nao registrada: {name}`)
		end
		return
	end

	visiting[name] = true

	for _, dependencyName in record.Dependencies do
		self:_visit(dependencyName, visiting, visited, order)
	end

	visiting[name] = nil
	visited[name] = true
	table.insert(order, record)
end

function ServiceLoader:ResolveOrder()
	if self._order then
		return self._order
	end

	local order = {}
	local visiting = {}
	local visited = {}

	for name in self._services do
		self:_visit(name, visiting, visited, order)
	end

	self._order = order
	return order
end

function ServiceLoader:GetService(name)
	local record = self._services[name]

	return if record then record.Service else nil
end

function ServiceLoader:Init()
	if self._initialized then
		return
	end

	self._initialized = true

	for _, record in self:ResolveOrder() do
		local service = record.Service
		if type(service.Init) == "function" then
			local ok, err = pcall(service.Init, service, self)
			if not ok then
				warn(`[ServiceLoader] Init falhou em {record.Name}: {err}`)
			end
		end
	end
end

function ServiceLoader:Start()
	if self._started then
		return
	end

	self:Init()
	self._started = true

	for _, record in self:ResolveOrder() do
		local service = record.Service
		if type(service.Start) == "function" then
			task.spawn(function()
				local ok, err = pcall(service.Start, service, self)
				if not ok then
					warn(`[ServiceLoader] Start falhou em {record.Name}: {err}`)
				end
			end)
		end
	end
end

--[[
	Resumo em blocos:
	- Registro: guarda servico, nome e dependencias em uma tabela unica para
	  deixar a ordem de inicializacao explicita.
	- Resolucao: usa visita em profundidade para ordenar dependencias antes dos
	  consumidores e detectar ciclos cedo.
	- Ciclo Init/Start: separa preparacao sincrona de inicio assincrono, seguindo
	  o padrao que o projeto ja usa no loader atual.
]]

return ServiceLoader.new()
