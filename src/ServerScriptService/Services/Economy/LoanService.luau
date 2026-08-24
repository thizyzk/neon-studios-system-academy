--[[
	LoanService

	Proposito:
	Gerencia emprestimos com principal, juros acumulados, vencimento e pagamento
	parcial. O saldo e entregue pelo CurrencyExchangeService para manter a mesma
	fonte de verdade da carteira.

	Exemplo de uso:
	local Loans = require(ServerScriptService.Services.Economy.LoanService)
	local result = Loans:Borrow(player, 2000, 24)
	Loans:Repay(player, result.Loan.Id, 500)
]]

local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)

local LoanService = {}
LoanService.__index = LoanService

local function snapshot(loan)
	return {
		Id = loan.Id,
		Principal = loan.Principal,
		Balance = math.ceil(loan.Balance),
		CreatedAt = loan.CreatedAt,
		DueAt = loan.DueAt,
		LastAccruedAt = loan.LastAccruedAt,
		State = loan.State,
		Overdue = loan.State == "Open" and os.time() > loan.DueAt,
	}
end

function LoanService.new(config, currency)
	local self = setmetatable({}, LoanService)

	self.Config = config or EconomyConfig.Loan
	self.Currency = currency or CurrencyExchangeService
	self._loans = {}

	return self
end


function LoanService:_getLoans(player)
	local loans = self._loans[player.UserId]
	if not loans then
		loans = {}
		self._loans[player.UserId] = loans
	end
	return loans
end

function LoanService:_accrue(loan)
	if loan.State ~= "Open" then
		return
	end

	local now = os.time()
	local elapsedHours = math.max(0, (now - loan.LastAccruedAt) / 3600)
	loan.Balance *= (1 + self.Config.InterestRatePerHour) ^ elapsedHours
	loan.LastAccruedAt = now
end

function LoanService:_findLoan(player, loanId)
	for _, loan in self:_getLoans(player) do
		if loan.Id == loanId then
			return loan
		end
	end
	return nil
end

function LoanService:Borrow(player, principal, durationHours)
	local normalizedPrincipal = math.floor(tonumber(principal) or 0)
	local normalizedDuration = math.floor(tonumber(durationHours) or 0)
	local openCount = 0

	for _, loan in self:_getLoans(player) do
		if loan.State == "Open" then
			openCount += 1
		end
	end

	if openCount >= self.Config.MaximumOpenLoans then
		return { Ok = false, Error = "OpenLoanLimitReached" }
	end
	if normalizedPrincipal < self.Config.MinimumPrincipal or normalizedPrincipal > self.Config.MaximumPrincipal then
		return { Ok = false, Error = "InvalidPrincipal" }
	end
	if normalizedDuration <= 0 or normalizedDuration > self.Config.MaximumDurationHours then
		return { Ok = false, Error = "InvalidDuration" }
	end

	local credited, creditError = self.Currency:AdjustBalance(player, self.Config.Currency, normalizedPrincipal, {
		Reason = "LoanDisbursement",
	})
	if not credited then
		return { Ok = false, Error = creditError }
	end

	local now = os.time()
	local loan = {
		Id = HttpService:GenerateGUID(false),
		Principal = normalizedPrincipal,
		Balance = normalizedPrincipal,
		CreatedAt = now,
		DueAt = now + normalizedDuration * 3600,
		LastAccruedAt = now,
		State = "Open",
	}
	table.insert(self:_getLoans(player), loan)

	return { Ok = true, Loan = snapshot(loan) }
end

function LoanService:Repay(player, loanId, amount)
	local loan = self:_findLoan(player, loanId)
	if not loan or loan.State ~= "Open" then
		return { Ok = false, Error = "LoanNotOpen" }
	end

	self:_accrue(loan)
	local payment = math.min(math.floor(tonumber(amount) or 0), math.ceil(loan.Balance))
	if payment <= 0 then
		return { Ok = false, Error = "InvalidPayment" }
	end

	local debited, debitError = self.Currency:AdjustBalance(player, self.Config.Currency, -payment, {
		Reason = "LoanRepayment",
		ReferenceId = loan.Id,
	})
	if not debited then
		return { Ok = false, Error = debitError }
	end

	loan.Balance = math.max(0, loan.Balance - payment)
	if loan.Balance < 1 then
		loan.Balance = 0
		loan.State = "Paid"
	end

	return { Ok = true, Payment = payment, Loan = snapshot(loan) }
end

function LoanService:GetLoans(player)
	local result = {}
	for _, loan in self:_getLoans(player) do
		self:_accrue(loan)
		table.insert(result, snapshot(loan))
	end
	return result
end

function LoanService:ExportPlayer(player)
	self:GetLoans(player)
	local result = {}
	for _, loan in self:_getLoans(player) do
		table.insert(result, table.clone(loan))
	end
	return result
end

function LoanService:ImportPlayer(player, state)
	if type(state) ~= "table" then
		return false
	end

	local imported = {}
	for _, loan in state do
		if type(loan) == "table" and type(loan.Id) == "string" and type(loan.Balance) == "number" then
			table.insert(imported, {
				Id = loan.Id,
				Principal = math.max(0, tonumber(loan.Principal) or loan.Balance),
				Balance = math.max(0, loan.Balance),
				CreatedAt = tonumber(loan.CreatedAt) or os.time(),
				DueAt = tonumber(loan.DueAt) or os.time(),
				LastAccruedAt = tonumber(loan.LastAccruedAt) or os.time(),
				State = loan.State == "Paid" and "Paid" or "Open",
			})
		end
	end
	self._loans[player.UserId] = imported
	return true
end

--[[
	Resumo em blocos:
	- Concessao: valida limites antes de creditar a carteira e restringe a
	  quantidade de contratos abertos por jogador.
	- Juros: acumulam somente quando o contrato e consultado ou pago, evitando um
	  loop por jogador e mantendo custo constante no servidor.
	- Estado: snapshots escondem tabelas mutaveis e exportacao permite que o
	  sistema de dados existente persista os contratos.
]]

return LoanService.new()
