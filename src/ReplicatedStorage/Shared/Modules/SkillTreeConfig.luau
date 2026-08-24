local SkillTreeConfig = {}

SkillTreeConfig.Skills = {
	CottonYield = {
		Id = "CottonYield",
		DisplayName = "Cotton Yield",
		Description = "+1 raw cotton from each harvest.",
		Cost = 75,
		Column = 1,
		Row = 1,
		IconId = "CottonYield",
		Accent = Color3.fromRGB(117, 185, 151),
		Prerequisites = {},
		Effects = {
			{
				Kind = "HarvestBonus",
				Value = 1,
			},
		},
	},
	CleanerFlow = {
		Id = "CleanerFlow",
		DisplayName = "Cleaner Flow",
		Description = "Cotton Cleaner runs 15% faster.",
		Cost = 160,
		Column = 2,
		Row = 1,
		IconId = "CleanerFlow",
		Accent = Color3.fromRGB(117, 170, 210),
		Prerequisites = {
			"CottonYield",
		},
		Effects = {
			{
				Kind = "MachineSpeed",
				TargetId = "Cleaner",
				Value = 0.15,
			},
		},
	},
	Threadcraft = {
		Id = "Threadcraft",
		DisplayName = "Threadcraft",
		Description = "Thread Spinner runs 15% faster.",
		Cost = 280,
		Column = 3,
		Row = 1,
		IconId = "Threadcraft",
		Accent = Color3.fromRGB(163, 139, 220),
		Prerequisites = {
			"CleanerFlow",
		},
		Effects = {
			{
				Kind = "MachineSpeed",
				TargetId = "Spinner",
				Value = 0.15,
			},
		},
	},
	LoomMastery = {
		Id = "LoomMastery",
		DisplayName = "Loom Mastery",
		Description = "Fabric Loom runs 12% faster.",
		Cost = 480,
		Column = 3,
		Row = 2,
		IconId = "LoomMastery",
		Accent = Color3.fromRGB(222, 174, 75),
		Prerequisites = {
			"Threadcraft",
		},
		Effects = {
			{
				Kind = "MachineSpeed",
				TargetId = "Loom",
				Value = 0.12,
			},
		},
	},
	StorageLogistics = {
		Id = "StorageLogistics",
		DisplayName = "Storage Logistics",
		Description = "All storage limits increase by 35%.",
		Cost = 360,
		Column = 1,
		Row = 2,
		IconId = "StorageLogistics",
		Accent = Color3.fromRGB(246, 176, 126),
		Prerequisites = {
			"CottonYield",
		},
		Effects = {
			{
				Kind = "StorageMultiplier",
				Value = 0.35,
			},
		},
	},
	MarketSense = {
		Id = "MarketSense",
		DisplayName = "Market Sense",
		Description = "Finished goods sell for 20% more.",
		Cost = 650,
		Column = 2,
		Row = 2,
		IconId = "MarketSense",
		Accent = Color3.fromRGB(239, 139, 139),
		Prerequisites = {
			"StorageLogistics",
			"LoomMastery",
		},
		Effects = {
			{
				Kind = "SaleMultiplier",
				Value = 0.2,
			},
		},
	},
}

SkillTreeConfig.Order = {
	"CottonYield",
	"CleanerFlow",
	"Threadcraft",
	"StorageLogistics",
	"MarketSense",
	"LoomMastery",
}

SkillTreeConfig.Connections = {
	{
		From = "CottonYield",
		To = "CleanerFlow",
	},
	{
		From = "CleanerFlow",
		To = "Threadcraft",
	},
	{
		From = "Threadcraft",
		To = "LoomMastery",
	},
	{
		From = "CottonYield",
		To = "StorageLogistics",
	},
	{
		From = "StorageLogistics",
		To = "MarketSense",
	},
	{
		From = "LoomMastery",
		To = "MarketSense",
	},
}

function SkillTreeConfig.GetSkill(skillId: string)
	return SkillTreeConfig.Skills[skillId]
end

function SkillTreeConfig.ArePrerequisitesUnlocked(unlockedSkills: { [string]: boolean }?, skillId: string)
	local skill = SkillTreeConfig.GetSkill(skillId)
	if not skill then
		return false
	end

	for _, prerequisiteId in skill.Prerequisites do
		if not unlockedSkills or not unlockedSkills[prerequisiteId] then
			return false
		end
	end

	return true
end

function SkillTreeConfig.GetUnlockedCount(unlockedSkills: { [string]: boolean }?)
	local count = 0

	for _, skillId in SkillTreeConfig.Order do
		if unlockedSkills and unlockedSkills[skillId] then
			count += 1
		end
	end

	return count
end

return SkillTreeConfig
