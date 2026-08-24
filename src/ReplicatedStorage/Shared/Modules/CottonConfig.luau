local CottonConfig = {}

CottonConfig.DefaultCottonTypeId = "basic_cotton"

CottonConfig.Types = {
	basic_cotton = {
		Id = "basic_cotton",
		Name = "Basic Cotton",
		Description = "The first cotton planted in the factory plots.",
		GrowthTime = 30,
		QualityMin = 30,
		QualityMax = 70,
		BaseValue = 5,
		Color = Color3.fromRGB(245, 245, 235),
		UnlockLevel = 0,
	},
	silky_cotton = {
		Id = "silky_cotton",
		Name = "Silky Cotton",
		Description = "A softer cotton with better average quality.",
		GrowthTime = 45,
		QualityMin = 45,
		QualityMax = 82,
		BaseValue = 12,
		Color = Color3.fromRGB(232, 245, 255),
		UnlockLevel = 2,
	},
	golden_cotton = {
		Id = "golden_cotton",
		Name = "Golden Cotton",
		Description = "A rare cotton used for premium fabric later.",
		GrowthTime = 70,
		QualityMin = 60,
		QualityMax = 92,
		BaseValue = 28,
		Color = Color3.fromRGB(255, 221, 122),
		UnlockLevel = 5,
	},
}

CottonConfig.Rarities = {
	Common = {
		Name = "Common",
		Weight = 700,
		QualityBonus = 0,
		ValueMultiplier = 1,
		Color = Color3.fromRGB(220, 220, 220),
	},
	Uncommon = {
		Name = "Uncommon",
		Weight = 220,
		QualityBonus = 8,
		ValueMultiplier = 1.35,
		Color = Color3.fromRGB(100, 210, 120),
	},
	Rare = {
		Name = "Rare",
		Weight = 65,
		QualityBonus = 16,
		ValueMultiplier = 2,
		Color = Color3.fromRGB(90, 170, 255),
	},
	Epic = {
		Name = "Epic",
		Weight = 14,
		QualityBonus = 26,
		ValueMultiplier = 3.25,
		Color = Color3.fromRGB(180, 115, 255),
	},
	Legendary = {
		Name = "Legendary",
		Weight = 1,
		QualityBonus = 38,
		ValueMultiplier = 6,
		Color = Color3.fromRGB(255, 190, 80),
	},
}

CottonConfig.RarityOrder = {
	"Common",
	"Uncommon",
	"Rare",
	"Epic",
	"Legendary",
}

function CottonConfig.GetCottonType(cottonTypeId: string?)
	return CottonConfig.Types[cottonTypeId or CottonConfig.DefaultCottonTypeId]
		or CottonConfig.Types[CottonConfig.DefaultCottonTypeId]
end

function CottonConfig.GetRarity(rarityName: string?)
	return CottonConfig.Rarities[rarityName or "Common"] or CottonConfig.Rarities.Common
end

function CottonConfig.RollRarity(random: Random?)
	local rng = random or Random.new()
	local totalWeight = 0

	for _, rarityName in CottonConfig.RarityOrder do
		totalWeight += CottonConfig.Rarities[rarityName].Weight
	end

	local roll = rng:NextNumber(0, totalWeight)
	local cursor = 0

	for _, rarityName in CottonConfig.RarityOrder do
		cursor += CottonConfig.Rarities[rarityName].Weight
		if roll <= cursor then
			return rarityName
		end
	end

	return "Common"
end

function CottonConfig.RollQuality(cottonTypeId: string?, rarityName: string?, random: Random?)
	local rng = random or Random.new()
	local cottonType = CottonConfig.GetCottonType(cottonTypeId)
	local rarity = CottonConfig.GetRarity(rarityName)
	local baseQuality = rng:NextInteger(cottonType.QualityMin, cottonType.QualityMax)

	return math.clamp(baseQuality + rarity.QualityBonus, 1, 100)
end

function CottonConfig.GetGrowthTime(cottonTypeId: string?, growthMultiplier: number?)
	local cottonType = CottonConfig.GetCottonType(cottonTypeId)
	local multiplier = growthMultiplier or 1

	return math.max(1, math.floor(cottonType.GrowthTime / multiplier))
end

function CottonConfig.GetCottonValue(cottonTypeId: string?, rarityName: string?, quality: number?)
	local cottonType = CottonConfig.GetCottonType(cottonTypeId)
	local rarity = CottonConfig.GetRarity(rarityName)
	local qualityMultiplier = 1 + ((quality or 50) / 100)

	return math.floor(cottonType.BaseValue * rarity.ValueMultiplier * qualityMultiplier)
end

return CottonConfig
