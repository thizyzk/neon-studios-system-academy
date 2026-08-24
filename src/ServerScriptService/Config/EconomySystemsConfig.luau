--[[
	EconomySystemsConfig

	Proposito:
	Centraliza parametros dos sistemas economicos adicionais. Os servicos usam
	estas tabelas como regras de dominio, mantendo numeros de balanceamento fora
	da implementacao e permitindo ajustes sem alterar os fluxos transacionais.

	Exemplo de uso:
	local config = require(ServerScriptService.Config.EconomySystemsConfig)
	print(config.Bank.InterestRatePerHour)
]]

local EconomySystemsConfig = {
	CurrencyExchange = {
		DefaultCurrency = "Cash",
		CurrencyAttributes = {
			Gems = "Currency_Gems",
			Tokens = "Currency_Tokens",
		},
		Rates = {
			Cash = {
				Gems = 0.01,
			},
			Gems = {
				Cash = 90,
				Tokens = 2,
			},
			Tokens = {
				Gems = 0.4,
			},
		},
		FeeRate = 0.02,
		MinimumInput = 1,
	},

	Tax = {
		DefaultRate = 0,
		Rates = {
			AuctionSale = 0.05,
			BankInterest = 0.02,
			PlayerGift = 0,
		},
		MaximumRate = 0.5,
	},

	AuctionHouse = {
		Currency = "Cash",
		MinimumBid = 10,
		MinimumIncrementRate = 0.05,
		MinimumDuration = 60,
		MaximumDuration = 86400,
		MaxActiveListingsPerPlayer = 5,
		SettlementInterval = 5,
	},

	Bank = {
		Currency = "Cash",
		MinimumTransaction = 1,
		MaximumBalance = 1000000000,
		InterestRatePerHour = 0.001,
		MaximumOfflineHours = 24,
	},

	Loan = {
		Currency = "Cash",
		MinimumPrincipal = 100,
		MaximumPrincipal = 100000,
		InterestRatePerHour = 0.005,
		MaximumDurationHours = 72,
		MaximumOpenLoans = 1,
	},

	MarketPriceFluctuation = {
		UpdateInterval = 300,
		MaximumStep = 0.08,
		MinimumMultiplier = 0.65,
		MaximumMultiplier = 1.5,
		ReversionStrength = 0.15,
		Items = {
			CleanCotton = 10,
			CottonThread = 20,
			CottonFabric = 42,
		},
	},

	CraftingCostCalculator = {
		Recipes = {
			CottonThread = {
				Inputs = { CleanCotton = 2 },
				CurrencyCosts = { Cash = 1 },
			},
			CottonFabric = {
				Inputs = { CottonThread = 3 },
				CurrencyCosts = { Cash = 4 },
			},
		},
	},

	ResourceGathering = {
		NodeTag = "GatherableResource",
		MaximumDistance = 18,
		Resources = {},
	},

	SellAll = {
		Profiles = {
			Default = {
				DelegateToExisting = true,
				ItemIds = { "CleanCotton", "CottonThread", "CottonFabric" },
				KeepAmounts = {},
			},
		},
	},

	Discount = {
		MaximumTotalDiscount = 0.75,
		StackMode = "Multiplicative",
		Discounts = {
			Welcome = {
				Rate = 0.1,
				Scopes = { "Shop" },
			},
			VIP = {
				Rate = 0.15,
				Scopes = { "Shop", "Crafting" },
			},
		},
	},

	Gifting = {
		Currency = "Cash",
		MinimumCurrencyAmount = 10,
		MaximumCurrencyAmount = 10000,
		DailyCurrencyLimit = 25000,
		CooldownSeconds = 5,
		MaximumItemAmount = 25,
		AllowedItems = {
			CleanCotton = true,
			CottonThread = true,
			CottonFabric = true,
		},
		ApplyGiftTax = true,
	},

	WalletHistory = {
		MaximumEntriesPerPlayer = 200,
		DefaultPageSize = 25,
		MaximumPageSize = 50,
	},

	VIPBenefits = {
		PlayerAttribute = "IsVIP",
		Benefits = {
			SaleMultiplier = 1.15,
			GatherMultiplier = 1.1,
			BankInterestMultiplier = 1.1,
			DiscountIds = { "VIP" },
		},
	},

	Subscription = {
		RenewalGraceSeconds = 3600,
		Plans = {
			CottonClub = {
				DurationSeconds = 30 * 24 * 60 * 60,
				Benefits = {
					DailyTokens = 5,
					DiscountIds = { "VIP" },
				},
			},
		},
	},

	Refund = {
		RequestWindowSeconds = 7 * 24 * 60 * 60,
		MaximumPendingPerPlayer = 3,
		AllowedTransactionTypes = {
			CurrencyPurchase = true,
			ItemPurchase = true,
			Gift = true,
		},
	},
}

--[[
	Resumo em blocos:
	- Transacoes: moedas, impostos, leilao, banco e emprestimos compartilham
	  limites coerentes sem esconder numeros dentro dos servicos.
	- Producao: mercado, crafting, coleta e venda recebem regras independentes,
	  facilitando ativar apenas os recursos que o jogo realmente usar.
	- Promocoes: descontos possuem escopo e teto para impedir precos negativos
	  ou combinacoes acidentais de beneficios.
]]

return EconomySystemsConfig
