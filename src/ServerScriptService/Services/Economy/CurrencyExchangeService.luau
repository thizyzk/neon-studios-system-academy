--[[
	CurrencyExchangeService

	Proposito:
	Converte moedas por taxas configuradas e oferece uma unica porta para ler e
	alterar saldos. Cash continua pertencendo ao LeaderstatsService; moedas
	secundarias ficam em atributos do Player ate serem ligadas ao save existente.

	Exemplo de uso:
	local Exchange = require(ServerScriptService.Services.Economy.CurrencyExchangeService)
	local quote = Exchange:Quote("Cash", "Gems", 1000)
	local result = Exchange:Exchange(player, "Cash", "Gems", 1000)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local EventBus = require(ServerScriptService.Services.Core.EventBus)
local LeaderstatsService = require(ServerScriptService.Services.LeaderstatsService)

local CurrencyExchangeService = {}
CurrencyExchangeService.__index = CurrencyExchangeService

local function isValidAmount(value)
	return type(value) == "number" and value == value and value > 0 and value < math.huge
end

function CurrencyExchangeService.new(config, leaderstats, eventBus)
	local self = setmetatable({}, CurrencyExchangeService)

	self.Config = config or EconomyConfig.CurrencyExchange
	self.Leaderstats = leaderstats or LeaderstatsService
	self.Events = eventBus or EventBus

	return self
end

function CurrencyExchangeService:IsSupported(currencyId)
	return currencyId == self.Config.DefaultCurrency or self.Config.CurrencyAttributes[currencyId] ~= nil
end

function CurrencyExchangeService:GetBalance(player, currencyId)
	if currencyId == self.Config.DefaultCurrency then
		local stat = self.Leaderstats:GetStat(player, "Cash")
		return if stat then stat.Value else 0
	end

	local attributeName = self.Config.CurrencyAttributes[currencyId]
	if not attributeName then
		return nil
	end

	local value = player:GetAttribute(attributeName)
	return if type(value) == "number" then math.max(0, math.floor(value)) else 0
end

function CurrencyExchangeService:SetBalance(player, currencyId, amount)
	if not self:IsSupported(currencyId) or type(amount) ~= "number" or amount ~= amount then
		return false
	end

	local normalized = math.max(0, math.floor(amount))
	if currencyId == self.Config.DefaultCurrency then
		return self.Leaderstats:SetStat(player, "Cash", normalized) ~= nil
	end

	player:SetAttribute(self.Config.CurrencyAttributes[currencyId], normalized)
	return true
end

function CurrencyExchangeService:AdjustBalance(player, currencyId, delta, context)
	if type(delta) ~= "number" or delta ~= delta then
		return false, "InvalidAmount"
	end

	local current = self:GetBalance(player, currencyId)
	if current == nil then
		return false, "UnsupportedCurrency"
	end

	local nextBalance = current + math.floor(delta)
	if nextBalance < 0 then
		return false, "InsufficientFunds"
	end

	if not self:SetBalance(player, currencyId, nextBalance) then
		return false, "BalanceUpdateFailed"
	end

	local details = context or {}
	self.Events:Publish("Wallet.BalanceAdjusted", {
		UserId = player.UserId,
		Currency = currencyId,
		Delta = math.floor(delta),
		Balance = nextBalance,
		Reason = tostring(details.Reason or "Adjustment"),
		ReferenceId = details.ReferenceId,
		CounterpartyUserId = details.CounterpartyUserId,
		Timestamp = os.time(),
		Context = if type(details.Metadata) == "table" then table.clone(details.Metadata) else nil,
	})

	return true, nextBalance
end

function CurrencyExchangeService:GetRate(fromCurrency, toCurrency)
	local sourceRates = self.Config.Rates[fromCurrency]
	return if sourceRates then sourceRates[toCurrency] else nil
end

function CurrencyExchangeService:Quote(fromCurrency, toCurrency, amount)
	if not isValidAmount(amount) or amount < self.Config.MinimumInput then
		return { Ok = false, Error = "InvalidAmount" }
	end

	local rate = self:GetRate(fromCurrency, toCurrency)
	if not rate or rate <= 0 then
		return { Ok = false, Error = "RateNotConfigured" }
	end

	local input = math.floor(amount)
	local grossOutput = input * rate
	local fee = grossOutput * self.Config.FeeRate
	local output = math.floor(grossOutput - fee)

	if output <= 0 then
		return { Ok = false, Error = "OutputTooSmall" }
	end

	return {
		Ok = true,
		FromCurrency = fromCurrency,
		ToCurrency = toCurrency,
		Input = input,
		Output = output,
		Rate = rate,
		Fee = grossOutput - output,
	}
end

function CurrencyExchangeService:Exchange(player, fromCurrency, toCurrency, amount)
	local quote = self:Quote(fromCurrency, toCurrency, amount)
	if not quote.Ok then
		return quote
	end

	local debited, debitError = self:AdjustBalance(player, fromCurrency, -quote.Input, {
		Reason = "CurrencyExchangeDebit",
		Metadata = { ToCurrency = toCurrency },
	})
	if not debited then
		return { Ok = false, Error = debitError }
	end

	local credited, creditError = self:AdjustBalance(player, toCurrency, quote.Output, {
		Reason = "CurrencyExchangeCredit",
		Metadata = { FromCurrency = fromCurrency },
	})
	if not credited then
		self:AdjustBalance(player, fromCurrency, quote.Input, { Reason = "CurrencyExchangeRollback" })
		return { Ok = false, Error = creditError }
	end

	quote.Balances = {
		[fromCurrency] = self:GetBalance(player, fromCurrency),
		[toCurrency] = self:GetBalance(player, toCurrency),
	}
	return quote
end

--[[
	Resumo em blocos:
	- Adaptador de saldo: preserva Leaderstats como dono de Cash e usa atributos
	  apenas para moedas novas, evitando um segundo saldo para a mesma moeda.
	- Cotacao: aplica taxa e tarifa antes de qualquer mutacao, permitindo mostrar
	  ao jogador exatamente o resultado esperado.
	- Conversao: debita e credita como uma transacao; se o credito falhar, o
	  debito e revertido para nao destruir valor.
	- Historico: cada ajuste publica um evento descritivo para auditoria sem
	  permitir que o observador participe da mutacao.
]]

return CurrencyExchangeService.new()
