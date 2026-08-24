local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local SkillTreeConfig = require(ReplicatedStorage.Shared.Modules.SkillTreeConfig)
local CurrencyExchangeService = require(ServerScriptService.Services.Economy.CurrencyExchangeService)

local SkillTreeService = {}

SkillTreeService.PlayerTrees = {}
SkillTreeService.Remotes = nil

local function getOrCreateRemotes()
	local remotesFolder = ReplicatedStorage:FindFirstChild("Remotes")
	if not remotesFolder then
		remotesFolder = Instance.new("Folder")
		remotesFolder.Name = "Remotes"
		remotesFolder.Parent = ReplicatedStorage
	end

	local skillsFolder = remotesFolder:FindFirstChild("Skills")
	if not skillsFolder then
		skillsFolder = Instance.new("Folder")
		skillsFolder.Name = "Skills"
		skillsFolder.Parent = remotesFolder
	end

	local buySkill = skillsFolder:FindFirstChild("BuySkill")
	if not buySkill then
		buySkill = Instance.new("RemoteFunction")
		buySkill.Name = "BuySkill"
		buySkill.Parent = skillsFolder
	end

	local getSkillTree = skillsFolder:FindFirstChild("GetSkillTree")
	if not getSkillTree then
		getSkillTree = Instance.new("RemoteFunction")
		getSkillTree.Name = "GetSkillTree"
		getSkillTree.Parent = skillsFolder
	end

	local skillsUpdated = skillsFolder:FindFirstChild("SkillsUpdated")
	if not skillsUpdated then
		skillsUpdated = Instance.new("RemoteEvent")
		skillsUpdated.Name = "SkillsUpdated"
		skillsUpdated.Parent = skillsFolder
	end

	return {
		BuySkill = buySkill,
		GetSkillTree = getSkillTree,
		SkillsUpdated = skillsUpdated,
	}
end

function SkillTreeService:_createTree()
	return {
		Unlocked = {},
	}
end

function SkillTreeService:GetTree(player: Player)
	local tree = self.PlayerTrees[player]
	if not tree then
		tree = self:_createTree()
		self.PlayerTrees[player] = tree
	end

	return tree
end

function SkillTreeService:IsSkillUnlocked(player: Player, skillId: string)
	local tree = self:GetTree(player)

	return tree.Unlocked[skillId] == true
end

function SkillTreeService:GetSnapshot(player: Player)
	local tree = self:GetTree(player)
	local unlocked = {}

	for _, skillId in SkillTreeConfig.Order do
		unlocked[skillId] = tree.Unlocked[skillId] == true
	end

	return {
		Unlocked = unlocked,
		UnlockedCount = SkillTreeConfig.GetUnlockedCount(unlocked),
		TotalCount = #SkillTreeConfig.Order,
	}
end

function SkillTreeService:_notify(player: Player)
	if self.Remotes then
		self.Remotes.SkillsUpdated:FireClient(player, self:GetSnapshot(player))
	end
end

function SkillTreeService:BuySkill(player: Player, skillId: string)
	local skill = SkillTreeConfig.GetSkill(skillId)
	if not skill then
		return {
			Ok = false,
			Error = "SkillNotFound",
		}
	end

	local tree = self:GetTree(player)
	if tree.Unlocked[skillId] then
		return {
			Ok = false,
			Error = "AlreadyUnlocked",
			SkillTree = self:GetSnapshot(player),
		}
	end

	if not SkillTreeConfig.ArePrerequisitesUnlocked(tree.Unlocked, skillId) then
		return {
			Ok = false,
			Error = "MissingPrerequisite",
			SkillTree = self:GetSnapshot(player),
		}
	end

	local cash = CurrencyExchangeService:GetBalance(player, "Cash") or 0
	if cash < skill.Cost then
		return {
			Ok = false,
			Error = "NotEnoughCash",
			Cost = skill.Cost,
			SkillTree = self:GetSnapshot(player),
		}
	end

	local debited = CurrencyExchangeService:AdjustBalance(player, "Cash", -skill.Cost, {
		Reason = "SkillPurchase",
		ReferenceId = skillId,
	})
	if not debited then
		return {
			Ok = false,
			Error = "NotEnoughCash",
			Cost = skill.Cost,
			SkillTree = self:GetSnapshot(player),
		}
	end
	tree.Unlocked[skillId] = true
	self:_notify(player)

	return {
		Ok = true,
		SkillId = skillId,
		SkillTree = self:GetSnapshot(player),
	}
end

function SkillTreeService:GetEffectValue(player: Player, effectKind: string, targetId: string?)
	local tree = self:GetTree(player)
	local value = 0

	for _, skillId in SkillTreeConfig.Order do
		if tree.Unlocked[skillId] then
			local skill = SkillTreeConfig.GetSkill(skillId)
			for _, effect in skill.Effects do
				if effect.Kind == effectKind and (effect.TargetId == nil or effect.TargetId == targetId) then
					value += effect.Value
				end
			end
		end
	end

	return value
end

function SkillTreeService:GetHarvestAmount(player: Player)
	return 1 + self:GetEffectValue(player, "HarvestBonus")
end

function SkillTreeService:GetMachineSpeedMultiplier(player: Player, machineId: string)
	return 1 + self:GetEffectValue(player, "MachineSpeed", machineId)
end

function SkillTreeService:GetSaleMultiplier(player: Player)
	return 1 + self:GetEffectValue(player, "SaleMultiplier")
end

function SkillTreeService:GetStorageMultiplier(player: Player)
	return 1 + self:GetEffectValue(player, "StorageMultiplier")
end

function SkillTreeService:Init()
	self.Remotes = getOrCreateRemotes()
	self.Remotes.BuySkill.OnServerInvoke = function(player, skillId)
		return self:BuySkill(player, skillId)
	end
	self.Remotes.GetSkillTree.OnServerInvoke = function(player)
		return self:GetSnapshot(player)
	end
end

function SkillTreeService:Start()
	for _, player in Players:GetPlayers() do
		self:GetTree(player)
	end

	Players.PlayerAdded:Connect(function(player)
		self:GetTree(player)
		self:_notify(player)
	end)

	Players.PlayerRemoving:Connect(function(player)
		self.PlayerTrees[player] = nil
	end)
end

return SkillTreeService
