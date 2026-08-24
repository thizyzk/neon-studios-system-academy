local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local ItemConfig = require(ReplicatedStorage.Shared.Modules.ItemConfig)
local LeaderstatsService = require(ServerScriptService.Services.LeaderstatsService)
local SkillTreeService = require(ServerScriptService.Services.SkillTreeService)

local InventoryService = {}

InventoryService.PlayerInventories = {}
InventoryService.Remotes = nil

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local inventoryFolder = remotesFolder:FindFirstChild("Inventory")
	if not inventoryFolder then
		inventoryFolder = Instance.new("Folder")
		inventoryFolder.Name = "Inventory"
		inventoryFolder.Parent = remotesFolder
	end

	local getInventory = inventoryFolder:FindFirstChild("GetInventory")
	if not getInventory then
		getInventory = Instance.new("RemoteFunction")
		getInventory.Name = "GetInventory"
		getInventory.Parent = inventoryFolder
	end

	local inventoryUpdated = inventoryFolder:FindFirstChild("InventoryUpdated")
	if not inventoryUpdated then
		inventoryUpdated = Instance.new("RemoteEvent")
		inventoryUpdated.Name = "InventoryUpdated"
		inventoryUpdated.Parent = inventoryFolder
	end

	return {
		GetInventory = getInventory,
		InventoryUpdated = inventoryUpdated,
	}
end

function InventoryService:_createInventory()
	local items = {}

	for itemId in ItemConfig.Items do
		items[itemId] = 0
	end

	return {
		Items = items,
	}
end

function InventoryService:GetInventory(player: Player)
	local inventory = self.PlayerInventories[player]
	if not inventory then
		inventory = self:_createInventory()
		self.PlayerInventories[player] = inventory
	end

	return inventory
end

function InventoryService:GetItemCount(player: Player, itemId: string)
	local inventory = self:GetInventory(player)

	return inventory.Items[itemId] or 0
end

function InventoryService:GetSnapshot(player: Player)
	local inventory = self:GetInventory(player)
	local items = table.clone(inventory.Items)

	return {
		Items = items,
		Limits = self:GetLimitsSnapshot(player),
	}
end

function InventoryService:GetStorageLimit(player: Player?, itemId: string)
	local baseLimit = ItemConfig.GetStorageLimit(itemId)
	local multiplier = if player then SkillTreeService:GetStorageMultiplier(player) else 1

	return math.floor(baseLimit * multiplier)
end

function InventoryService:GetLimitsSnapshot(player: Player?)
	local limits = {}

	for itemId in ItemConfig.Items do
		limits[itemId] = self:GetStorageLimit(player, itemId)
	end

	return limits
end

function InventoryService:_notify(player: Player)
	if self.Remotes then
		self.Remotes.InventoryUpdated:FireClient(player, self:GetSnapshot(player))
	end
end

function InventoryService:_syncLeaderstats(player: Player)
	LeaderstatsService:SetCotton(player, self:GetItemCount(player, "RawCotton"))
end

function InventoryService:AddItem(player: Player, itemId: string, amount: number)
	local item = ItemConfig.GetItem(itemId)
	if not item or amount <= 0 then
		return 0
	end

	local inventory = self:GetInventory(player)
	local currentAmount = inventory.Items[itemId] or 0
	local limit = self:GetStorageLimit(player, itemId)
	local accepted = math.clamp(math.floor(amount), 0, math.max(0, limit - currentAmount))

	if accepted <= 0 then
		return 0
	end

	inventory.Items[itemId] = currentAmount + accepted
	self:_syncLeaderstats(player)
	self:_notify(player)

	return accepted
end

function InventoryService:RemoveItem(player: Player, itemId: string, amount: number)
	if amount <= 0 then
		return false
	end

	local inventory = self:GetInventory(player)
	local currentAmount = inventory.Items[itemId] or 0
	local roundedAmount = math.floor(amount)

	if currentAmount < roundedAmount then
		return false
	end

	inventory.Items[itemId] = currentAmount - roundedAmount
	self:_syncLeaderstats(player)
	self:_notify(player)

	return true
end

function InventoryService:Init()
	self.Remotes = getOrCreateRemotes()
	self.Remotes.GetInventory.OnServerInvoke = function(player)
		return self:GetSnapshot(player)
	end
end

function InventoryService:Start()
	for _, player in Players:GetPlayers() do
		self:GetInventory(player)
		self:_syncLeaderstats(player)
	end

	Players.PlayerAdded:Connect(function(player)
		self:GetInventory(player)
		self:_syncLeaderstats(player)
		self:_notify(player)
	end)

	Players.PlayerRemoving:Connect(function(player)
		self.PlayerInventories[player] = nil
	end)
end

return InventoryService
