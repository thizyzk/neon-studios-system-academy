--[[
	ModuleDependencyResolver

	Proposito:
	Resolve ordem de modulos a partir de dependencias declaradas. Ele e util
	para validar pacotes de sistemas antes de ativar um lote grande, detectar
	ciclos e gerar uma lista previsivel para loaders ou ferramentas internas.

	Exemplo de uso:
	local resolver = ModuleDependencyResolver.new()
	resolver:Register("Shop", { "Economy" })
	resolver:Register("Economy", { "PlayerData" })
	local order = resolver:Resolve()
]]

local ModuleDependencyResolver = {}
ModuleDependencyResolver.__index = ModuleDependencyResolver

function ModuleDependencyResolver.new()
	local self = setmetatable({}, ModuleDependencyResolver)

	self._nodes = {}

	return self
end

function ModuleDependencyResolver:Register(name, dependencies, payload)
	assert(type(name) == "string", "Nome do modulo precisa ser string")

	self._nodes[name] = {
		Name = name,
		Dependencies = table.clone(dependencies or {}),
		Payload = payload,
	}

	return self._nodes[name]
end

function ModuleDependencyResolver:RegisterFromModule(moduleScript, module)
	local name = moduleScript.Name
	local dependencies = if type(module) == "table" then module.Dependencies else nil

	return self:Register(name, dependencies, module)
end

function ModuleDependencyResolver:LoadFolder(folder)
	for _, child in folder:GetDescendants() do
		if child:IsA("ModuleScript") then
			local ok, module = pcall(require, child)
			if ok then
				self:RegisterFromModule(child, module)
			else
				warn(`[ModuleDependencyResolver] Falha ao require {child:GetFullName()}: {module}`)
			end
		end
	end
end

function ModuleDependencyResolver:_visit(name, visiting, visited, order, stack)
	if visited[name] then
		return
	end

	if visiting[name] then
		table.insert(stack, name)
		error(`[ModuleDependencyResolver] Ciclo detectado: {table.concat(stack, " -> ")}`)
	end

	local node = self._nodes[name]
	if not node then
		error(`[ModuleDependencyResolver] Dependencia ausente: {name}`)
	end

	visiting[name] = true
	table.insert(stack, name)

	-- A visita em profundidade coloca dependencias antes do modulo consumidor,
	-- que e o formato mais facil de reaproveitar por qualquer loader.
	for _, dependencyName in node.Dependencies do
		self:_visit(dependencyName, visiting, visited, order, table.clone(stack))
	end

	visiting[name] = nil
	visited[name] = true
	table.insert(order, node)
end

function ModuleDependencyResolver:Resolve()
	local order = {}
	local visiting = {}
	local visited = {}

	for name in self._nodes do
		self:_visit(name, visiting, visited, order, {})
	end

	return order
end

function ModuleDependencyResolver:CanResolve()
	local ok, result = pcall(function()
		return self:Resolve()
	end)

	return {
		Ok = ok,
		Order = if ok then result else {},
		Error = if ok then nil else result,
	}
end

function ModuleDependencyResolver:GetMissingDependencies()
	local missing = {}

	for _, node in self._nodes do
		for _, dependencyName in node.Dependencies do
			if not self._nodes[dependencyName] then
				missing[dependencyName] = true
			end
		end
	end

	local list = {}
	for dependencyName in missing do
		table.insert(list, dependencyName)
	end
	table.sort(list)

	return list
end

--[[
	Resumo em blocos:
	- Registro: separa nome, dependencias e payload para que o resolvedor sirva
	  tanto a ModuleScripts quanto a dados montados em teste.
	- Resolucao: aplica ordenacao topologica por DFS, suficiente para grafos
	  pequenos de servicos Roblox.
	- Diagnostico: expõe CanResolve e dependencias ausentes para ferramentas de
	  build, paineis administrativos ou validacoes antes de publicar.
]]

return ModuleDependencyResolver.new()
