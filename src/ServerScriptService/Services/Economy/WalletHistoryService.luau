--[[
	WalletHistoryService

	Proposito:
	Registra alteracoes publicadas pela carteira em um historico limitado e
	paginavel. O servico observa transacoes; ele nunca altera saldo.

	Exemplo de uso:
	local History = require(ServerScriptService.Services.Economy.WalletHistoryService)
	local page = History:GetHistory(player, { PageSize = 20, Currency = "Cash" })
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local EventBus = require(ServerScriptService.Services.Core.EventBus)

local WalletHistoryService = {}
WalletHistoryService.__index = WalletHistoryService

local function cloneEntry(entry)
	local result = table.clone(entry)
	if type(entry.Context) == "table" then
		result.Context = table.clone(entry.Context)
	end
	return result
end

function WalletHistoryService.new(config, eventBus)
	local self = setmetatable({}, WalletHistoryService)
	self.Config = config or EconomyConfig.WalletHistory
	self.Events = eventBus or EventBus
	self._entries = {}
	self._connection = nil
	return self
end

function WalletHistoryService:Record(change)
	if type(change) ~= "table" or type(change.UserId) ~= "number" then
		return false
	end

	local entries = self._entries[change.UserId]
	if not entries then
		entries = {}
		self._entries[change.UserId] = entries
	end

	table.insert(entries, cloneEntry(change))
	while #entries > self.Config.MaximumEntriesPerPlayer do
		table.remove(entries, 1)
	end
	return true
end

function WalletHistoryService:GetHistory(player, options)
	local query = options or {}
	local entries = self._entries[player.UserId] or {}
	local pageSize = math.clamp(
		math.floor(tonumber(query.PageSize) or self.Config.DefaultPageSize),
		1,
		self.Config.MaximumPageSize
	)
	local offset = math.max(0, math.floor(tonumber(query.Offset) or 0))
	local filtered = {}

	for index = #entries, 1, -1 do
		local entry = entries[index]
		local currencyMatches = not query.Currency or entry.Currency == query.Currency
		local reasonMatches = not query.Reason or entry.Reason == query.Reason
		if currencyMatches and reasonMatches then
			table.insert(filtered, entry)
		end
	end

	local page = {}
	for index = offset + 1, math.min(#filtered, offset + pageSize) do
		table.insert(page, cloneEntry(filtered[index]))
	end

	return {
		Entries = page,
		Offset = offset,
		PageSize = pageSize,
		Total = #filtered,
		HasMore = offset + #page < #filtered,
	}
end

function WalletHistoryService:ExportPlayer(player)
	local result = {}
	for _, entry in self._entries[player.UserId] or {} do
		table.insert(result, cloneEntry(entry))
	end
	return result
end

function WalletHistoryService:ImportPlayer(player, state)
	if type(state) ~= "table" then
		return false
	end

	local entries = {}
	local firstIndex = math.max(1, #state - self.Config.MaximumEntriesPerPlayer + 1)
	for index = firstIndex, #state do
		local entry = state[index]
		if type(entry) == "table" then
			table.insert(entries, cloneEntry(entry))
		end
	end
	self._entries[player.UserId] = entries
	return true
end

function WalletHistoryService:Start()
	self._connection = self.Events:Subscribe("Wallet.BalanceAdjusted", function(change)
		self:Record(change)
	end)
end

function WalletHistoryService:Destroy()
	if self._connection then
		self._connection:Disconnect()
		self._connection = nil
	end
end

--[[
	Resumo em blocos:
	- Observacao: consome eventos da carteira para nao criar outro caminho de
	  credito ou debito.
	- Retencao: remove registros antigos e limita paginas para controlar memoria
	  e payload de UI.
	- Persistencia: entradas podem ser importadas e exportadas pelo save atual;
	  filtros trabalham sobre snapshots sem expor tabelas internas.
]]

return WalletHistoryService.new()
