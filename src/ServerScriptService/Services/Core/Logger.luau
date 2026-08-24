--[[
	Logger

	Proposito:
	Padroniza logs do servidor com niveis, contexto e historico recente em
	memoria. Ele continua usando `print`, `warn` e `error` nativos para que a
	saida apareca normalmente no console do Roblox Studio.

	Exemplo de uso:
	local Logger = require(ServerScriptService.Services.Core.Logger)
	Logger:Info("Economy", "Venda concluida", { Player = player.UserId, Payout = 50 })
	Logger:Warn("Remote", "Payload rejeitado")
]]

local Logger = {}
Logger.__index = Logger

local DEFAULT_CONFIG = {
	MinLevel = "Debug",
	Prefix = "CottonFabricTycoon",
	KeepHistory = true,
	HistoryLimit = 150,
	Levels = {
		Debug = 10,
		Info = 20,
		Warn = 30,
		Error = 40,
	},
}

local function serializeContext(context)
	if type(context) ~= "table" then
		return ""
	end

	local parts = {}

	for key, value in context do
		table.insert(parts, `{key}={tostring(value)}`)
	end

	table.sort(parts)

	if #parts == 0 then
		return ""
	end

	return ` | {table.concat(parts, ", ")}`
end

function Logger.new(config)
	local self = setmetatable({}, Logger)

	self.Config = table.clone(DEFAULT_CONFIG)
	self.Config.Levels = table.clone(DEFAULT_CONFIG.Levels)

	for key, value in config or {} do
		self.Config[key] = value
	end

	self._history = {}

	return self
end

function Logger:_shouldWrite(level)
	local levels = self.Config.Levels
	return (levels[level] or 0) >= (levels[self.Config.MinLevel] or 0)
end

function Logger:_remember(entry)
	if not self.Config.KeepHistory then
		return
	end

	table.insert(self._history, entry)

	while #self._history > self.Config.HistoryLimit do
		table.remove(self._history, 1)
	end
end

function Logger:_write(level, scope, message, context)
	local entry = {
		Time = os.time(),
		Level = level,
		Scope = scope,
		Message = message,
		Context = context,
	}

	self:_remember(entry)

	if not self:_shouldWrite(level) then
		return entry
	end

	-- A string final e montada em um unico lugar para que todos os sistemas
	-- tenham logs pesquisaveis pelo mesmo prefixo e pelo mesmo escopo.
	local line = `[{self.Config.Prefix}][{level}][{scope}] {message}{serializeContext(context)}`

	if level == "Warn" then
		warn(line)
	elseif level == "Error" then
		error(line, 2)
	else
		print(line)
	end

	return entry
end

function Logger:SetMinLevel(level)
	assert(self.Config.Levels[level] ~= nil, "Nivel de log desconhecido")
	self.Config.MinLevel = level
end

function Logger:Debug(scope, message, context)
	return self:_write("Debug", scope, message, context)
end

function Logger:Info(scope, message, context)
	return self:_write("Info", scope, message, context)
end

function Logger:Warn(scope, message, context)
	return self:_write("Warn", scope, message, context)
end

function Logger:Error(scope, message, context)
	return self:_write("Error", scope, message, context)
end

function Logger:GetHistory()
	return table.clone(self._history)
end

function Logger:ClearHistory()
	table.clear(self._history)
end

--[[
	Resumo em blocos:
	- Configuracao: define niveis e limite de historico para adaptar ruido por
	  ambiente sem mudar chamadas de log.
	- Escrita: centraliza formato e saida nativa, mantendo compatibilidade com o
	  console do Studio.
	- Historico: guarda os ultimos eventos para telas administrativas ou dumps
	  de diagnostico sem depender de servico externo.
]]

return Logger.new()
