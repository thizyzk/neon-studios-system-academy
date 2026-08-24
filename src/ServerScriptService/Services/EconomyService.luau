local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local ItemConfig = require(ReplicatedStorage.Shared.Modules.ItemConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)
local InventoryService = require(ServerScriptService.Services.InventoryService)
local SkillTreeService = require(ServerScriptService.Services.SkillTreeService)

local EconomyService = {}

EconomyService.Remotes = nil
EconomyService.SellableItemOrder = {
	"CleanCotton",
	"CottonThread",
	"CottonFabric",
}

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local economyFolder = remotesFolder:FindFirstChild("Economy")
	if not economyFolder then
		economyFolder = Instance.new("Folder")
		economyFolder.Name = "Economy"
		economyFolder.Parent = remotesFolder
	end

	local sellProducts = economyFolder:FindFirstChild("SellProducts")
	if not sellProducts then
		sellProducts = Instance.new("RemoteFunction")
		sellProducts.Name = "SellProducts"
		sellProducts.Parent = economyFolder
	end

	return {
		SellProducts = sellProducts,
	}
end

function EconomyService:SellItem(player: Player, itemId: string, amount: number?)
	local item = ItemConfig.GetItem(itemId)
	if not item then
		return {
			Ok = false,
			Error = "ItemNotFound",
		}
	end

	local available = InventoryService:GetItemCount(player, itemId)
	local sellAmount = math.floor(amount or available)

	if sellAmount <= 0 or available < sellAmount then
		return {
			Ok = false,
			Error = "NotEnoughItems",
		}
	end

	if not InventoryService:RemoveItem(player, itemId, sellAmount) then
		return {
			Ok = false,
			Error = "NotEnoughItems",
		}
	end

	local payout = math.floor(item.BaseValue * sellAmount * SkillTreeService:GetSaleMultiplier(player))
	CurrencyExchangeService:AdjustBalance(player, "Cash", payout, {
		Reason = "ItemSale",
		Metadata = { ItemId = itemId, Amount = sellAmount },
	})

	return {
		Ok = true,
		ItemId = itemId,
		Amount = sellAmount,
		Payout = payout,
	}
end

function EconomyService:SellCleanCotton(player: Player)
	return self:SellItem(player, "CleanCotton")
end

function EconomyService:SellProducts(player: Player)
	local soldItems = {}
	local totalPayout = 0
	local totalAmount = 0

	for _, itemId in self.SellableItemOrder do
		local available = InventoryService:GetItemCount(player, itemId)
		if available > 0 then
			local result = self:SellItem(player, itemId, available)
			if result.Ok then
				soldItems[itemId] = {
					Amount = result.Amount,
					Payout = result.Payout,
				}
				totalAmount += result.Amount
				totalPayout += result.Payout
			end
		end
	end

	if totalAmount <= 0 then
		return {
			Ok = false,
			Error = "NoProducts",
		}
	end

	return {
		Ok = true,
		Amount = totalAmount,
		Payout = totalPayout,
		Items = soldItems,
	}
end

function EconomyService:Init()
	self.Remotes = getOrCreateRemotes()
	self.Remotes.SellProducts.OnServerInvoke = function(player, itemId, amount)
		if itemId then
			return self:SellItem(player, itemId, amount)
		end

		return self:SellProducts(player)
	end
end

return EconomyService
