--[[
	IntegrationServiceFactory

	Base OOP para os sistemas de integracao. Ela concentra mecanismos que se
	repetiriam em cinquenta modulos: ciclo de vida, validacao, idempotencia,
	estado por chave, registros, fila, metricas e publicacao de eventos.

	Cada servico continua tendo nome, contrato, dependencias e operacoes
	proprias no IntegrationSystemsConfig. A factory implementa o mecanismo; o
	config descreve a politica de cada dominio.
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EventBus = require(ServerScriptService.Services.Core.EventBus)

local IntegrationServiceFactory = {}
IntegrationServiceFactory.__index = IntegrationServiceFactory

local function deepCopy(value, visited)
	if type(value) ~= "table" then
		return value
	end

	visited = visited or {}
	if visited[value] then
		return visited[value]
	end

	local clone = {}
	visited[value] = clone
	for key, child in value do
		clone[deepCopy(key, visited)] = deepCopy(child, visited)
	end
	return clone
end

local function normalizeKey(subject)
	if typeof(subject) == "Instance" and subject:IsA("Player") then
		return tostring(subject.UserId)
	end
	if type(subject) == "number" or type(subject) == "string" then
		return tostring(subject)
	end
	return nil
end

local function normalizeResult(result)
	if type(result) == "table" then
		if result.Ok == nil then
			result.Ok = true
		end
		return result
	end
	return { Ok = result ~= false, Value = result }
end

function IntegrationServiceFactory.new(definition, dependencies)
	assert(type(definition) == "table", "Definition precisa ser table")
	assert(type(definition.Name) == "string", "Definition.Name precisa ser string")

	local self = setmetatable({}, IntegrationServiceFactory)
	local deps = dependencies or {}

	self.Name = definition.Name
	self.Tier = definition.Tier
	self.Mode = definition.Mode
	self.Dependencies = table.clone(definition.Dependencies or {})
	self.Config = definition
	self.Events = deps.Events or EventBus
	self._enabled = definition.Enabled ~= false
	self._started = false
	self._states = {}
	self._records = {}
	self._queue = {}
	self._handlers = {}
	self._validators = {}
	self._processed = {}
	self._metrics = {
		Calls = 0,
		Successes = 0,
		Failures = 0,
		Duplicates = 0,
	}

	-- Os aliases transformam a API generica em uma API de dominio. Por exemplo,
	-- Claim aponta para Execute, mas injeta "Claim" como nome da operacao.
	for operationName, targetMethod in definition.Operations or {} do
		self[operationName] = function(service, ...)
			if targetMethod == "Execute" then
				return service:Execute(operationName, ...)
			end
			-- Busque na classe base, nao na instancia. Um alias pode ter o mesmo
			-- nome do metodo base (GetQueueSize, por exemplo); ler da instancia
			-- nesse caso encontraria o proprio alias e criaria recursao infinita.
			local method = IntegrationServiceFactory[targetMethod]
			assert(type(method) == "function", `Metodo base desconhecido: {targetMethod}`)
			return method(service, ...)
		end
	end

	return self
end

function IntegrationServiceFactory:Init()
	self.Events:Publish("Integration.ServiceInitialized", self.Name, self.Tier)
end

function IntegrationServiceFactory:Start()
	if self._started then
		return
	end
	self._started = true
	self.Events:Publish("Integration.ServiceStarted", self.Name, self.Tier)
end

function IntegrationServiceFactory:SetEnabled(enabled)
	self._enabled = enabled == true
	self.Events:Publish(`{self.Name}.EnabledChanged`, self._enabled)
end

function IntegrationServiceFactory:IsEnabled()
	return self._enabled
end

function IntegrationServiceFactory:RegisterHandler(operationName, callback)
	assert(type(operationName) == "string", "Operation precisa ser string")
	assert(type(callback) == "function", "Callback precisa ser function")
	self._handlers[operationName] = callback
	return self
end

function IntegrationServiceFactory:AddValidator(callback)
	assert(type(callback) == "function", "Validator precisa ser function")
	table.insert(self._validators, callback)
	return self
end

function IntegrationServiceFactory:_validate(operationName, actor, payload, context)
	if not self._enabled then
		return false, "ServiceDisabled"
	end
	if type(operationName) ~= "string" or operationName == "" then
		return false, "InvalidOperation"
	end
	if payload ~= nil and type(payload) ~= "table" then
		return false, "PayloadMustBeTable"
	end

	for _, validator in self._validators do
		local ok, accepted, errorCode = pcall(validator, operationName, actor, payload, context)
		if not ok then
			return false, "ValidatorFailed"
		end
		if accepted == false then
			return false, errorCode or "Rejected"
		end
	end
	return true
end

function IntegrationServiceFactory:Execute(operationName, actor, payload, context)
	context = context or {}
	self._metrics.Calls += 1

	local requestId = context.RequestId
	if requestId ~= nil then
		requestId = tostring(requestId)
		if self._processed[requestId] then
			self._metrics.Duplicates += 1
			local previous = deepCopy(self._processed[requestId])
			previous.Duplicate = true
			return previous
		end
	end

	local valid, validationError = self:_validate(operationName, actor, payload, context)
	if not valid then
		self._metrics.Failures += 1
		return { Ok = false, Error = validationError }
	end

	local handler = self._handlers[operationName]
	local result
	if handler then
		local ok, value = pcall(handler, actor, deepCopy(payload or {}), context)
		if not ok then
			self._metrics.Failures += 1
			return { Ok = false, Error = "HandlerFailed", Detail = tostring(value) }
		end
		result = normalizeResult(value)
	else
		-- Falhar fechado impede um servico ainda nao integrado de confirmar uma
		-- compra, recompensa ou acao que nunca alterou a fonte de verdade.
		self._metrics.Failures += 1
		return { Ok = false, Error = "HandlerNotRegistered", Operation = operationName }
	end

	if result.Ok then
		self._metrics.Successes += 1
	else
		self._metrics.Failures += 1
	end
	if requestId ~= nil then
		self._processed[requestId] = deepCopy(result)
	end
	self.Events:Publish(`{self.Name}.{operationName}`, actor, deepCopy(result), context)
	return result
end

function IntegrationServiceFactory:GetState(subject)
	local key = normalizeKey(subject)
	if not key then
		return nil
	end
	return deepCopy(self._states[key] or {})
end

function IntegrationServiceFactory:SetState(subject, state)
	local key = normalizeKey(subject)
	if not key or type(state) ~= "table" then
		return false, "InvalidState"
	end
	self._states[key] = deepCopy(state)
	self.Events:Publish(`{self.Name}.StateChanged`, subject, self:GetState(subject))
	return true
end

function IntegrationServiceFactory:UpdateState(subject, reducer)
	assert(type(reducer) == "function", "Reducer precisa ser function")
	local current = self:GetState(subject)
	if current == nil then
		return { Ok = false, Error = "InvalidSubject" }
	end
	local ok, nextState = pcall(reducer, current)
	if not ok or type(nextState) ~= "table" then
		return { Ok = false, Error = "InvalidReducerResult" }
	end
	self:SetState(subject, nextState)
	return { Ok = true, State = self:GetState(subject) }
end

function IntegrationServiceFactory:ClearState(subject)
	local key = normalizeKey(subject)
	if not key then
		return false
	end
	self._states[key] = nil
	self.Events:Publish(`{self.Name}.StateCleared`, subject)
	return true
end

function IntegrationServiceFactory:CreateRecord(recordId, data)
	recordId = tostring(recordId or "")
	if recordId == "" or type(data) ~= "table" then
		return { Ok = false, Error = "InvalidRecord" }
	end
	if self._records[recordId] then
		return { Ok = false, Error = "RecordAlreadyExists" }
	end
	self._records[recordId] = deepCopy(data)
	return { Ok = true, Id = recordId, Record = self:GetRecord(recordId) }
end

function IntegrationServiceFactory:GetRecord(recordId)
	local record = self._records[tostring(recordId)]
	return if record then deepCopy(record) else nil
end

function IntegrationServiceFactory:UpdateRecord(recordId, patch)
	recordId = tostring(recordId or "")
	local record = self._records[recordId]
	if not record or type(patch) ~= "table" then
		return { Ok = false, Error = "RecordNotFound" }
	end
	for key, value in patch do
		record[key] = deepCopy(value)
	end
	return { Ok = true, Id = recordId, Record = self:GetRecord(recordId) }
end

function IntegrationServiceFactory:RemoveRecord(recordId)
	recordId = tostring(recordId or "")
	if not self._records[recordId] then
		return false
	end
	self._records[recordId] = nil
	return true
end

function IntegrationServiceFactory:ListRecords()
	return deepCopy(self._records)
end

function IntegrationServiceFactory:Enqueue(value)
	table.insert(self._queue, deepCopy(value))
	return #self._queue
end

function IntegrationServiceFactory:Dequeue()
	if #self._queue == 0 then
		return nil
	end
	return table.remove(self._queue, 1)
end

function IntegrationServiceFactory:Peek()
	return if self._queue[1] ~= nil then deepCopy(self._queue[1]) else nil
end

function IntegrationServiceFactory:GetQueueSize()
	return #self._queue
end

function IntegrationServiceFactory:Evaluate(subject, context)
	if not self._enabled then
		return false, "ServiceDisabled"
	end
	local evaluator = self._handlers.Evaluate
	if not evaluator then
		return true
	end
	local ok, accepted, reason = pcall(evaluator, subject, context or {})
	if not ok then
		return false, "EvaluatorFailed"
	end
	return accepted == true, reason
end

function IntegrationServiceFactory:ExportState()
	return {
		States = deepCopy(self._states),
		Records = deepCopy(self._records),
		Queue = deepCopy(self._queue),
		Processed = deepCopy(self._processed),
	}
end

function IntegrationServiceFactory:ImportState(snapshot)
	if type(snapshot) ~= "table" then
		return false
	end
	self._states = deepCopy(snapshot.States or {})
	self._records = deepCopy(snapshot.Records or {})
	self._queue = deepCopy(snapshot.Queue or {})
	self._processed = deepCopy(snapshot.Processed or {})
	return true
end

function IntegrationServiceFactory:GetMetrics()
	return deepCopy(self._metrics)
end

function IntegrationServiceFactory:Destroy()
	table.clear(self._states)
	table.clear(self._records)
	table.clear(self._queue)
	table.clear(self._handlers)
	table.clear(self._validators)
	table.clear(self._processed)
	self._started = false
end

return IntegrationServiceFactory
