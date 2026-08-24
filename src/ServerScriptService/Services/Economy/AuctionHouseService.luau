--[[
	AuctionHouseService

	Proposito:
	Mantem leiloes de itens em memoria com custodia, lances reservados e acerto
	tributado. O inventario e o sistema de moedas existentes continuam sendo as
	fontes de verdade para itens e saldo.

	Exemplo de uso:
	local Auctions = require(ServerScriptService.Services.Economy.AuctionHouseService)
	local listing = Auctions:CreateListing(player, "CottonFabric", 5, 100, 600)
	Auctions:PlaceBid(otherPlayer, listing.Listing.Id, 120)
]]

local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")

local EconomyConfig = require(ServerScriptService.Config.EconomySystemsConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)
local EventBus = require(ServerScriptService.Services.Core.EventBus)
local InventoryService = require(ServerScriptService.Services.InventoryService)
local TaxService = require(ServerScriptService.Services.Economy.TaxService)

local AuctionHouseService = {}
AuctionHouseService.__index = AuctionHouseService

local function snapshot(listing)
	return {
		Id = listing.Id,
		SellerUserId = listing.SellerUserId,
		ItemId = listing.ItemId,
		Amount = listing.Amount,
		StartingBid = listing.StartingBid,
		HighestBid = listing.HighestBid,
		HighestBidderUserId = listing.HighestBidderUserId,
		CreatedAt = listing.CreatedAt,
		EndsAt = listing.EndsAt,
		State = listing.State,
	}
end

function AuctionHouseService.new(config, dependencies)
	local self = setmetatable({}, AuctionHouseService)
	local deps = dependencies or {}

	self.Config = config or EconomyConfig.AuctionHouse
	self.Currency = deps.Currency or CurrencyExchangeService
	self.Inventory = deps.Inventory or InventoryService
	self.Tax = deps.Tax or TaxService
	self.Events = deps.Events or EventBus
	self._listings = {}
	self._activeBySeller = {}
	self._running = false

	return self
end


function AuctionHouseService:_changeSellerCount(userId, delta)
	self._activeBySeller[userId] = math.max(0, (self._activeBySeller[userId] or 0) + delta)
end

function AuctionHouseService:CreateListing(player, itemId, amount, startingBid, duration)
	local normalizedAmount = math.floor(tonumber(amount) or 0)
	local normalizedBid = math.floor(tonumber(startingBid) or 0)
	local normalizedDuration = math.floor(tonumber(duration) or 0)
	local userId = player.UserId

	if normalizedAmount <= 0 or normalizedBid < self.Config.MinimumBid then
		return { Ok = false, Error = "InvalidListing" }
	end

	if normalizedDuration < self.Config.MinimumDuration or normalizedDuration > self.Config.MaximumDuration then
		return { Ok = false, Error = "InvalidDuration" }
	end

	if (self._activeBySeller[userId] or 0) >= self.Config.MaxActiveListingsPerPlayer then
		return { Ok = false, Error = "ListingLimitReached" }
	end

	-- O item sai do inventario na criacao para que nao possa ser vendido ou
	-- transferido enquanto o leilao estiver ativo.
	if not self.Inventory:RemoveItem(player, itemId, normalizedAmount) then
		return { Ok = false, Error = "NotEnoughItems" }
	end

	local now = os.time()
	local listing = {
		Id = HttpService:GenerateGUID(false),
		Seller = player,
		SellerUserId = userId,
		ItemId = itemId,
		Amount = normalizedAmount,
		StartingBid = normalizedBid,
		HighestBid = 0,
		HighestBidder = nil,
		HighestBidderUserId = nil,
		CreatedAt = now,
		EndsAt = now + normalizedDuration,
		State = "Active",
	}

	self._listings[listing.Id] = listing
	self:_changeSellerCount(userId, 1)
	self.Events:Publish("Auction.Listed", snapshot(listing))

	return { Ok = true, Listing = snapshot(listing) }
end

function AuctionHouseService:GetMinimumBid(listing)
	if listing.HighestBid <= 0 then
		return listing.StartingBid
	end

	local increment = math.max(1, math.ceil(listing.HighestBid * self.Config.MinimumIncrementRate))
	return listing.HighestBid + increment
end

function AuctionHouseService:PlaceBid(player, listingId, amount)
	local listing = self._listings[listingId]
	local bid = math.floor(tonumber(amount) or 0)

	if not listing or listing.State ~= "Active" then
		return { Ok = false, Error = "ListingNotActive" }
	end
	if os.time() >= listing.EndsAt then
		self:Settle(listingId)
		return { Ok = false, Error = "ListingEnded" }
	end
	if listing.SellerUserId == player.UserId then
		return { Ok = false, Error = "SellerCannotBid" }
	end
	if bid < self:GetMinimumBid(listing) then
		return { Ok = false, Error = "BidTooLow", MinimumBid = self:GetMinimumBid(listing) }
	end

	local debited, debitError = self.Currency:AdjustBalance(player, self.Config.Currency, -bid, {
		Reason = "AuctionBidReserved",
		ReferenceId = listing.Id,
	})
	if not debited then
		return { Ok = false, Error = debitError }
	end

	-- O lance anterior ja estava reservado; a troca devolve esse valor antes de
	-- registrar o novo vencedor provisiorio.
	if listing.HighestBidder then
		self.Currency:AdjustBalance(listing.HighestBidder, self.Config.Currency, listing.HighestBid, {
			Reason = "AuctionBidRefunded",
			ReferenceId = listing.Id,
		})
	end

	listing.HighestBid = bid
	listing.HighestBidder = player
	listing.HighestBidderUserId = player.UserId
	self.Events:Publish("Auction.BidPlaced", snapshot(listing))

	return { Ok = true, Listing = snapshot(listing) }
end

function AuctionHouseService:_finishSale(listing)
	local accepted = self.Inventory:AddItem(listing.HighestBidder, listing.ItemId, listing.Amount)
	if accepted < listing.Amount then
		if accepted > 0 then
			self.Inventory:RemoveItem(listing.HighestBidder, listing.ItemId, accepted)
		end
		listing.State = "AwaitingClaim"
		return { Ok = false, Error = "WinnerStorageFull", Listing = snapshot(listing) }
	end

	local split = self.Tax:Split("AuctionSale", listing.HighestBid)
	self.Currency:AdjustBalance(listing.Seller, self.Config.Currency, split.Net, {
		Reason = "AuctionSalePayout",
		ReferenceId = listing.Id,
	})
	self.Tax:Record(split.Tax)
	listing.State = "Sold"
	self:_changeSellerCount(listing.SellerUserId, -1)
	self.Events:Publish("Auction.Sold", snapshot(listing), split)

	return { Ok = true, Listing = snapshot(listing), Settlement = split }
end

function AuctionHouseService:Settle(listingId)
	local listing = self._listings[listingId]
	if not listing or listing.State ~= "Active" then
		return { Ok = false, Error = "ListingNotActive" }
	end
	if os.time() < listing.EndsAt then
		return { Ok = false, Error = "ListingStillActive" }
	end

	if listing.HighestBidder then
		return self:_finishSale(listing)
	end

	local accepted = self.Inventory:AddItem(listing.Seller, listing.ItemId, listing.Amount)
	if accepted < listing.Amount then
		if accepted > 0 then
			self.Inventory:RemoveItem(listing.Seller, listing.ItemId, accepted)
		end
		return { Ok = false, Error = "SellerStorageFull" }
	end

	listing.State = "Expired"
	self:_changeSellerCount(listing.SellerUserId, -1)
	self.Events:Publish("Auction.Expired", snapshot(listing))
	return { Ok = true, Listing = snapshot(listing) }
end

function AuctionHouseService:ClaimWonItem(player, listingId)
	local listing = self._listings[listingId]
	if not listing or listing.State ~= "AwaitingClaim" or listing.HighestBidder ~= player then
		return { Ok = false, Error = "NothingToClaim" }
	end

	return self:_finishSale(listing)
end

function AuctionHouseService:CancelListing(player, listingId)
	local listing = self._listings[listingId]
	if not listing or listing.State ~= "Active" or listing.Seller ~= player then
		return { Ok = false, Error = "CannotCancel" }
	end
	if listing.HighestBidder then
		return { Ok = false, Error = "ListingHasBid" }
	end

	local accepted = self.Inventory:AddItem(player, listing.ItemId, listing.Amount)
	if accepted < listing.Amount then
		if accepted > 0 then
			self.Inventory:RemoveItem(player, listing.ItemId, accepted)
		end
		return { Ok = false, Error = "SellerStorageFull" }
	end

	listing.State = "Cancelled"
	self:_changeSellerCount(listing.SellerUserId, -1)
	self.Events:Publish("Auction.Cancelled", snapshot(listing))
	return { Ok = true, Listing = snapshot(listing) }
end

function AuctionHouseService:GetListing(listingId)
	local listing = self._listings[listingId]
	return if listing then snapshot(listing) else nil
end

function AuctionHouseService:GetActiveListings()
	local result = {}
	for _, listing in self._listings do
		if listing.State == "Active" or listing.State == "AwaitingClaim" then
			table.insert(result, snapshot(listing))
		end
	end
	return result
end

function AuctionHouseService:Start()
	self._running = true
	task.spawn(function()
		while self._running do
			task.wait(self.Config.SettlementInterval)
			local now = os.time()
			for listingId, listing in self._listings do
				if listing.State == "Active" and now >= listing.EndsAt then
					self:Settle(listingId)
				end
			end
		end
	end)
end

function AuctionHouseService:Destroy()
	self._running = false
end

--[[
	Resumo em blocos:
	- Custodia: remove o item ao listar e reserva o saldo ao dar lance, fechando
	  as duas formas mais comuns de duplicacao em leiloes.
	- Acerto: entrega o item antes de pagar o vendedor; inventario cheio vira uma
	  reivindicacao pendente e nao perde item nem dinheiro.
	- Integracao: inventario, moedas, imposto e eventos sao dependencias
	  injetaveis, permitindo testes e futuras trocas sem reescrever o dominio.
]]

return AuctionHouseService.new()
