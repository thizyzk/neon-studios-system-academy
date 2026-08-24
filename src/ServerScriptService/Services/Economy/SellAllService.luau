--[[
	SellAllService

	Proposito:
	Oferece perfis configuraveis para venda em massa. Como EconomyService ja
	possui SellProducts, o perfil padrao apenas delega a ele; este modulo existe
	para adicionar reservas e selecoes sem duplicar a regra de pagamento.

	Exemplo de uso:
	local SellAll = require(ServerScriptService.Services.Economy.SellAllService)
	local preview = SellAll:Preview(player, "Default")
	local result = SellAll:Sell(player, "Default")
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local EconomyService = require(ServerScriptService.Services.EconomyService)
local InventoryService = require(ServerScriptService.Services.InventoryService)
local ItemConfig = require(ReplicatedStorage.Shared.Modules.ItemConfig)

local SellAllService = {}
SellAllService.__index = SellAllService

function SellAllService.new(config, dependencies)
	local self = setmetatable({}, SellAllService)
	local deps = dependencies or {}

	self.Config = config or EconomyConfig.SellAll
	self.Economy = deps.Economy or EconomyService
	self.Inventory = deps.Inventory or InventoryService

	return self
end

function SellAllService:_getProfile(profileId)
	return self.Config.Profiles[profileId or "Default"]
end

function SellAllService:Preview(player, profileId)
	local profile = self:_getProfile(profileId)
	if not profile then
		return { Ok = false, Error = "ProfileNotFound" }
	end

	local items = {}
	local totalAmount = 0
	local baseValue = 0

	for _, itemId in profile.ItemIds do
		local available = self.Inventory:GetItemCount(player, itemId)
		local keep = math.max(0, math.floor(profile.KeepAmounts[itemId] or 0))
		local amount = math.max(0, available - keep)
		local item = ItemConfig.GetItem(itemId)

		if amount > 0 and item then
			items[itemId] = amount
			totalAmount += amount
			baseValue += item.BaseValue * amount
		end
	end

	return {
		Ok = totalAmount > 0,
		Error = if totalAmount > 0 then nil else "NoProducts",
		Items = items,
		Amount = totalAmount,
		BaseValue = baseValue,
	}
end

function SellAllService:Sell(player, profileId)
	local profile = self:_getProfile(profileId)
	if not profile then
		return { Ok = false, Error = "ProfileNotFound" }
	end

	-- O perfil padrao coincide com o SellProducts atual. Delegar mantem
	-- multiplicadores e futuras correcoes concentrados no EconomyService.
	if profile.DelegateToExisting then
		return self.Economy:SellProducts(player)
	end

	local preview = self:Preview(player, profileId)
	if not preview.Ok then
		return preview
	end

	local soldItems = {}
	local totalPayout = 0
	local totalAmount = 0
	for itemId, amount in preview.Items do
		local result = self.Economy:SellItem(player, itemId, amount)
		if result.Ok then
			soldItems[itemId] = { Amount = result.Amount, Payout = result.Payout }
			totalAmount += result.Amount
			totalPayout += result.Payout
		end
	end

	return {
		Ok = totalAmount > 0,
		Error = if totalAmount > 0 then nil else "NoProducts",
		Items = soldItems,
		Amount = totalAmount,
		Payout = totalPayout,
	}
end

--[[
	Resumo em blocos:
	- Perfis: definem itens e quantidades reservadas para permitir modos como
	  vender excedentes ou somente produtos finais.
	- Preview: consulta o inventario sem mutacao e fornece dados para confirmacao
	  na UI; o valor e base porque multiplicadores pertencem a economia.
	- Venda: delega ao servico existente item a item ou por SellProducts, evitando
	  repetir remocao, multiplicador e credito de Cash.
]]

return SellAllService.new()
