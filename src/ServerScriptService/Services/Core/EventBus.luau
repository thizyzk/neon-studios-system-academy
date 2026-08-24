--[[
	EventBus

	Proposito:
	Publica eventos nomeados dentro do servidor usando BindableEvent. Diferente
	de um Signal generico, este modulo e voltado para eventos de dominio com
	nomes estaveis, como "Inventory.ItemAdded" ou "Factory.MachineFinished".

	Exemplo de uso:
	local EventBus = require(ServerScriptService.Services.Core.EventBus)
	local connection = EventBus:Subscribe("Economy.Sold", function(player, payout) end)
	EventBus:Publish("Economy.Sold", player, 100)
]]

local EventBus = {}
EventBus.__index = EventBus

local DEFAULT_CONFIG = {
	WarnWithoutSubscribers = false,
}

function EventBus.new(config)
	local self = setmetatable({}, EventBus)

	self.Config = table.clone(DEFAULT_CONFIG)
	for key, value in config or {} do
		self.Config[key] = value
	end

	self._events = {}
	self._subscriberCounts = {}

	return self
end

function EventBus:_getEvent(eventName)
	local event = self._events[eventName]

	if not event then
		event = Instance.new("BindableEvent")
		event.Name = eventName
		self._events[eventName] = event
		self._subscriberCounts[eventName] = 0
	end

	return event
end

function EventBus:Subscribe(eventName, callback)
	assert(type(callback) == "function", "Callback precisa ser function")

	local event = self:_getEvent(eventName)
	self._subscriberCounts[eventName] += 1

	local connection = event.Event:Connect(callback)
	local bus = self
	local wrappedConnection = {}

	-- O wrapper mantem a contagem correta mesmo quando o consumidor desconecta
	-- manualmente, o que ajuda em diagnostico de eventos sem ouvintes.
	wrappedConnection.Disconnect = function()
		if connection.Connected then
			connection:Disconnect()
			bus._subscriberCounts[eventName] = math.max(0, bus._subscriberCounts[eventName] - 1)
		end
	end

	return wrappedConnection
end

function EventBus:Once(eventName, callback)
	local connection

	connection = self:Subscribe(eventName, function(...)
		connection:Disconnect()
		callback(...)
	end)

	return connection
end

function EventBus:Publish(eventName, ...)
	local count = self._subscriberCounts[eventName] or 0

	if count == 0 and self.Config.WarnWithoutSubscribers then
		warn(`[EventBus] Evento sem inscritos: {eventName}`)
	end

	self:_getEvent(eventName):Fire(...)
end

function EventBus:Wait(eventName)
	return self:_getEvent(eventName).Event:Wait()
end

function EventBus:GetSubscriberCount(eventName)
	return self._subscriberCounts[eventName] or 0
end

function EventBus:Clear(eventName)
	if eventName then
		local event = self._events[eventName]
		if event then
			event:Destroy()
		end
		self._events[eventName] = nil
		self._subscriberCounts[eventName] = nil
		return
	end

	for _, event in self._events do
		event:Destroy()
	end

	table.clear(self._events)
	table.clear(self._subscriberCounts)
end

--[[
	Resumo em blocos:
	- Eventos nomeados: reduzem acoplamento direto entre servicos sem criar uma
	  dependencia de rede ou de cliente.
	- Inscricao: retorna um wrapper simples para manter contagem de assinantes.
	- Publicacao: usa BindableEvent porque o escopo e servidor-servidor, evitando
	  remotes onde nao ha comunicacao com cliente.
]]

return EventBus.new()
