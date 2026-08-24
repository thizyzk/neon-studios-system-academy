local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local MachineConfig = require(ReplicatedStorage.Shared.Modules.MachineConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)

local UpgradeService = {}

UpgradeService.PlayerUpgrades = {}
UpgradeService.Remotes = nil

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local upgradesFolder = remotesFolder:FindFirstChild("Upgrades")
	if not upgradesFolder then
		upgradesFolder = Instance.new("Folder")
		upgradesFolder.Name = "Upgrades"
		upgradesFolder.Parent = remotesFolder
	end

	local buyUpgrade = upgradesFolder:FindFirstChild("BuyUpgrade")
	if not buyUpgrade then
		buyUpgrade = Instance.new("RemoteFunction")
		buyUpgrade.Name = "BuyUpgrade"
		buyUpgrade.Parent = upgradesFolder
	end

	local getUpgrades = upgradesFolder:FindFirstChild("GetUpgrades")
	if not getUpgrades then
		getUpgrades = Instance.new("RemoteFunction")
		getUpgrades.Name = "GetUpgrades"
		getUpgrades.Parent = upgradesFolder
	end

	local upgradesUpdated = upgradesFolder:FindFirstChild("UpgradesUpdated")
	if not upgradesUpdated then
		upgradesUpdated = Instance.new("RemoteEvent")
		upgradesUpdated.Name = "UpgradesUpdated"
		upgradesUpdated.Parent = upgradesFolder
	end

	return {
		BuyUpgrade = buyUpgrade,
		GetUpgrades = getUpgrades,
		UpgradesUpdated = upgradesUpdated,
	}
end

function UpgradeService:_createUpgrades()
	local machineLevels = {}

	for _, machineId in MachineConfig.Order do
		machineLevels[machineId] = 1
	end

	return {
		MachineLevels = machineLevels,
	}
end

function UpgradeService:GetUpgrades(player: Player)
	local upgrades = self.PlayerUpgrades[player]
	if not upgrades then
		upgrades = self:_createUpgrades()
		self.PlayerUpgrades[player] = upgrades
	end

	return upgrades
end

function UpgradeService:GetMachineLevel(player: Player, machineId: string)
	local upgrades = self:GetUpgrades(player)

	return upgrades.MachineLevels[machineId] or 1
end

function UpgradeService:GetSnapshot(player: Player)
	local upgrades = self:GetUpgrades(player)
	local machineLevels = {}
	local nextCosts = {}

	for machineId, level in upgrades.MachineLevels do
		machineLevels[machineId] = level
		nextCosts[machineId] = MachineConfig.GetUpgradeCost(machineId, level)
	end

	return {
		MachineLevels = machineLevels,
		NextCosts = nextCosts,
	}
end

function UpgradeService:_notify(player: Player)
	if self.Remotes then
		self.Remotes.UpgradesUpdated:FireClient(player, self:GetSnapshot(player))
	end
end

function UpgradeService:BuyMachineUpgrade(player: Player, machineId: string)
	local machine = MachineConfig.GetMachine(machineId)
	if not machine then
		return {
			Ok = false,
			Error = "MachineNotFound",
		}
	end

	local currentLevel = self:GetMachineLevel(player, machineId)
	if currentLevel >= machine.MaxLevel then
		return {
			Ok = false,
			Error = "MaxLevel",
		}
	end

	local cost = MachineConfig.GetUpgradeCost(machineId, currentLevel)
	local cash = CurrencyExchangeService:GetBalance(player, "Cash") or 0

	if cash < cost then
		return {
			Ok = false,
			Error = "NotEnoughCash",
			Cost = cost,
		}
	end

	local debited = CurrencyExchangeService:AdjustBalance(player, "Cash", -cost, {
		Reason = "MachineUpgrade",
		ReferenceId = machineId,
	})
	if not debited then
		return {
			Ok = false,
			Error = "NotEnoughCash",
			Cost = cost,
		}
	end

	local upgrades = self:GetUpgrades(player)
	upgrades.MachineLevels[machineId] = currentLevel + 1
	self:_notify(player)

	return {
		Ok = true,
		Upgrade = self:GetSnapshot(player),
	}
end

function UpgradeService:Init()
	self.Remotes = getOrCreateRemotes()
	self.Remotes.BuyUpgrade.OnServerInvoke = function(player, upgradeType, targetId)
		if upgradeType ~= "Machine" then
			return {
				Ok = false,
				Error = "InvalidUpgradeType",
			}
		end

		return self:BuyMachineUpgrade(player, targetId)
	end
	self.Remotes.GetUpgrades.OnServerInvoke = function(player)
		return self:GetSnapshot(player)
	end
end

function UpgradeService:Start()
	for _, player in Players:GetPlayers() do
		self:GetUpgrades(player)
	end

	Players.PlayerAdded:Connect(function(player)
		self:GetUpgrades(player)
		self:_notify(player)
	end)

	Players.PlayerRemoving:Connect(function(player)
		self.PlayerUpgrades[player] = nil
	end)
end

return UpgradeService
