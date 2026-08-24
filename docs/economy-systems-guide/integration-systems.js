/* Catálogo didático dos 50 serviços de integração. */
window.INTEGRATION_SYSTEM_BLUEPRINTS = [
  {
    "id": "notification",
    "name": "NotificationService",
    "label": "Notificações",
    "tier": "Básico",
    "mode": "State",
    "icon": "bell",
    "role": "Centraliza mensagens, prioridade, expiração e histórico por jogador.",
    "why": "Sem uma porta única, cada feature cria formatos incompatíveis e a UI precisa conhecer regras de todos os sistemas.",
    "dependencies": [
      "RemoteRegistry"
    ],
    "operations": [
      [
        "Send",
        "Execute"
      ],
      [
        "GetInbox",
        "GetState"
      ],
      [
        "ClearInbox",
        "ClearState"
      ]
    ]
  },
  {
    "id": "cooldown",
    "name": "CooldownService",
    "label": "Cooldowns",
    "tier": "Básico",
    "mode": "State",
    "icon": "timer-reset",
    "role": "Controla janelas de espera por jogador, ação e contexto.",
    "why": "Timestamps espalhados geram diferenças de relógio, chaves duplicadas e ações que esquecem de respeitar o mesmo limite.",
    "dependencies": [
      "EventBus"
    ],
    "operations": [
      [
        "Check",
        "Evaluate"
      ],
      [
        "StartCooldown",
        "Execute"
      ],
      [
        "GetCooldowns",
        "GetState"
      ],
      [
        "ClearCooldown",
        "ClearState"
      ]
    ]
  },
  {
    "id": "player-session",
    "name": "PlayerSessionService",
    "label": "Sessão do jogador",
    "tier": "Básico",
    "mode": "State",
    "icon": "user-round-check",
    "role": "Representa os estados conectado, carregando, pronto e encerrado.",
    "why": "PlayerAdded não significa que o perfil já carregou; sistemas precisam de um sinal confiável antes de ler dados.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "OpenSession",
        "Execute"
      ],
      [
        "GetSession",
        "GetState"
      ],
      [
        "CloseSession",
        "ClearState"
      ]
    ]
  },
  {
    "id": "attribute-sync",
    "name": "AttributeSyncService",
    "label": "Sincronização de atributos",
    "tier": "Básico",
    "mode": "State",
    "icon": "refresh-cw",
    "role": "Replica somente snapshots permitidos em Attributes de runtime.",
    "why": "Expor o perfil inteiro mistura segurança com apresentação; um espelho explícito limita o que atravessa para o cliente.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "Sync",
        "Execute"
      ],
      [
        "GetSnapshot",
        "GetState"
      ],
      [
        "ClearSnapshot",
        "ClearState"
      ]
    ]
  },
  {
    "id": "tag",
    "name": "TagService",
    "label": "Tags de domínio",
    "tier": "Básico",
    "mode": "Policy",
    "icon": "tags",
    "role": "Classifica objetos e jogadores com nomes estáveis de domínio.",
    "why": "Buscar objetos por nome ou manter booleanos soltos cria regras difíceis de consultar e renomear.",
    "dependencies": [
      "EventBus"
    ],
    "operations": [
      [
        "AddTag",
        "Execute"
      ],
      [
        "RemoveTag",
        "Execute"
      ],
      [
        "HasTag",
        "Evaluate"
      ]
    ]
  },
  {
    "id": "reward",
    "name": "RewardService",
    "label": "Recompensas",
    "tier": "Básico",
    "mode": "Pipeline",
    "icon": "gift",
    "role": "Normaliza preview e concessão de moeda, item e XP.",
    "why": "Cada origem de prêmio não deve escrever diretamente em três fontes de verdade nem inventar sua própria resposta de erro.",
    "dependencies": [
      "CurrencyExchangeService",
      "InventoryService"
    ],
    "operations": [
      [
        "Grant",
        "Execute"
      ],
      [
        "Preview",
        "Execute"
      ]
    ]
  },
  {
    "id": "checkpoint",
    "name": "CheckpointService",
    "label": "Checkpoints",
    "tier": "Básico",
    "mode": "State",
    "icon": "map-pin-check",
    "role": "Registra o último ponto seguro alcançado pelo jogador.",
    "why": "Respawn, tutorial e teleporte precisam consultar o mesmo progresso espacial em vez de manter cópias locais.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "Reach",
        "Execute"
      ],
      [
        "GetCheckpoint",
        "GetState"
      ],
      [
        "ResetCheckpoint",
        "ClearState"
      ]
    ]
  },
  {
    "id": "spawn-protection",
    "name": "SpawnProtectionService",
    "label": "Proteção de spawn",
    "tier": "Básico",
    "mode": "Policy",
    "icon": "shield",
    "role": "Controla invulnerabilidade temporária após o personagem nascer.",
    "why": "O jogador precisa terminar spawn, câmera e replicação sem receber dano, mas a proteção precisa expirar de modo verificável.",
    "dependencies": [
      "EventBus"
    ],
    "operations": [
      [
        "Protect",
        "Execute"
      ],
      [
        "IsProtected",
        "Evaluate"
      ],
      [
        "RemoveProtection",
        "Execute"
      ]
    ]
  },
  {
    "id": "daily-reward",
    "name": "DailyRewardService",
    "label": "Recompensa diária",
    "tier": "Básico",
    "mode": "State",
    "icon": "calendar-check",
    "role": "Modela calendário, sequência e claim diário com horário do servidor.",
    "why": "Sem período canônico e idempotência, reconectar ou alterar relógio local pode conceder o mesmo prêmio novamente.",
    "dependencies": [
      "RewardService",
      "PlayerDataService"
    ],
    "operations": [
      [
        "Claim",
        "Execute"
      ],
      [
        "GetCalendar",
        "GetState"
      ],
      [
        "ResetCalendar",
        "ClearState"
      ]
    ]
  },
  {
    "id": "playtime",
    "name": "PlaytimeService",
    "label": "Tempo de jogo",
    "tier": "Básico",
    "mode": "State",
    "icon": "clock-3",
    "role": "Acumula tempo de sessão em intervalos controlados.",
    "why": "Salvar a cada frame desperdiça budget; confiar só no cliente permite acelerar ou inventar tempo.",
    "dependencies": [
      "PlayerSessionService"
    ],
    "operations": [
      [
        "AddTime",
        "Execute"
      ],
      [
        "GetPlaytime",
        "GetState"
      ],
      [
        "ResetPlaytime",
        "ClearState"
      ]
    ]
  },
  {
    "id": "settings",
    "name": "SettingsService",
    "label": "Configurações",
    "tier": "Básico",
    "mode": "State",
    "icon": "settings",
    "role": "Mantém preferências persistentes com defaults e chaves permitidas.",
    "why": "Preferência de áudio ou acessibilidade precisa sobreviver à sessão sem dar ao cliente acesso ao perfil inteiro.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "SetSetting",
        "Execute"
      ],
      [
        "GetSettings",
        "GetState"
      ],
      [
        "ResetSettings",
        "ClearState"
      ]
    ]
  },
  {
    "id": "tutorial",
    "name": "TutorialService",
    "label": "Tutorial",
    "tier": "Básico",
    "mode": "State",
    "icon": "graduation-cap",
    "role": "Controla etapas concluídas e a próxima instrução válida.",
    "why": "Um tutorial puramente local esquece progresso, repete recompensas e quebra quando o jogador troca de dispositivo.",
    "dependencies": [
      "PlayerDataService",
      "AnalyticsService"
    ],
    "operations": [
      [
        "CompleteStep",
        "Execute"
      ],
      [
        "GetProgress",
        "GetState"
      ],
      [
        "ResetTutorial",
        "ClearState"
      ]
    ]
  },
  {
    "id": "quest",
    "name": "QuestService",
    "label": "Quests",
    "tier": "Básico",
    "mode": "State",
    "icon": "scroll-text",
    "role": "Mantém objetivos aceitos, progresso e recompensa pendente.",
    "why": "Eventos de gameplay apenas informam fatos; o serviço decide quais quests escutam o fato e quando concluem.",
    "dependencies": [
      "RewardService",
      "EventBus"
    ],
    "operations": [
      [
        "Accept",
        "Execute"
      ],
      [
        "Advance",
        "Execute"
      ],
      [
        "GetQuests",
        "GetState"
      ],
      [
        "Abandon",
        "Execute"
      ]
    ]
  },
  {
    "id": "internal-achievement",
    "name": "InternalAchievementService",
    "label": "Conquistas internas",
    "tier": "Básico",
    "mode": "State",
    "icon": "trophy",
    "role": "Registra conquistas detalhadas independentes de badges públicos.",
    "why": "Nem todo marco merece um BadgeId, mas ainda pode desbloquear conteúdo e ser persistido.",
    "dependencies": [
      "PlayerDataService",
      "RewardService"
    ],
    "operations": [
      [
        "Unlock",
        "Execute"
      ],
      [
        "GetAchievements",
        "GetState"
      ],
      [
        "ResetAchievements",
        "ClearState"
      ]
    ]
  },
  {
    "id": "interaction",
    "name": "InteractionService",
    "label": "Interações do mundo",
    "tier": "Básico",
    "mode": "Policy",
    "icon": "mouse-pointer-click",
    "role": "Valida alvo, distância e contexto de uma interação.",
    "why": "ProximityPrompt ou clique mostra intenção; o servidor ainda precisa provar que o alvo existe e está ao alcance.",
    "dependencies": [
      "EventBus"
    ],
    "operations": [
      [
        "ValidateInteraction",
        "Evaluate"
      ],
      [
        "ExecuteInteraction",
        "Execute"
      ]
    ]
  },
  {
    "id": "item-catalog",
    "name": "ItemCatalogService",
    "label": "Catálogo de itens",
    "tier": "Básico",
    "mode": "Registry",
    "icon": "package-search",
    "role": "Fornece definições de itens por identificador estável.",
    "why": "Inventário, loja e crafting não podem discordar sobre stack, categoria ou nome do mesmo item.",
    "dependencies": [
      "ConfigLoader"
    ],
    "operations": [
      [
        "RegisterItem",
        "CreateRecord"
      ],
      [
        "GetItem",
        "GetRecord"
      ],
      [
        "ListItems",
        "ListRecords"
      ]
    ]
  },
  {
    "id": "price",
    "name": "PriceService",
    "label": "Preços",
    "tier": "Básico",
    "mode": "Policy",
    "icon": "badge-dollar-sign",
    "role": "Resolve preço base, contexto, desconto e arredondamento.",
    "why": "Preview e cobrança devem usar a mesma regra; duplicar cálculo abre diferença explorável.",
    "dependencies": [
      "DiscountService",
      "TaxService"
    ],
    "operations": [
      [
        "Quote",
        "Execute"
      ],
      [
        "ValidatePrice",
        "Evaluate"
      ]
    ]
  },
  {
    "id": "transaction",
    "name": "TransactionService",
    "label": "Transações",
    "tier": "Intermediário",
    "mode": "Pipeline",
    "icon": "workflow",
    "role": "Executa operações identificadas com etapas e resposta idempotente.",
    "why": "Débito, entrega e histórico podem falhar separadamente; a transação define compensação e repetição segura.",
    "dependencies": [
      "EventBus",
      "WalletHistoryService"
    ],
    "operations": [
      [
        "Run",
        "Execute"
      ],
      [
        "GetTransaction",
        "GetRecord"
      ],
      [
        "ListTransactions",
        "ListRecords"
      ]
    ]
  },
  {
    "id": "receipt-processing",
    "name": "ReceiptProcessingService",
    "label": "Recibos",
    "tier": "Intermediário",
    "mode": "Pipeline",
    "icon": "receipt-text",
    "role": "Processa recibos de Developer Products uma única vez.",
    "why": "O callback de compra pode repetir; entregar novamente cria moeda ou item duplicado.",
    "dependencies": [
      "TransactionService",
      "PlayerDataService"
    ],
    "operations": [
      [
        "Process",
        "Execute"
      ],
      [
        "HasProcessed",
        "Evaluate"
      ],
      [
        "GetReceipt",
        "GetRecord"
      ]
    ]
  },
  {
    "id": "gamepass-entitlement",
    "name": "GamePassEntitlementService",
    "label": "Direitos de game pass",
    "tier": "Intermediário",
    "mode": "State",
    "icon": "badge-check",
    "role": "Consulta e cacheia direitos de game pass.",
    "why": "Possuir um passe e aplicar um benefício são responsabilidades diferentes e atualizadas em momentos diferentes.",
    "dependencies": [
      "VIPBenefitsService"
    ],
    "operations": [
      [
        "Refresh",
        "Execute"
      ],
      [
        "HasEntitlement",
        "Evaluate"
      ],
      [
        "GetEntitlements",
        "GetState"
      ]
    ]
  },
  {
    "id": "trade",
    "name": "TradeService",
    "label": "Trocas",
    "tier": "Intermediário",
    "mode": "Registry",
    "icon": "handshake",
    "role": "Modela proposta, aceite, custódia e cancelamento entre dois jogadores.",
    "why": "Os itens precisam ficar imutáveis durante confirmação para nenhum lado gastar o mesmo ativo.",
    "dependencies": [
      "TransactionService",
      "InventoryService"
    ],
    "operations": [
      [
        "CreateTrade",
        "CreateRecord"
      ],
      [
        "Accept",
        "Execute"
      ],
      [
        "Cancel",
        "RemoveRecord"
      ],
      [
        "GetTrade",
        "GetRecord"
      ]
    ]
  },
  {
    "id": "mailbox",
    "name": "MailboxService",
    "label": "Caixa de correio",
    "tier": "Intermediário",
    "mode": "State",
    "icon": "mail",
    "role": "Entrega mensagens e anexos persistentes.",
    "why": "Comunicação e compensação precisam alcançar jogadores que estavam offline.",
    "dependencies": [
      "PlayerDataService",
      "NotificationService"
    ],
    "operations": [
      [
        "SendMail",
        "Execute"
      ],
      [
        "GetMailbox",
        "GetState"
      ],
      [
        "ClaimAttachment",
        "Execute"
      ]
    ]
  },
  {
    "id": "reward-inbox",
    "name": "RewardInboxService",
    "label": "Caixa de recompensas",
    "tier": "Intermediário",
    "mode": "State",
    "icon": "inbox",
    "role": "Guarda recompensas pendentes até entrega confirmada.",
    "why": "Inventário cheio, save falho ou shutdown não podem simplesmente apagar um prêmio conquistado.",
    "dependencies": [
      "RewardService",
      "PlayerDataService"
    ],
    "operations": [
      [
        "PushReward",
        "Execute"
      ],
      [
        "ClaimReward",
        "Execute"
      ],
      [
        "GetRewards",
        "GetState"
      ]
    ]
  },
  {
    "id": "crafting",
    "name": "CraftingService",
    "label": "Crafting",
    "tier": "Intermediário",
    "mode": "Pipeline",
    "icon": "hammer",
    "role": "Consome ingredientes e produz saída usando uma receita validada.",
    "why": "Entre preview e execução os itens podem mudar; reserva, consumo e rollback precisam formar uma operação.",
    "dependencies": [
      "RecipeService",
      "InventoryService",
      "TransactionService"
    ],
    "operations": [
      [
        "Craft",
        "Execute"
      ],
      [
        "PreviewCraft",
        "Execute"
      ]
    ]
  },
  {
    "id": "recipe",
    "name": "RecipeService",
    "label": "Receitas",
    "tier": "Intermediário",
    "mode": "Registry",
    "icon": "notebook-tabs",
    "role": "Cataloga entradas, saídas, tempo e requisitos.",
    "why": "A definição da receita muda por balanceamento e não deve ficar enterrada no executor de crafting.",
    "dependencies": [
      "ItemCatalogService"
    ],
    "operations": [
      [
        "RegisterRecipe",
        "CreateRecord"
      ],
      [
        "GetRecipe",
        "GetRecord"
      ],
      [
        "ListRecipes",
        "ListRecords"
      ]
    ]
  },
  {
    "id": "production-queue",
    "name": "ProductionQueueService",
    "label": "Fila de produção",
    "tier": "Intermediário",
    "mode": "Queue",
    "icon": "list-ordered",
    "role": "Ordena trabalhos esperando processamento nas máquinas.",
    "why": "Uma task infinita por item dificulta capacidade, cancelamento e observação da ordem.",
    "dependencies": [
      "MachineService",
      "EventBus"
    ],
    "operations": [
      [
        "EnqueueJob",
        "Enqueue"
      ],
      [
        "DequeueJob",
        "Dequeue"
      ],
      [
        "PeekJob",
        "Peek"
      ],
      [
        "GetQueueSize",
        "GetQueueSize"
      ]
    ]
  },
  {
    "id": "machine-placement",
    "name": "MachinePlacementService",
    "label": "Posicionamento de máquinas",
    "tier": "Intermediário",
    "mode": "Pipeline",
    "icon": "move-3d",
    "role": "Valida e confirma CFrames locais dentro do plot.",
    "why": "O cliente pode mostrar preview, mas não deve enviar um modelo pronto nem escolher coordenadas fora do terreno.",
    "dependencies": [
      "PlotService",
      "ObjectStoreService"
    ],
    "operations": [
      [
        "Place",
        "Execute"
      ],
      [
        "Move",
        "Execute"
      ],
      [
        "Remove",
        "Execute"
      ]
    ]
  },
  {
    "id": "object-store",
    "name": "ObjectStoreService",
    "label": "ObjectStore",
    "tier": "Intermediário",
    "mode": "Registry",
    "icon": "boxes",
    "role": "Serializa objetos do mundo em registros reconstruíveis.",
    "why": "DataStore não guarda Instances; template, dono, upgrades e CFrame precisam virar dados simples.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "SaveObject",
        "CreateRecord"
      ],
      [
        "GetObject",
        "GetRecord"
      ],
      [
        "UpdateObject",
        "UpdateRecord"
      ],
      [
        "RemoveObject",
        "RemoveRecord"
      ]
    ]
  },
  {
    "id": "leaderboard",
    "name": "LeaderboardService",
    "label": "Rankings",
    "tier": "Intermediário",
    "mode": "Registry",
    "icon": "list-trophy",
    "role": "Mantém snapshots e páginas de ranking.",
    "why": "A UI não deve consumir OrderedDataStore diretamente nem repetir consultas para cada jogador.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "Submit",
        "Execute"
      ],
      [
        "GetBoard",
        "ListRecords"
      ]
    ]
  },
  {
    "id": "analytics",
    "name": "AnalyticsService",
    "label": "Analytics",
    "tier": "Intermediário",
    "mode": "Pipeline",
    "icon": "chart-no-axes-combined",
    "role": "Registra eventos com nome, schema, versão e contexto estáveis.",
    "why": "Campos inconsistentes impedem comparar tutorial, economia ou retenção entre versões.",
    "dependencies": [
      "EnvironmentDetector"
    ],
    "operations": [
      [
        "Track",
        "Execute"
      ],
      [
        "GetAnalyticsMetrics",
        "GetMetrics"
      ]
    ]
  },
  {
    "id": "economy-audit",
    "name": "EconomyAuditService",
    "label": "Auditoria econômica",
    "tier": "Intermediário",
    "mode": "Registry",
    "icon": "file-search",
    "role": "Mantém uma trilha limitada de fontes e drenos de moeda.",
    "why": "Saldo final sozinho não explica qual sistema gerou inflação, duplicou entrega ou perdeu valor.",
    "dependencies": [
      "WalletHistoryService",
      "TransactionService"
    ],
    "operations": [
      [
        "RecordAudit",
        "Execute"
      ],
      [
        "QueryAudits",
        "ListRecords"
      ]
    ]
  },
  {
    "id": "moderation",
    "name": "ModerationService",
    "label": "Moderação",
    "tier": "Intermediário",
    "mode": "Registry",
    "icon": "shield-ban",
    "role": "Aplica ações com motivo, autor e expiração.",
    "why": "Um booleano Banido não permite revisão, expiração automática nem auditoria de quem mudou o estado.",
    "dependencies": [
      "PlayerDataService",
      "Logger"
    ],
    "operations": [
      [
        "ApplyAction",
        "Execute"
      ],
      [
        "EvaluatePlayer",
        "Evaluate"
      ],
      [
        "GetCase",
        "GetRecord"
      ]
    ]
  },
  {
    "id": "admin-command",
    "name": "AdminCommandService",
    "label": "Comandos administrativos",
    "tier": "Intermediário",
    "mode": "Policy",
    "icon": "terminal",
    "role": "Executa comandos internos com permissão e argumentos validados.",
    "why": "Uma ferramenta de suporte sem fronteira forte se torna um remote capaz de alterar qualquer jogador.",
    "dependencies": [
      "ModerationService",
      "RemoteRegistry"
    ],
    "operations": [
      [
        "ExecuteCommand",
        "Execute"
      ],
      [
        "CanExecute",
        "Evaluate"
      ]
    ]
  },
  {
    "id": "localization",
    "name": "LocalizationService",
    "label": "Localização",
    "tier": "Intermediário",
    "mode": "Registry",
    "icon": "languages",
    "role": "Resolve texto por chave, idioma e fallback.",
    "why": "Texto duplicado em scripts não pode ser traduzido nem revisado de forma consistente.",
    "dependencies": [
      "ConfigLoader"
    ],
    "operations": [
      [
        "RegisterText",
        "CreateRecord"
      ],
      [
        "Translate",
        "Execute"
      ],
      [
        "GetText",
        "GetRecord"
      ]
    ]
  },
  {
    "id": "session-lock",
    "name": "SessionLockService",
    "label": "Bloqueio de sessão",
    "tier": "Avançado",
    "mode": "Policy",
    "icon": "lock-keyhole",
    "role": "Coordena posse temporária de um perfil entre servidores.",
    "why": "Reconexão rápida pode deixar dois servidores salvando a mesma chave e sobrescrevendo progresso.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "Acquire",
        "Execute"
      ],
      [
        "Renew",
        "Execute"
      ],
      [
        "Release",
        "Execute"
      ],
      [
        "IsLocked",
        "Evaluate"
      ]
    ]
  },
  {
    "id": "migration",
    "name": "MigrationService",
    "label": "Migrações",
    "tier": "Avançado",
    "mode": "Registry",
    "icon": "git-compare-arrows",
    "role": "Transforma schemas antigos em ordem de versão.",
    "why": "Adicionar campos não basta quando formato ou significado dos dados antigos mudou.",
    "dependencies": [
      "PlayerDataService",
      "BackupSnapshotService"
    ],
    "operations": [
      [
        "RegisterMigration",
        "CreateRecord"
      ],
      [
        "Migrate",
        "Execute"
      ],
      [
        "GetMigration",
        "GetRecord"
      ]
    ]
  },
  {
    "id": "autosave",
    "name": "AutosaveService",
    "label": "Autosave",
    "tier": "Avançado",
    "mode": "State",
    "icon": "save",
    "role": "Agenda perfis sujos com intervalo e prioridade.",
    "why": "Salvar a cada mutação desperdiça budget; salvar só ao sair aumenta a janela de perda.",
    "dependencies": [
      "PlayerDataService",
      "RetryPolicyService"
    ],
    "operations": [
      [
        "MarkDirty",
        "Execute"
      ],
      [
        "SaveNow",
        "Execute"
      ],
      [
        "GetSaveState",
        "GetState"
      ]
    ]
  },
  {
    "id": "retry-policy",
    "name": "RetryPolicyService",
    "label": "Política de retry",
    "tier": "Avançado",
    "mode": "Policy",
    "icon": "repeat-2",
    "role": "Repete falhas transitórias com limite e backoff.",
    "why": "Retry infinito esconde erro lógico e amplifica carga; falhas permanentes precisam parar imediatamente.",
    "dependencies": [
      "Logger"
    ],
    "operations": [
      [
        "RunWithRetry",
        "Execute"
      ],
      [
        "ShouldRetry",
        "Evaluate"
      ],
      [
        "GetRetryMetrics",
        "GetMetrics"
      ]
    ]
  },
  {
    "id": "rate-limit",
    "name": "RateLimitService",
    "label": "Rate limit",
    "tier": "Avançado",
    "mode": "State",
    "icon": "gauge",
    "role": "Consome tokens por identidade, rota e janela.",
    "why": "Bloquear por cooldown único não absorve picos nem diferencia rotas caras de ações leves.",
    "dependencies": [
      "EnvironmentDetector"
    ],
    "operations": [
      [
        "Consume",
        "Execute"
      ],
      [
        "CanConsume",
        "Evaluate"
      ],
      [
        "ResetLimit",
        "ClearState"
      ]
    ]
  },
  {
    "id": "remote-gateway",
    "name": "RemoteGatewayService",
    "label": "Gateway de remotes",
    "tier": "Avançado",
    "mode": "Registry",
    "icon": "router",
    "role": "Registra rotas com schema, limite e autorização.",
    "why": "Todo payload precisa atravessar uma fronteira auditável antes de tocar o domínio.",
    "dependencies": [
      "RemoteRegistry",
      "RateLimitService"
    ],
    "operations": [
      [
        "RegisterRoute",
        "CreateRecord"
      ],
      [
        "Dispatch",
        "Execute"
      ],
      [
        "GetRoute",
        "GetRecord"
      ]
    ]
  },
  {
    "id": "anti-exploit",
    "name": "AntiExploitService",
    "label": "Anti-exploit",
    "tier": "Avançado",
    "mode": "State",
    "icon": "shield-alert",
    "role": "Agrega sinais impossíveis e nível de confiança.",
    "why": "Uma anomalia isolada pode ser lag; correlação reduz falso positivo antes de punir.",
    "dependencies": [
      "RemoteGatewayService",
      "EconomyAuditService"
    ],
    "operations": [
      [
        "Inspect",
        "Execute"
      ],
      [
        "IsSuspicious",
        "Evaluate"
      ],
      [
        "GetSignals",
        "GetState"
      ]
    ]
  },
  {
    "id": "feature-rollout",
    "name": "FeatureRolloutService",
    "label": "Rollout gradual",
    "tier": "Avançado",
    "mode": "State",
    "icon": "split",
    "role": "Atribui jogadores a liberações determinísticas.",
    "why": "Uma porcentagem aleatória por sessão troca o grupo do jogador e contamina o experimento.",
    "dependencies": [
      "FeatureFlagService",
      "AnalyticsService"
    ],
    "operations": [
      [
        "Assign",
        "Execute"
      ],
      [
        "IsEnabledFor",
        "Evaluate"
      ],
      [
        "GetAssignment",
        "GetState"
      ]
    ]
  },
  {
    "id": "live-ops",
    "name": "LiveOpsService",
    "label": "Live Ops",
    "tier": "Avançado",
    "mode": "Registry",
    "icon": "calendar-range",
    "role": "Controla eventos temporários por janela e configuração.",
    "why": "Calendário operacional não deve exigir novo deploy nem deixar bônus ativo após expirar.",
    "dependencies": [
      "FeatureRolloutService",
      "NotificationService"
    ],
    "operations": [
      [
        "RegisterEvent",
        "CreateRecord"
      ],
      [
        "Activate",
        "Execute"
      ],
      [
        "Deactivate",
        "Execute"
      ],
      [
        "GetEvent",
        "GetRecord"
      ]
    ]
  },
  {
    "id": "patch-notes",
    "name": "PatchNotesService",
    "label": "Patch notes",
    "tier": "Avançado",
    "mode": "Registry",
    "icon": "newspaper",
    "role": "Publica changelog versionado e registra leitura.",
    "why": "Jogadores precisam ver apenas mudanças relevantes desde sua última versão conhecida.",
    "dependencies": [
      "VersionControlTag",
      "PlayerDataService"
    ],
    "operations": [
      [
        "PublishNotes",
        "CreateRecord"
      ],
      [
        "MarkRead",
        "Execute"
      ],
      [
        "GetNotes",
        "ListRecords"
      ]
    ]
  },
  {
    "id": "server-shutdown",
    "name": "ServerShutdownService",
    "label": "Shutdown seguro",
    "tier": "Avançado",
    "mode": "State",
    "icon": "power",
    "role": "Coloca o servidor em drenagem antes de fechar.",
    "why": "Novas transações durante fechamento podem debitar sem salvar ou perder entrega pendente.",
    "dependencies": [
      "AutosaveService",
      "TransactionService"
    ],
    "operations": [
      [
        "BeginShutdown",
        "Execute"
      ],
      [
        "IsDraining",
        "Evaluate"
      ],
      [
        "GetShutdownState",
        "GetState"
      ]
    ]
  },
  {
    "id": "performance-budget",
    "name": "PerformanceBudgetService",
    "label": "Orçamento de performance",
    "tier": "Avançado",
    "mode": "Policy",
    "icon": "activity",
    "role": "Compara amostras com limites operacionais.",
    "why": "Dizer que o jogo está lento não identifica qual sistema excedeu tempo, memória ou instâncias.",
    "dependencies": [
      "Logger"
    ],
    "operations": [
      [
        "Sample",
        "Execute"
      ],
      [
        "IsWithinBudget",
        "Evaluate"
      ],
      [
        "GetPerformanceMetrics",
        "GetMetrics"
      ]
    ]
  },
  {
    "id": "matchmaking-queue",
    "name": "MatchmakingQueueService",
    "label": "Fila de matchmaking",
    "tier": "Avançado",
    "mode": "Queue",
    "icon": "users-round",
    "role": "Ordena entradas para formar grupos entre servidores.",
    "why": "Espera, prioridade e retirada precisam ser independentes do teleporte da partida.",
    "dependencies": [
      "MemoryStoreService"
    ],
    "operations": [
      [
        "Join",
        "Enqueue"
      ],
      [
        "Leave",
        "Execute"
      ],
      [
        "Pop",
        "Dequeue"
      ],
      [
        "GetMatchmakingSize",
        "GetQueueSize"
      ]
    ]
  },
  {
    "id": "cross-server-messaging",
    "name": "CrossServerMessagingService",
    "label": "Mensagens entre servidores",
    "tier": "Avançado",
    "mode": "Pipeline",
    "icon": "radio-tower",
    "role": "Publica mensagens versionadas entre servidores.",
    "why": "Payload livre no MessagingService quebra quando versões diferentes coexistem.",
    "dependencies": [
      "MessagingService",
      "RetryPolicyService"
    ],
    "operations": [
      [
        "PublishMessage",
        "Execute"
      ],
      [
        "SubscribeTopic",
        "Execute"
      ],
      [
        "GetMessagingMetrics",
        "GetMetrics"
      ]
    ]
  },
  {
    "id": "backup-snapshot",
    "name": "BackupSnapshotService",
    "label": "Snapshots de backup",
    "tier": "Avançado",
    "mode": "Registry",
    "icon": "archive-restore",
    "role": "Cria snapshots antes de mudanças irreversíveis.",
    "why": "Sem estado anterior conhecido, investigar ou reparar uma migração ruim vira adivinhação.",
    "dependencies": [
      "PlayerDataService"
    ],
    "operations": [
      [
        "CreateSnapshot",
        "CreateRecord"
      ],
      [
        "GetSnapshot",
        "GetRecord"
      ],
      [
        "ListSnapshots",
        "ListRecords"
      ]
    ]
  },
  {
    "id": "rollback",
    "name": "RollbackService",
    "label": "Rollback lógico",
    "tier": "Avançado",
    "mode": "Registry",
    "icon": "undo-2",
    "role": "Executa planos versionados de compensação.",
    "why": "Reverter código não desfaz moedas, itens ou schemas já alterados em produção.",
    "dependencies": [
      "BackupSnapshotService",
      "TransactionService"
    ],
    "operations": [
      [
        "RegisterPlan",
        "CreateRecord"
      ],
      [
        "ExecuteRollback",
        "Execute"
      ],
      [
        "PreviewRollback",
        "Execute"
      ],
      [
        "GetPlan",
        "GetRecord"
      ]
    ]
  }
];

