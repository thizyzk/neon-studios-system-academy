-- Catalogo declarativo dos 50 sistemas de integracao.
-- A factory fornece o mecanismo; este arquivo define contratos e dependencias.

local IntegrationSystemsConfig = {
	Services = {},
}

local function define(name, tier, mode, dependencies, operations)
	IntegrationSystemsConfig.Services[name] = {
		Name = name,
		Tier = tier,
		Mode = mode,
		Enabled = true,
		Dependencies = dependencies,
		Operations = operations,
	}
end

define("NotificationService", "Basico", "State", { "RemoteRegistry" }, {
	Send = "Execute",
	GetInbox = "GetState",
	ClearInbox = "ClearState",
})

define("CooldownService", "Basico", "State", { "EventBus" }, {
	Check = "Evaluate",
	StartCooldown = "Execute",
	GetCooldowns = "GetState",
	ClearCooldown = "ClearState",
})

define("PlayerSessionService", "Basico", "State", { "PlayerDataService" }, {
	OpenSession = "Execute",
	GetSession = "GetState",
	CloseSession = "ClearState",
})

define("AttributeSyncService", "Basico", "State", { "PlayerDataService" }, {
	Sync = "Execute",
	GetSnapshot = "GetState",
	ClearSnapshot = "ClearState",
})

define("TagService", "Basico", "Policy", { "EventBus" }, {
	AddTag = "Execute",
	RemoveTag = "Execute",
	HasTag = "Evaluate",
})

define("RewardService", "Basico", "Pipeline", { "CurrencyExchangeService", "InventoryService" }, {
	Grant = "Execute",
	Preview = "Execute",
})

define("CheckpointService", "Basico", "State", { "PlayerDataService" }, {
	Reach = "Execute",
	GetCheckpoint = "GetState",
	ResetCheckpoint = "ClearState",
})

define("SpawnProtectionService", "Basico", "Policy", { "EventBus" }, {
	Protect = "Execute",
	IsProtected = "Evaluate",
	RemoveProtection = "Execute",
})

define("DailyRewardService", "Basico", "State", { "RewardService", "PlayerDataService" }, {
	Claim = "Execute",
	GetCalendar = "GetState",
	ResetCalendar = "ClearState",
})

define("PlaytimeService", "Basico", "State", { "PlayerSessionService" }, {
	AddTime = "Execute",
	GetPlaytime = "GetState",
	ResetPlaytime = "ClearState",
})

define("SettingsService", "Basico", "State", { "PlayerDataService" }, {
	SetSetting = "Execute",
	GetSettings = "GetState",
	ResetSettings = "ClearState",
})

define("TutorialService", "Basico", "State", { "PlayerDataService", "AnalyticsService" }, {
	CompleteStep = "Execute",
	GetProgress = "GetState",
	ResetTutorial = "ClearState",
})

define("QuestService", "Basico", "State", { "RewardService", "EventBus" }, {
	Accept = "Execute",
	Advance = "Execute",
	GetQuests = "GetState",
	Abandon = "Execute",
})

define("InternalAchievementService", "Basico", "State", { "PlayerDataService", "RewardService" }, {
	Unlock = "Execute",
	GetAchievements = "GetState",
	ResetAchievements = "ClearState",
})

define("InteractionService", "Basico", "Policy", { "EventBus" }, {
	ValidateInteraction = "Evaluate",
	ExecuteInteraction = "Execute",
})

define("ItemCatalogService", "Basico", "Registry", { "ConfigLoader" }, {
	RegisterItem = "CreateRecord",
	GetItem = "GetRecord",
	ListItems = "ListRecords",
})

define("PriceService", "Basico", "Policy", { "DiscountService", "TaxService" }, {
	Quote = "Execute",
	ValidatePrice = "Evaluate",
})

define("TransactionService", "Intermediario", "Pipeline", { "EventBus", "WalletHistoryService" }, {
	Run = "Execute",
	GetTransaction = "GetRecord",
	ListTransactions = "ListRecords",
})

define("ReceiptProcessingService", "Intermediario", "Pipeline", { "TransactionService", "PlayerDataService" }, {
	Process = "Execute",
	HasProcessed = "Evaluate",
	GetReceipt = "GetRecord",
})

define("GamePassEntitlementService", "Intermediario", "State", { "VIPBenefitsService" }, {
	Refresh = "Execute",
	HasEntitlement = "Evaluate",
	GetEntitlements = "GetState",
})

define("TradeService", "Intermediario", "Registry", { "TransactionService", "InventoryService" }, {
	CreateTrade = "CreateRecord",
	Accept = "Execute",
	Cancel = "RemoveRecord",
	GetTrade = "GetRecord",
})

define("MailboxService", "Intermediario", "State", { "PlayerDataService", "NotificationService" }, {
	SendMail = "Execute",
	GetMailbox = "GetState",
	ClaimAttachment = "Execute",
})

define("RewardInboxService", "Intermediario", "State", { "RewardService", "PlayerDataService" }, {
	PushReward = "Execute",
	ClaimReward = "Execute",
	GetRewards = "GetState",
})

define("CraftingService", "Intermediario", "Pipeline", { "RecipeService", "InventoryService", "TransactionService" }, {
	Craft = "Execute",
	PreviewCraft = "Execute",
})

define("RecipeService", "Intermediario", "Registry", { "ItemCatalogService" }, {
	RegisterRecipe = "CreateRecord",
	GetRecipe = "GetRecord",
	ListRecipes = "ListRecords",
})

define("ProductionQueueService", "Intermediario", "Queue", { "MachineService", "EventBus" }, {
	EnqueueJob = "Enqueue",
	DequeueJob = "Dequeue",
	PeekJob = "Peek",
	GetQueueSize = "GetQueueSize",
})

define("MachinePlacementService", "Intermediario", "Pipeline", { "PlotService", "ObjectStoreService" }, {
	Place = "Execute",
	Move = "Execute",
	Remove = "Execute",
})

define("ObjectStoreService", "Intermediario", "Registry", { "PlayerDataService" }, {
	SaveObject = "CreateRecord",
	GetObject = "GetRecord",
	UpdateObject = "UpdateRecord",
	RemoveObject = "RemoveRecord",
})

define("LeaderboardService", "Intermediario", "Registry", { "PlayerDataService" }, {
	Submit = "Execute",
	GetBoard = "ListRecords",
})

define("AnalyticsService", "Intermediario", "Pipeline", { "EnvironmentDetector" }, {
	Track = "Execute",
	GetAnalyticsMetrics = "GetMetrics",
})

define("EconomyAuditService", "Intermediario", "Registry", { "WalletHistoryService", "TransactionService" }, {
	RecordAudit = "Execute",
	QueryAudits = "ListRecords",
})

define("ModerationService", "Intermediario", "Registry", { "PlayerDataService", "Logger" }, {
	ApplyAction = "Execute",
	EvaluatePlayer = "Evaluate",
	GetCase = "GetRecord",
})

define("AdminCommandService", "Intermediario", "Policy", { "ModerationService", "RemoteRegistry" }, {
	ExecuteCommand = "Execute",
	CanExecute = "Evaluate",
})

define("LocalizationService", "Intermediario", "Registry", { "ConfigLoader" }, {
	RegisterText = "CreateRecord",
	Translate = "Execute",
	GetText = "GetRecord",
})

define("SessionLockService", "Avancado", "Policy", { "PlayerDataService" }, {
	Acquire = "Execute",
	Renew = "Execute",
	Release = "Execute",
	IsLocked = "Evaluate",
})

define("MigrationService", "Avancado", "Registry", { "PlayerDataService", "BackupSnapshotService" }, {
	RegisterMigration = "CreateRecord",
	Migrate = "Execute",
	GetMigration = "GetRecord",
})

define("AutosaveService", "Avancado", "State", { "PlayerDataService", "RetryPolicyService" }, {
	MarkDirty = "Execute",
	SaveNow = "Execute",
	GetSaveState = "GetState",
})

define("RetryPolicyService", "Avancado", "Policy", { "Logger" }, {
	RunWithRetry = "Execute",
	ShouldRetry = "Evaluate",
	GetRetryMetrics = "GetMetrics",
})

define("RateLimitService", "Avancado", "State", { "EnvironmentDetector" }, {
	Consume = "Execute",
	CanConsume = "Evaluate",
	ResetLimit = "ClearState",
})

define("RemoteGatewayService", "Avancado", "Registry", { "RemoteRegistry", "RateLimitService" }, {
	RegisterRoute = "CreateRecord",
	Dispatch = "Execute",
	GetRoute = "GetRecord",
})

define("AntiExploitService", "Avancado", "State", { "RemoteGatewayService", "EconomyAuditService" }, {
	Inspect = "Execute",
	IsSuspicious = "Evaluate",
	GetSignals = "GetState",
})

define("FeatureRolloutService", "Avancado", "State", { "FeatureFlagService", "AnalyticsService" }, {
	Assign = "Execute",
	IsEnabledFor = "Evaluate",
	GetAssignment = "GetState",
})

define("LiveOpsService", "Avancado", "Registry", { "FeatureRolloutService", "NotificationService" }, {
	RegisterEvent = "CreateRecord",
	Activate = "Execute",
	Deactivate = "Execute",
	GetEvent = "GetRecord",
})

define("PatchNotesService", "Avancado", "Registry", { "VersionControlTag", "PlayerDataService" }, {
	PublishNotes = "CreateRecord",
	MarkRead = "Execute",
	GetNotes = "ListRecords",
})

define("ServerShutdownService", "Avancado", "State", { "AutosaveService", "TransactionService" }, {
	BeginShutdown = "Execute",
	IsDraining = "Evaluate",
	GetShutdownState = "GetState",
})

define("PerformanceBudgetService", "Avancado", "Policy", { "Logger" }, {
	Sample = "Execute",
	IsWithinBudget = "Evaluate",
	GetPerformanceMetrics = "GetMetrics",
})

define("MatchmakingQueueService", "Avancado", "Queue", { "MemoryStoreService" }, {
	Join = "Enqueue",
	Leave = "Execute",
	Pop = "Dequeue",
	GetMatchmakingSize = "GetQueueSize",
})

define("CrossServerMessagingService", "Avancado", "Pipeline", { "MessagingService", "RetryPolicyService" }, {
	PublishMessage = "Execute",
	SubscribeTopic = "Execute",
	GetMessagingMetrics = "GetMetrics",
})

define("BackupSnapshotService", "Avancado", "Registry", { "PlayerDataService" }, {
	CreateSnapshot = "CreateRecord",
	GetSnapshot = "GetRecord",
	ListSnapshots = "ListRecords",
})

define("RollbackService", "Avancado", "Registry", { "BackupSnapshotService", "TransactionService" }, {
	RegisterPlan = "CreateRecord",
	ExecuteRollback = "Execute",
	PreviewRollback = "Execute",
	GetPlan = "GetRecord",
})

return IntegrationSystemsConfig

