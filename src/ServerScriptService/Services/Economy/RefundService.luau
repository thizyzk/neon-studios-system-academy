--[[
	RefundService

	Proposito:
	Gerencia pedidos e aprovacao de estornos da economia interna por handlers
	registrados. Ele nao promete devolver Robux: reembolsos financeiros da
	plataforma permanecem fora deste modulo.

	Exemplo de uso:
	local Refunds = require(ServerScriptService.Services.Economy.RefundService)
	Refunds:RegisterHandler("ItemPurchase", function(request) return reverseItem(request) end)
	local request = Refunds:Request(player, "tx-123", "ItemPurchase", os.time())
]]

local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local EventBus = require(ServerScriptService.Services.Core.EventBus)

local RefundService = {}
RefundService.__index = RefundService

local function snapshot(request)
	local result = table.clone(request)
	if type(request.Metadata) == "table" then
		result.Metadata = table.clone(request.Metadata)
	end
	return result
end

function RefundService.new(config, eventBus)
	local self = setmetatable({}, RefundService)
	self.Config = config or EconomyConfig.Refund
	self.Events = eventBus or EventBus
	self._requests = {}
	self._byTransaction = {}
	self._handlers = {}
	return self
end

function RefundService:RegisterHandler(transactionType, handler)
	assert(type(handler) == "function", "Handler precisa ser function")
	self._handlers[transactionType] = handler
end

function RefundService:Request(player, transactionId, transactionType, purchasedAt, metadata)
	if not self.Config.AllowedTransactionTypes[transactionType] then
		return { Ok = false, Error = "TransactionTypeNotRefundable" }
	end
	if type(transactionId) ~= "string" or transactionId == "" or self._byTransaction[transactionId] then
		return { Ok = false, Error = "InvalidOrDuplicateTransaction" }
	end

	local transactionTime = math.floor(tonumber(purchasedAt) or 0)
	if transactionTime <= 0 or os.time() - transactionTime > self.Config.RequestWindowSeconds then
		return { Ok = false, Error = "RefundWindowExpired" }
	end

	local pendingCount = 0
	for _, request in self._requests do
		if request.UserId == player.UserId and request.State == "Pending" then
			pendingCount += 1
		end
	end
	if pendingCount >= self.Config.MaximumPendingPerPlayer then
		return { Ok = false, Error = "PendingRefundLimitReached" }
	end

	local request = {
		Id = HttpService:GenerateGUID(false),
		TransactionId = transactionId,
		TransactionType = transactionType,
		UserId = player.UserId,
		PurchasedAt = transactionTime,
		RequestedAt = os.time(),
		State = "Pending",
		Metadata = if type(metadata) == "table" then table.clone(metadata) else {},
	}
	self._requests[request.Id] = request
	self._byTransaction[transactionId] = request.Id
	self.Events:Publish("Refund.Requested", snapshot(request))
	return { Ok = true, Request = snapshot(request) }
end

function RefundService:Approve(requestId, reviewerUserId)
	local request = self._requests[requestId]
	if not request or request.State ~= "Pending" then
		return { Ok = false, Error = "RefundNotPending" }
	end

	local handler = self._handlers[request.TransactionType]
	if not handler then
		return { Ok = false, Error = "RefundHandlerMissing" }
	end

	local ok, handlerResult = pcall(handler, snapshot(request))
	local handled = ok and (handlerResult == true or (type(handlerResult) == "table" and handlerResult.Ok == true))
	if not handled then
		return { Ok = false, Error = "RefundExecutionFailed", Detail = if ok then handlerResult else tostring(handlerResult) }
	end

	request.State = "Approved"
	request.ReviewedAt = os.time()
	request.ReviewerUserId = reviewerUserId
	request.Result = if type(handlerResult) == "table" then table.clone(handlerResult) else nil
	self.Events:Publish("Refund.Approved", snapshot(request))
	return { Ok = true, Request = snapshot(request) }
end

function RefundService:Reject(requestId, reviewerUserId, reason)
	local request = self._requests[requestId]
	if not request or request.State ~= "Pending" then
		return { Ok = false, Error = "RefundNotPending" }
	end

	request.State = "Rejected"
	request.ReviewedAt = os.time()
	request.ReviewerUserId = reviewerUserId
	request.Reason = tostring(reason or "NotEligible")
	self.Events:Publish("Refund.Rejected", snapshot(request))
	return { Ok = true, Request = snapshot(request) }
end

function RefundService:GetPlayerRequests(player)
	local result = {}
	for _, request in self._requests do
		if request.UserId == player.UserId then
			table.insert(result, snapshot(request))
		end
	end
	table.sort(result, function(left, right)
		return left.RequestedAt > right.RequestedAt
	end)
	return result
end

function RefundService:ExportState()
	local result = {}
	for requestId, request in self._requests do
		result[requestId] = snapshot(request)
	end
	return result
end

function RefundService:ImportState(state)
	if type(state) ~= "table" then
		return false
	end

	table.clear(self._requests)
	table.clear(self._byTransaction)
	for requestId, request in state do
		if type(request) == "table" and type(request.TransactionId) == "string" then
			self._requests[requestId] = snapshot(request)
			self._byTransaction[request.TransactionId] = requestId
		end
	end
	return true
end

--[[
	Resumo em blocos:
	- Pedido: valida janela, tipo, duplicidade e limite antes de criar um registro
	  auditavel e imutavel para o jogador.
	- Execucao: handlers especificos conhecem como reverter cada compra; o pedido
	  so vira aprovado depois que o handler confirma sucesso.
	- Escopo: o modulo estorna ativos internos e deixa qualquer devolucao de
	  dinheiro real para os processos oficiais da plataforma.
]]

return RefundService.new()
