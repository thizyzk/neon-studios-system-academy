--[[
	TaxService

	Proposito:
	Calcula impostos por tipo de transacao e registra a arrecadacao do servidor.
	O servico separa calculo de cobranca para poder ser usado em previews sem
	alterar saldo algum.

	Exemplo de uso:
	local TaxService = require(ServerScriptService.Services.Economy.TaxService)
	local split = TaxService:Split("AuctionSale", 1000)
	TaxService:Record(split.Tax)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)

local TaxService = {}
TaxService.__index = TaxService

function TaxService.new(config)
	local self = setmetatable({}, TaxService)

	self.Config = config or EconomyConfig.Tax
	self._treasury = 0

	return self
end

function TaxService:GetRate(transactionType, context)
	local configuredRate = self.Config.Rates[transactionType]
	local rate = if configuredRate ~= nil then configuredRate else self.Config.DefaultRate

	if context and type(context.RateOverride) == "number" then
		rate = context.RateOverride
	end

	return math.clamp(rate, 0, self.Config.MaximumRate)
end

function TaxService:Calculate(transactionType, grossAmount, context)
	if type(grossAmount) ~= "number" or grossAmount ~= grossAmount or grossAmount < 0 then
		return nil, "InvalidAmount"
	end

	local normalizedGross = math.floor(grossAmount)
	local rate = self:GetRate(transactionType, context)
	return math.floor(normalizedGross * rate), nil, rate
end

function TaxService:Split(transactionType, grossAmount, context)
	local tax, taxError, rate = self:Calculate(transactionType, grossAmount, context)
	if tax == nil then
		return { Ok = false, Error = taxError }
	end

	local gross = math.floor(grossAmount)
	return {
		Ok = true,
		Gross = gross,
		Tax = tax,
		Net = gross - tax,
		Rate = rate,
		TransactionType = transactionType,
	}
end

function TaxService:Record(amount)
	if type(amount) ~= "number" or amount <= 0 then
		return self._treasury
	end

	self._treasury += math.floor(amount)
	return self._treasury
end

function TaxService:GetTreasury()
	return self._treasury
end

function TaxService:ExportState()
	return { Treasury = self._treasury }
end

function TaxService:ImportState(state)
	if type(state) == "table" and type(state.Treasury) == "number" then
		self._treasury = math.max(0, math.floor(state.Treasury))
		return true
	end

	return false
end

--[[
	Resumo em blocos:
	- Regras: taxas sao escolhidas pelo tipo de transacao e limitadas por um teto
	  global, impedindo configuracoes que consumam todo o valor.
	- Calculo: Split retorna bruto, imposto e liquido sem efeitos colaterais para
	  atender telas de preview e confirmacoes.
	- Tesouro: a arrecadacao fica exportavel para o save ou analytics existente,
	  sem acoplar este modulo a uma estrategia de persistencia especifica.
]]

return TaxService.new()
