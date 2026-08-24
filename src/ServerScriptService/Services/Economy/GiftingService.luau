--[[
	GiftingService

	Proposito:
	Executa presentes unidirecionais de moeda ou item com limite diario,
	cooldown, imposto opcional e rollback. Ele nao substitui TradeService,
	pois nao existe oferta, contraparte ou troca de ativos.

	Exemplo de uso:
	local Gifting = require(ServerScriptService.Services.Economy.GiftingService)
	Gifting:GiftCurrency(sender, recipient, 500)
	Gifting:GiftItem(sender, recipient, "CottonFabric", 2)
]]

local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)
local EventBus = require(ServerScriptService.Services.Core.EventBus)
local InventoryService = require(ServerScriptService.Services.InventoryService)
local TaxService = require(ServerScriptService.Services.Economy.TaxService)

local GiftingService = {}
GiftingService.__index = GiftingService

function GiftingService.new(config, dependencies)
	local self = setmetatable({}, GiftingService)
	local deps = dependencies or {}

	self.Config = config or EconomyConfig.Gifting
	self.Currency = deps.Currency or CurrencyExchangeService
	self.Inventory = deps.Inventory or InventoryService
	self.Tax = deps.Tax or TaxService
	self.Events = deps.Events or EventBus
	self._activity = {}

	return self
end

function GiftingService:_getActivity(player)
	local dayKey = os.date("!%Y-%j")
	local activity = self._activity[player.UserId]
	if not activity or activity.DayKey ~= dayKey then
		activity = { DayKey = dayKey, CurrencySent = 0, LastGiftAt = 0 }
		self._activity[player.UserId] = activity
	end
	return activity
end

function GiftingService:_validate(sender, recipient)
	if not sender or not recipient or sender == recipient or sender.UserId == recipient.UserId then
		return false, "InvalidRecipient"
	end

	local activity = self:_getActivity(sender)
	local remaining = self.Config.CooldownSeconds - (os.time() - activity.LastGiftAt)
	if remaining > 0 then
		return false, "GiftCooldown", remaining
	end

	return true, nil, activity
end

function GiftingService:GetRemainingDailyCurrency(player)
	local activity = self:_getActivity(player)
	return math.max(0, self.Config.DailyCurrencyLimit - activity.CurrencySent)
end

function GiftingService:GiftCurrency(sender, recipient, amount)
	local valid, validationError, detail = self:_validate(sender, recipient)
	if not valid then
		return { Ok = false, Error = validationError, Remaining = detail }
	end

	local activity = detail
	local normalized = math.floor(tonumber(amount) or 0)
	if normalized < self.Config.MinimumCurrencyAmount or normalized > self.Config.MaximumCurrencyAmount then
		return { Ok = false, Error = "InvalidGiftAmount" }
	end
	if activity.CurrencySent + normalized > self.Config.DailyCurrencyLimit then
		return { Ok = false, Error = "DailyGiftLimitReached", Remaining = self:GetRemainingDailyCurrency(sender) }
	end

	local split = if self.Config.ApplyGiftTax
		then self.Tax:Split("PlayerGift", normalized)
		else { Ok = true, Gross = normalized, Tax = 0, Net = normalized, Rate = 0 }

	local debited, debitError = self.Currency:AdjustBalance(sender, self.Config.Currency, -normalized, {
		Reason = "GiftSent",
		CounterpartyUserId = recipient.UserId,
	})
	if not debited then
		return { Ok = false, Error = debitError }
	end

	local credited, creditError = self.Currency:AdjustBalance(recipient, self.Config.Currency, split.Net, {
		Reason = "GiftReceived",
		CounterpartyUserId = sender.UserId,
	})
	if not credited then
		self.Currency:AdjustBalance(sender, self.Config.Currency, normalized, { Reason = "GiftRollback" })
		return { Ok = false, Error = creditError }
	end

	activity.CurrencySent += normalized
	activity.LastGiftAt = os.time()
	self.Tax:Record(split.Tax)

	local result = {
		Ok = true,
		Kind = "Currency",
		Currency = self.Config.Currency,
		Gross = normalized,
		Tax = split.Tax,
		Received = split.Net,
		SenderUserId = sender.UserId,
		RecipientUserId = recipient.UserId,
	}
	self.Events:Publish("Gift.CurrencySent", result)
	return result
end

function GiftingService:GiftItem(sender, recipient, itemId, amount)
	local valid, validationError, detail = self:_validate(sender, recipient)
	if not valid then
		return { Ok = false, Error = validationError, Remaining = detail }
	end

	local normalized = math.floor(tonumber(amount) or 0)
	if not self.Config.AllowedItems[itemId] then
		return { Ok = false, Error = "ItemNotGiftable" }
	end
	if normalized <= 0 or normalized > self.Config.MaximumItemAmount then
		return { Ok = false, Error = "InvalidGiftAmount" }
	end
	if not self.Inventory:RemoveItem(sender, itemId, normalized) then
		return { Ok = false, Error = "NotEnoughItems" }
	end

	local accepted = self.Inventory:AddItem(recipient, itemId, normalized)
	if accepted < normalized then
		if accepted > 0 then
			self.Inventory:RemoveItem(recipient, itemId, accepted)
		end
		self.Inventory:AddItem(sender, itemId, normalized)
		return { Ok = false, Error = "RecipientStorageFull" }
	end

	detail.LastGiftAt = os.time()
	local result = {
		Ok = true,
		Kind = "Item",
		ItemId = itemId,
		Amount = normalized,
		SenderUserId = sender.UserId,
		RecipientUserId = recipient.UserId,
	}
	self.Events:Publish("Gift.ItemSent", result)
	return result
end

function GiftingService:ExportPlayer(player)
	return table.clone(self:_getActivity(player))
end

function GiftingService:ImportPlayer(player, state)
	if type(state) ~= "table" then
		return false
	end
	self._activity[player.UserId] = {
		DayKey = tostring(state.DayKey or os.date("!%Y-%j")),
		CurrencySent = math.max(0, math.floor(tonumber(state.CurrencySent) or 0)),
		LastGiftAt = math.max(0, math.floor(tonumber(state.LastGiftAt) or 0)),
	}
	return true
end

--[[
	Resumo em blocos:
	- Limites: cooldown, teto por presente e total diario reduzem abuso sem
	  misturar esta operacao com o fluxo bilateral de trade.
	- Transacao: moeda e item usam rollback quando o destinatario nao pode receber,
	  preservando os ativos do remetente.
	- Estado: atividade diaria pode ser exportada para impedir que reconectar
	  reinicie os limites do jogador.
]]

return GiftingService.new()
