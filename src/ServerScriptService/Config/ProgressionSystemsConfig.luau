--[[
	ProgressionSystemsConfig

	Proposito:
	Centraliza curva de nivel, faixas de prestigio, badges e titulos. O config
	mantem balanceamento e IDs de assets fora dos servicos de progressao.

	Exemplo de uso:
	local config = require(ServerScriptService.Config.ProgressionSystemsConfig)
	print(config.Leveling.MaximumLevel)
]]

local ProgressionSystemsConfig = {
	Leveling = {
		MaximumLevel = 100,
		BaseXP = 100,
		GrowthFactor = 1.2,
		LevelAttribute = "Level",
		XPAttribute = "XP",
	},

	PrestigeTier = {
		RebirthAttribute = "Rebirths",
		Tiers = {
			{ Id = "Starter", MinimumRebirths = 0, RewardMultiplier = 1 },
			{ Id = "Bronze", MinimumRebirths = 1, RewardMultiplier = 1.05 },
			{ Id = "Silver", MinimumRebirths = 5, RewardMultiplier = 1.12 },
			{ Id = "Gold", MinimumRebirths = 15, RewardMultiplier = 1.22 },
			{ Id = "Master", MinimumRebirths = 30, RewardMultiplier = 1.35 },
		},
	},

	Badge = {
		CacheSeconds = 60,
		Badges = {
			FirstHarvest = 0,
			FirstFabric = 0,
			FactoryMaster = 0,
		},
	},

	Title = {
		DefaultTitleId = "Rookie",
		PlayerAttribute = "EquippedTitle",
		Titles = {
			Rookie = { DisplayName = "Rookie", SortOrder = 1 },
			CottonFarmer = { DisplayName = "Cotton Farmer", SortOrder = 2 },
			FactoryOwner = { DisplayName = "Factory Owner", SortOrder = 3 },
			MarketMaster = { DisplayName = "Market Master", SortOrder = 4 },
		},
	},
}

--[[
	Resumo em blocos:
	- Nivel: curva e limite ficam ajustaveis sem alterar o loop de ganho de XP.
	- Prestigio: faixas leem rebirths existentes e nao executam outro reset.
	- Reconhecimento: badges usam IDs oficiais e titulos usam IDs internos
	  persistiveis, mantendo as duas formas de recompensa separadas.
]]

return ProgressionSystemsConfig
