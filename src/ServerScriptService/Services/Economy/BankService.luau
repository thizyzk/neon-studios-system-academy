--[[
	BankService

	Proposito:
	Mantem contas bancarias separadas da carteira, com deposito, saque e juros
	configuraveis. O estado pode ser exportado para o pipeline de save do jogo.

	Exemplo de uso:
	local Bank = require(ServerScriptService.Services.Economy.BankService)
	Bank:Deposit(player, 500)
	local account = Bank:GetSnapshot(player)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)
local TaxService = require(ServerScriptService.Services.Economy.TaxService)

local BankService = {}
BankService.__index = BankService

function BankService.new(config, dependencies)
	local self = setmetatable({}, BankService)
	local deps = dependencies or {}

	self.Config = config or EconomyConfig.Bank
	self.Currency = deps.Currency or CurrencyExchangeService
	self.Tax = deps.Tax or TaxService
	self._accounts = {}

	return self
end

function BankService:_getAccount(player)
	local account = self._accounts[player.UserId]
	if not account then
		account = { Balance = 0, LastAccruedAt = os.time() }
		self._accounts[player.UserId] = account
	end
	return account
end

function BankService:_accrue(account)
	local now = os.time()
	local elapsedHours = math.min((now - account.LastAccruedAt) / 3600, self.Config.MaximumOfflineHours)
	if elapsedHours <= 0 or account.Balance <= 0 then
		account.LastAccruedAt = now
		return 0
	end

	local grossInterest = math.floor(account.Balance * ((1 + self.Config.InterestRatePerHour) ^ elapsedHours - 1))
	local split = self.Tax:Split("BankInterest", grossInterest)
	account.Balance = math.min(self.Config.MaximumBalance, account.Balance + split.Net)
	account.LastAccruedAt = now
	self.Tax:Record(split.Tax)
	return split.Net
end

function BankService:Deposit(player, amount)
	local normalized = math.floor(tonumber(amount) or 0)
	local account = self:_getAccount(player)
	self:_accrue(account)

	if normalized < self.Config.MinimumTransaction or account.Balance + normalized > self.Config.MaximumBalance then
		return { Ok = false, Error = "InvalidDeposit" }
	end

	local debited, debitError = self.Currency:AdjustBalance(player, self.Config.Currency, -normalized, {
		Reason = "BankDeposit",
	})
	if not debited then
		return { Ok = false, Error = debitError }
	end

	account.Balance += normalized
	return { Ok = true, Amount = normalized, Balance = account.Balance }
end

function BankService:Withdraw(player, amount)
	local normalized = math.floor(tonumber(amount) or 0)
	local account = self:_getAccount(player)
	self:_accrue(account)

	if normalized < self.Config.MinimumTransaction or normalized > account.Balance then
		return { Ok = false, Error = "InsufficientBankBalance" }
	end

	local credited, creditError = self.Currency:AdjustBalance(player, self.Config.Currency, normalized, {
		Reason = "BankWithdrawal",
	})
	if not credited then
		return { Ok = false, Error = creditError }
	end

	account.Balance -= normalized
	return { Ok = true, Amount = normalized, Balance = account.Balance }
end

function BankService:GetSnapshot(player)
	local account = self:_getAccount(player)
	local accrued = self:_accrue(account)
	return {
		Balance = account.Balance,
		InterestAccrued = accrued,
		LastAccruedAt = account.LastAccruedAt,
		Currency = self.Config.Currency,
	}
end

function BankService:ExportPlayer(player)
	local account = self:_getAccount(player)
	self:_accrue(account)
	return table.clone(account)
end

function BankService:ImportPlayer(player, state)
	if type(state) ~= "table" or type(state.Balance) ~= "number" then
		return false
	end

	self._accounts[player.UserId] = {
		Balance = math.clamp(math.floor(state.Balance), 0, self.Config.MaximumBalance),
		LastAccruedAt = tonumber(state.LastAccruedAt) or os.time(),
	}
	return true
end

--[[
	Resumo em blocos:
	- Conta: usa UserId como chave e nao replica o saldo bancario automaticamente,
	  reduzindo exposicao de estado economico interno.
	- Juros: sao calculados sob demanda e limitados no periodo offline para evitar
	  explosoes de saldo depois de configuracoes ou ausencias longas.
	- Persistencia: exportacao e importacao deixam o save atual decidir quando e
	  como gravar os dados, sem criar outro save batcher.
]]

return BankService.new()
