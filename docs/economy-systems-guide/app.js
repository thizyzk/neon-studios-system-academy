(function () {
  "use strict";

  const STORAGE_KEY = "neon-academy-progress-v1";
  const THEME_KEY = "neon-academy-theme";
  const VISUAL_SETTINGS_KEY = "neon-academy-visual-settings-v1";
  const WORKSPACE_KEY = "neon-academy-workspace-v1";
  const ACTIVE_ACCOUNT_KEY = "neon-academy-active-account";
  const AUTH_HANDOFF_KEY = "neon-academy-auth-handoff-v1";
  const learningTracks = window.NEON_ACADEMY_TRACKS || [];
  let activeAccountId = localStorage.getItem(ACTIVE_ACCOUNT_KEY) || "guest";

  [
    ["cotton-economy-guide-progress-v1", STORAGE_KEY],
    ["cotton-economy-guide-theme", THEME_KEY],
    ["cotton-learning-workspace-v1", WORKSPACE_KEY],
  ].forEach(([legacyKey, academyKey]) => {
    try {
      const legacyValue = localStorage.getItem(legacyKey);
      if (localStorage.getItem(academyKey) === null && legacyValue !== null) {
        localStorage.setItem(academyKey, legacyValue);
      }
      localStorage.removeItem(legacyKey);
    } catch {
      // O restante do guia continua funcional quando o navegador bloqueia armazenamento local.
    }
  });
  const methodCatalog = window.ROBLOX_METHOD_CATALOG || [];

  const systems = [
    {
      id: "currency-exchange",
      name: "CurrencyExchangeService",
      label: "Câmbio e carteira",
      icon: "arrow-left-right",
      phase: 1,
      risk: "Médio",
      riskClass: "medium",
      role: "Porta única para ler, debitar, creditar e converter moedas.",
      question: "Qual módulo é a fonte de verdade de cada moeda e como uma operação volta ao estado anterior quando apenas metade dela funciona?",
      source: "../../src/ServerScriptService/Services/Economy/CurrencyExchangeService.luau",
      dependencies: ["LeaderstatsService", "EconomySystemsConfig"],
      dependents: ["AuctionHouseService", "BankService", "LoanService", "CraftingCostCalculator"],
      truth: "Cash permanece no LeaderstatsService. Gems e Tokens usam atributos do Player até serem conectados ao perfil persistido.",
      mentalModel: [
        "Trate moeda como um razão contábil: toda alteração precisa passar pela mesma porta.",
        "Separe cotação de execução. A UI pode consultar uma troca sem alterar saldo.",
        "Uma conversão possui dois lados: débito da origem e crédito do destino.",
        "Quando o segundo lado falha, reverta o primeiro imediatamente."
      ],
      flow: [
        ["Validar entrada", "Confirma número finito, mínimo aceito e par de moedas configurado."],
        ["Montar cotação", "Aplica taxa, tarifa e arredondamento antes de tocar na carteira."],
        ["Debitar origem", "AdjustBalance recusa saldo negativo e retorna um erro de domínio."],
        ["Creditar destino", "A moeda recebida usa o mesmo adaptador de saldo."],
        ["Reverter se necessário", "Se o crédito falhar, o valor debitado volta à moeda de origem."],
        ["Retornar saldos", "A resposta inclui os dois saldos finais para sincronização de UI."]
      ],
      stages: [
        "Definir moedas, atributos e pares de conversão no config.",
        "Conectar Cash ao LeaderstatsService e testar leitura/escrita.",
        "Implementar Quote como função sem efeitos colaterais.",
        "Implementar Exchange com débito, crédito e rollback.",
        "Persistir moedas secundárias no PlayerDataService antes de produção."
      ],
      methods: [
        ["IsSupported(currencyId)", "Confirma se a moeda pertence ao catálogo.", "boolean"],
        ["GetBalance(player, currencyId)", "Lê Cash ou atributo secundário.", "number?"],
        ["SetBalance(player, currencyId, amount)", "Define saldo normalizado e não negativo.", "boolean"],
        ["AdjustBalance(player, currencyId, delta)", "Aplica crédito ou débito com validação.", "ok, saldo/erro"],
        ["GetRate(from, to)", "Obtém a taxa direta configurada.", "number?"],
        ["Quote(from, to, amount)", "Calcula entrada, saída, taxa e tarifa.", "resultado"],
        ["Exchange(player, from, to, amount)", "Executa a conversão atômica.", "resultado" ]
      ],
      configKeys: ["DefaultCurrency", "CurrencyAttributes", "Rates", "FeeRate", "MinimumInput"],
      invariants: [
        "Nenhum saldo pode ficar negativo.",
        "Uma moeda só pode ser usada se estiver configurada.",
        "A cotação nunca altera estado.",
        "Falha no crédito restaura integralmente o débito."
      ],
      mistakes: [
        ["Duas carteiras para Cash", "Cria divergência entre leaderstats e compras. Use o adaptador como única entrada."],
        ["Taxa reversa presumida", "Cash→Gems não implica Gems→Cash. Configure cada direção explicitamente."],
        ["Confiar no valor do cliente", "O servidor deve recalcular a cotação com o config vigente."],
        ["Esquecer persistência", "Atributos desaparecem com a sessão até o PlayerData importá-los e exportá-los."]
      ],
      tests: [
        "Recusa moeda desconhecida e taxa ausente.",
        "Recusa débito maior que o saldo.",
        "Arredonda saída e tarifa de forma determinística.",
        "Restaura origem quando o adaptador de destino falha.",
        "Cash lido pelo serviço é igual ao leaderstat Dinheiro.",
        "Quote repetido não muda nenhum saldo."
      ],
      example: `local Exchange = require(ServerScriptService.Services.Economy.CurrencyExchangeService)\n\nlocal quote = Exchange:Quote("Cash", "Gems", 1000)\nif quote.Ok then\n    print(quote.Input, quote.Output, quote.Fee)\nend\n\nlocal result = Exchange:Exchange(player, "Cash", "Gems", 1000)\nif not result.Ok then\n    warn(result.Error)\nend`
    },
    {
      id: "tax",
      name: "TaxService",
      label: "Impostos",
      icon: "receipt",
      phase: 1,
      risk: "Baixo",
      riskClass: "low",
      role: "Calcula a divisão entre valor bruto, imposto e valor líquido.",
      question: "O imposto deve apenas calcular uma regra ou também mover dinheiro? Separar esses papéis evita efeitos colaterais em previews.",
      source: "../../src/ServerScriptService/Services/Economy/TaxService.luau",
      dependencies: ["EconomySystemsConfig"],
      dependents: ["AuctionHouseService", "BankService"],
      truth: "As taxas vivem no EconomySystemsConfig; o tesouro interno registra apenas o total arrecadado.",
      mentalModel: [
        "Imposto é uma transformação de valor, não uma carteira do jogador.",
        "O tipo da transação escolhe a taxa: leilão e juros podem ter regras diferentes.",
        "Preview e execução devem produzir exatamente a mesma divisão.",
        "O teto global protege o jogo contra um erro de configuração destrutivo."
      ],
      flow: [
        ["Identificar transação", "Recebe uma chave estável como AuctionSale ou BankInterest."],
        ["Resolver taxa", "Usa taxa específica, padrão ou override explícito do contexto."],
        ["Aplicar limites", "Restringe a taxa entre zero e MaximumRate."],
        ["Dividir valor", "Calcula Gross, Tax e Net com arredondamento inteiro."],
        ["Registrar arrecadação", "Record é chamado somente quando a transação principal foi concluída."],
        ["Exportar tesouro", "O total pode ser enviado ao save ou analytics sem acoplar o módulo."]
      ],
      stages: [
        "Listar tipos de transação e taxas no config.",
        "Implementar GetRate e o teto de segurança.",
        "Implementar Calculate e Split sem mutações.",
        "Chamar Record apenas depois de a transação confirmar.",
        "Conectar ExportState ao armazenamento ou painel operacional."
      ],
      methods: [
        ["GetRate(type, context)", "Resolve e limita a taxa aplicável.", "number"],
        ["Calculate(type, gross, context)", "Calcula somente o imposto.", "tax, erro, rate"],
        ["Split(type, gross, context)", "Retorna bruto, imposto e líquido.", "resultado"],
        ["Record(amount)", "Soma uma cobrança confirmada ao tesouro.", "treasury"],
        ["GetTreasury()", "Consulta o total arrecadado.", "number"],
        ["ExportState() / ImportState()", "Serializa ou restaura o tesouro.", "table / boolean"]
      ],
      configKeys: ["DefaultRate", "Rates", "MaximumRate"],
      invariants: [
        "Tax + Net sempre é igual a Gross.",
        "A taxa nunca ultrapassa MaximumRate.",
        "Split não altera tesouro nem carteira.",
        "Somente valores confirmados entram em Record."
      ],
      mistakes: [
        ["Cobrar durante preview", "Faz abrir uma tela custar dinheiro. Calculate e Split devem ser puros."],
        ["Registrar antes de concluir", "Uma falha posterior deixa imposto sem transação correspondente."],
        ["Usar ponto flutuante como saldo", "Arredonde na fronteira econômica para manter reconciliação simples."],
        ["Override vindo do cliente", "RateOverride deve ser criado apenas por código confiável do servidor."]
      ],
      tests: [
        "Taxa desconhecida usa DefaultRate.",
        "Taxa acima do teto é limitada.",
        "Valores negativos são recusados.",
        "Gross sempre equivale a Net + Tax.",
        "Split não altera GetTreasury.",
        "ExportState e ImportState preservam o total."
      ],
      example: `local Taxes = require(ServerScriptService.Services.Economy.TaxService)\n\nlocal split = Taxes:Split("AuctionSale", 1000)\nif split.Ok then\n    paySeller(split.Net)\n    Taxes:Record(split.Tax)\nend`
    },
    {
      id: "discount",
      name: "DiscountService",
      label: "Descontos",
      icon: "badge-percent",
      phase: 1,
      risk: "Baixo",
      riskClass: "low",
      role: "Combina benefícios elegíveis sem deixar o preço negativo.",
      question: "Quem decide se o jogador possui o benefício e quem apenas calcula o preço? Elegibilidade e precificação precisam continuar separadas.",
      source: "../../src/ServerScriptService/Services/Economy/DiscountService.luau",
      dependencies: ["EconomySystemsConfig"],
      dependents: ["CraftingCostCalculator", "Shop", "VIPBenefitsService futuro"],
      truth: "O catálogo define regras; o chamador fornece os IDs que o jogador realmente possui.",
      mentalModel: [
        "Um desconto é uma regra de preço, não a prova de um benefício.",
        "Escopos impedem um cupom de loja de afetar crafting ou leilão.",
        "Janelas de tempo tornam campanhas temporárias determinísticas.",
        "O teto global é uma última defesa contra combinações exageradas."
      ],
      flow: [
        ["Receber benefícios", "O serviço consumidor informa IDs já validados, como VIP e Welcome."],
        ["Remover duplicatas", "Cada ID é aplicado no máximo uma vez."],
        ["Filtrar escopo e tempo", "Regras fora do contexto ou expiradas são ignoradas."],
        ["Combinar taxas", "Usa modo multiplicativo ou aditivo configurado."],
        ["Aplicar teto", "MaximumTotalDiscount limita o abatimento total."],
        ["Arredondar preço", "Retorna valor inteiro, desconto total e lista aplicada."]
      ],
      stages: [
        "Definir escopos estáveis usados por todos os consumidores.",
        "Cadastrar descontos permanentes no config.",
        "Implementar filtro de período e remoção de duplicatas.",
        "Escolher e testar StackMode com o time de balanceamento.",
        "Conectar elegibilidade de VIP, evento ou cupom fora deste serviço."
      ],
      methods: [
        ["Register(id, definition)", "Adiciona campanha em runtime.", "boolean"],
        ["Remove(id)", "Retira uma regra do catálogo ativo.", "void"],
        ["IsApplicable(definition, scope, context)", "Valida escopo e janela temporal.", "boolean"],
        ["Calculate(base, ids, scope, context)", "Retorna decomposição do desconto.", "resultado"],
        ["Apply(base, ids, scope, context)", "Atalho que retorna somente o preço final.", "number"]
      ],
      configKeys: ["MaximumTotalDiscount", "StackMode", "Discounts", "Rate", "Scopes", "StartsAt", "EndsAt"],
      invariants: [
        "Preço final nunca é negativo.",
        "Um ID não é acumulado com ele mesmo.",
        "Desconto fora do escopo não afeta o preço.",
        "Elegibilidade nunca é inferida pelo calculador."
      ],
      mistakes: [
        ["Confiar em IDs do cliente", "O servidor precisa montar a lista a partir de dados confiáveis."],
        ["Misturar escopos livres", "Padronize Shop, Crafting e outros nomes para evitar regras silenciosamente ignoradas."],
        ["Somar tudo sem teto", "Campanhas simultâneas podem zerar preços e quebrar a economia."],
        ["Guardar estado do jogador aqui", "O catálogo deve ser compartilhado; benefícios pertencem ao perfil ou serviço VIP."]
      ],
      tests: [
        "Ignora desconto duplicado.",
        "Ignora regra expirada ou ainda não iniciada.",
        "Ignora escopo incompatível.",
        "Respeita teto em modo aditivo.",
        "Respeita teto em modo multiplicativo.",
        "Preço zero continua zero."
      ],
      example: `local Discounts = require(ServerScriptService.Services.Economy.DiscountService)\n\nlocal result = Discounts:Calculate(1000, { "Welcome", "VIP" }, "Shop")\nprint(result.BasePrice, result.DiscountAmount, result.FinalPrice)`
    },
    {
      id: "market-price",
      name: "MarketPriceFluctuationService",
      label: "Mercado dinâmico",
      icon: "chart-line",
      phase: 2,
      risk: "Baixo",
      riskClass: "low",
      role: "Fornece preços variáveis sem assumir a responsabilidade de vender.",
      question: "Como criar movimento perceptível sem permitir inflação infinita nem transformar preço aleatório em punição?",
      source: "../../src/ServerScriptService/Services/Economy/MarketPriceFluctuationService.luau",
      dependencies: ["EventBus", "EconomySystemsConfig"],
      dependents: ["UI de mercado", "Eventos", "EconomyService após integração"],
      truth: "Preços base vivem no config; o estado de runtime guarda somente multiplicadores limitados.",
      mentalModel: [
        "Preço final é preço base multiplicado por um estado pequeno e controlado.",
        "Aleatoriedade precisa de limites para não dominar o balanceamento.",
        "Reversão à média puxa o mercado de volta para o valor normal.",
        "O serviço publica preços; compradores e vendedores decidem quando usá-los."
      ],
      flow: [
        ["Partir de 1.0", "Todos os itens começam exatamente no preço base."],
        ["Sortear passo", "Cada atualização escolhe variação entre -MaximumStep e +MaximumStep."],
        ["Calcular reversão", "Quanto mais longe de 1.0, maior o empurrão de volta."],
        ["Limitar faixa", "MinimumMultiplier e MaximumMultiplier definem o pior e melhor cenário."],
        ["Atualizar snapshot", "Preço unitário é recalculado sob demanda."],
        ["Publicar evento", "Market.PricesUpdated desacopla UI e sistemas consumidores."]
      ],
      stages: [
        "Definir preços base coerentes com ItemConfig.",
        "Escolher limites econômicos antes da aleatoriedade.",
        "Implementar atualização determinística com Random injetável.",
        "Publicar snapshots pelo EventBus.",
        "Decidir explicitamente quais vendas usam mercado e quais usam preço fixo."
      ],
      methods: [
        ["GetMultiplier(itemId)", "Consulta o estado atual do item.", "number?"],
        ["GetPrice(itemId, amount)", "Calcula preço atual para uma quantidade.", "number?"],
        ["UpdateNow()", "Avança todos os itens e publica evento.", "snapshot parcial"],
        ["SetMultiplier(itemId, value)", "Aplica override limitado para eventos.", "boolean"],
        ["GetSnapshot()", "Lista base, multiplicador e preço atual.", "table"],
        ["Start() / Destroy()", "Controla o ciclo periódico.", "void"]
      ],
      configKeys: ["UpdateInterval", "MaximumStep", "MinimumMultiplier", "MaximumMultiplier", "ReversionStrength", "Items"],
      invariants: [
        "Multiplicador sempre permanece dentro da faixa.",
        "Preço base nunca é mutado em runtime.",
        "Consultar preço não atualiza o mercado.",
        "Item não configurado não recebe preço inventado."
      ],
      mistakes: [
        ["Aleatoriedade sem reversão", "O mercado gruda nos extremos e parece manipulado."],
        ["Atualizar rápido demais", "O jogador não consegue reagir e a UI vira ruído."],
        ["Duplicar ItemConfig sem processo", "Preços base podem divergir. Defina qual config é canônico ou gere um a partir do outro."],
        ["Conectar à venda silenciosamente", "Mudança de preço precisa ser visível antes de afetar o pagamento."]
      ],
      tests: [
        "Começa com multiplicador 1.0.",
        "Nunca ultrapassa os limites após muitas atualizações.",
        "Random injetado produz sequência reproduzível.",
        "Item desconhecido retorna nil.",
        "Quantidade multiplica o preço unitário corretamente.",
        "UpdateNow publica um snapshot completo."
      ],
      example: `local Market = require(ServerScriptService.Services.Economy.MarketPriceFluctuationService)\n\nlocal unitPrice = Market:GetPrice("CottonFabric", 1)\nlocal batchPrice = Market:GetPrice("CottonFabric", 10)\nprint(unitPrice, batchPrice)`
    },
    {
      id: "crafting-cost",
      name: "CraftingCostCalculator",
      label: "Custos de crafting",
      icon: "calculator",
      phase: 2,
      risk: "Baixo",
      riskClass: "low",
      role: "Produz uma cotação de materiais e moedas sem consumir recursos.",
      question: "Quais partes de crafting são cálculo puro e quais exigem uma transação com rollback? Este módulo resolve somente a primeira parte.",
      source: "../../src/ServerScriptService/Services/Economy/CraftingCostCalculator.luau",
      dependencies: ["InventoryService", "CurrencyExchangeService", "DiscountService"],
      dependents: ["CraftingService futuro", "CraftingQueueService futuro", "UI de receitas"],
      truth: "Receitas vivem no config; inventário e carteira continuam donos das quantidades reais.",
      mentalModel: [
        "Cotação é uma fotografia do custo, não uma reserva.",
        "Materiais e moedas são recursos diferentes e devem aparecer separados.",
        "Descontos reduzem custo monetário, não a quantidade física da receita.",
        "O executor futuro deve recalcular ou validar a cotação no momento do craft."
      ],
      flow: [
        ["Encontrar receita", "O ID precisa existir em Recipes."],
        ["Normalizar quantidade", "Crafts fracionários ou zero são recusados."],
        ["Escalar materiais", "Cada input é multiplicado pela quantidade solicitada."],
        ["Escalar moedas", "Custos monetários são calculados separadamente."],
        ["Aplicar descontos", "Somente o escopo Crafting recebe benefícios compatíveis."],
        ["Comparar recursos", "GetMissing consulta inventário e carteira sem consumir nada."]
      ],
      stages: [
        "Modelar receitas com Inputs e CurrencyCosts.",
        "Implementar Calculate sem dependências mutáveis.",
        "Conectar DiscountService somente aos custos monetários.",
        "Implementar GetMissing e CanAfford.",
        "Criar executor transacional separado antes de liberar crafting remoto."
      ],
      methods: [
        ["Calculate(recipeId, quantity, context)", "Monta a cotação completa.", "resultado"],
        ["GetMissing(player, quote)", "Lista materiais e moedas ausentes.", "table"],
        ["CanAfford(player, quote)", "Atalho para ausência de faltas.", "boolean"]
      ],
      configKeys: ["Recipes", "Inputs", "CurrencyCosts"],
      invariants: [
        "Calculate nunca remove item ou moeda.",
        "Quantidade de receita é inteira e positiva.",
        "Materiais não recebem desconto monetário.",
        "CanAfford reflete exatamente GetMissing."
      ],
      mistakes: [
        ["Consumir no calculador", "A UI chama previews várias vezes e destruiria recursos."],
        ["Confiar em cotação antiga", "Saldo ou config pode mudar. Revalide no executor."],
        ["Dar desconto em material", "Muda a receita física e cria arredondamentos inesperados."],
        ["Craft parcial silencioso", "A execução deve ser tudo-ou-nada ou declarar explicitamente lotes parciais."]
      ],
      tests: [
        "Receita desconhecida é recusada.",
        "Quantidade zero e negativa são recusadas.",
        "Materiais escalam para múltiplas unidades.",
        "VIP afeta moeda mas não materiais.",
        "GetMissing reporta diferenças exatas.",
        "Calculate não altera inventário ou carteira."
      ],
      example: `local Costs = require(ServerScriptService.Services.Economy.CraftingCostCalculator)\n\nlocal quote = Costs:Calculate("CottonFabric", 3, {\n    DiscountIds = { "VIP" },\n})\n\nif quote.Ok and Costs:CanAfford(player, quote) then\n    print("Pronto para executar o craft")\nend`
    },
    {
      id: "resource-gathering",
      name: "ResourceGatheringService",
      label: "Coleta de recursos",
      icon: "pickaxe",
      phase: 3,
      risk: "Alto",
      riskClass: "high",
      role: "Valida no servidor a coleta de nós genéricos do mapa.",
      question: "Que fatos o servidor consegue provar sobre a coleta sem confiar no cliente: nó, distância, cooldown, rendimento e capacidade?",
      source: "../../src/ServerScriptService/Services/Economy/ResourceGatheringService.luau",
      dependencies: ["CollectionService", "InventoryService", "EventBus"],
      dependents: ["Mineração futura", "Recursos de mapa", "Analytics"],
      truth: "O servidor registra nós por tag e atributo; o InventoryService decide quanto realmente cabe.",
      mentalModel: [
        "O cliente pede uma ação; nunca declara o prêmio recebido.",
        "O objeto do mapa e o config juntos definem qual recurso existe.",
        "Cooldown começa apenas depois de uma coleta aceita.",
        "Algodão fica fora deste módulo porque CottonService já possui regras especializadas."
      ],
      flow: [
        ["Registrar nó", "A tag GatherableResource e ResourceId ligam mapa e config."],
        ["Validar existência", "O objeto precisa estar registrado e dentro do DataModel."],
        ["Validar distância", "HumanoidRootPart deve estar dentro de MaximumDistance."],
        ["Validar cooldown", "O relógio do servidor decide se o nó está disponível."],
        ["Sortear rendimento", "Random do servidor escolhe entre MinYield e MaxYield."],
        ["Adicionar ao inventário", "Somente quantidade aceita é retornada e publicada no EventBus."]
      ],
      stages: [
        "Manter Resources vazio enquanto nenhum recurso genérico for necessário.",
        "Adicionar item ao ItemConfig antes de configurar um ResourceId.",
        "Marcar modelos com tag e atributo no Studio.",
        "Conectar prompts ou ferramentas a Gather somente no servidor.",
        "Adicionar feedback visual de cooldown sem torná-lo autoridade."
      ],
      methods: [
        ["RegisterNode(instance, resourceId)", "Associa uma instância a uma regra.", "boolean"],
        ["UnregisterNode(instance)", "Remove o nó do índice interno.", "void"],
        ["Gather(player, instance)", "Valida e concede o recurso.", "resultado"],
        ["Start()", "Descobre tags atuais e observa novas.", "void"],
        ["Destroy()", "Desconecta sinais e limpa índices.", "void"]
      ],
      configKeys: ["NodeTag", "MaximumDistance", "Resources", "ItemId", "MinYield", "MaxYield", "Cooldown"],
      invariants: [
        "Rendimento nunca vem do cliente.",
        "Nó fora do alcance não concede item.",
        "Inventário cheio não inicia cooldown.",
        "CottonService continua único dono da colheita de algodão."
      ],
      mistakes: [
        ["Ativar RawCotton aqui", "Duplicaria o caminho de colheita já protegido pelo CottonService."],
        ["Confiar no prompt", "Prompts são UX; distância e cooldown ainda precisam ser verificados no servidor."],
        ["Configurar item inexistente", "InventoryService aceita apenas IDs presentes em ItemConfig."],
        ["Cooldown só no cliente", "Exploradores podem ignorar a interface e chamar o fluxo repetidamente."]
      ],
      tests: [
        "Nó sem config não registra.",
        "Jogador distante é recusado.",
        "Segunda coleta durante cooldown é recusada.",
        "Inventário cheio não consome o nó.",
        "Rendimento fica entre mínimo e máximo.",
        "Remover tag torna o nó inválido."
      ],
      example: `-- Primeiro adicione a regra em EconomySystemsConfig.ResourceGathering.Resources\n-- e o ItemId correspondente em ItemConfig.\n\nlocal Gathering = require(ServerScriptService.Services.Economy.ResourceGatheringService)\n\nGathering:RegisterNode(workspace.IronNode, "IronOre")\nlocal result = Gathering:Gather(player, workspace.IronNode)`
    },
    {
      id: "sell-all",
      name: "SellAllService",
      label: "Venda em massa",
      icon: "package-check",
      phase: 3,
      risk: "Médio",
      riskClass: "medium",
      role: "Adiciona perfis de venda sem recriar a economia existente.",
      question: "Que comportamento realmente é novo? Se SellProducts já vende tudo, este serviço deve apenas selecionar e delegar.",
      source: "../../src/ServerScriptService/Services/Economy/SellAllService.luau",
      dependencies: ["EconomyService", "InventoryService", "ItemConfig"],
      dependents: ["Botão vender tudo", "Automação VIP futura", "Zonas de venda"],
      truth: "EconomyService continua dono da remoção, multiplicador de venda e crédito em Cash.",
      mentalModel: [
        "Venda em massa é uma política de seleção, não outra implementação de venda.",
        "Perfis respondem o que vender e quanto preservar.",
        "Preview deve informar sem reservar ou remover itens.",
        "Cada venda real passa por EconomyService:SellItem ou SellProducts."
      ],
      flow: [
        ["Escolher perfil", "Default ou outro perfil configurado define a seleção."],
        ["Ler inventário", "Calcula disponível menos KeepAmounts."],
        ["Montar preview", "Lista itens, quantidade e valor base sem mutação."],
        ["Detectar delegação", "Default chama SellProducts porque coincide com o fluxo atual."],
        ["Vender seleção", "Perfis especiais chamam SellItem para cada quantidade calculada."],
        ["Somar resultado", "Resposta agrega itens, quantidade e payout efetivamente vendidos."]
      ],
      stages: [
        "Manter Default delegado ao EconomyService atual.",
        "Criar perfis apenas para comportamentos realmente diferentes.",
        "Usar KeepAmounts para reservas, não lógica espalhada pela UI.",
        "Exibir Preview antes da confirmação quando o valor for relevante.",
        "Aplicar rate limit no RemoteFunction que chamar Sell."
      ],
      methods: [
        ["Preview(player, profileId)", "Calcula seleção e valor base.", "resultado"],
        ["Sell(player, profileId)", "Delega vendas e agrega o resultado.", "resultado"]
      ],
      configKeys: ["Profiles", "DelegateToExisting", "ItemIds", "KeepAmounts"],
      invariants: [
        "O serviço nunca credita Cash diretamente.",
        "O perfil Default não duplica SellProducts.",
        "Quantidade reservada nunca é vendida.",
        "Payout retornado é a soma dos resultados reais."
      ],
      mistakes: [
        ["Copiar SellItem", "Duplica skill multiplier, validações e correções futuras."],
        ["Usar BaseValue como payout", "Preview é base; EconomyService aplica o multiplicador real."],
        ["Seleção controlada pelo cliente", "ProfileId pode vir do cliente, mas a lista de itens precisa ficar no servidor."],
        ["Assumir transação global", "Perfis especiais vendem item a item; documente se sucesso parcial é aceitável."]
      ],
      tests: [
        "Default produz o mesmo resultado de SellProducts.",
        "KeepAmounts preserva a quantidade configurada.",
        "Perfil desconhecido é recusado.",
        "Inventário vazio retorna NoProducts.",
        "Payout agrega somente vendas bem-sucedidas.",
        "Preview não altera inventário ou Cash."
      ],
      example: `local SellAll = require(ServerScriptService.Services.Economy.SellAllService)\n\nlocal preview = SellAll:Preview(player, "Default")\nif preview.Ok then\n    local result = SellAll:Sell(player, "Default")\n    print(result.Amount, result.Payout)\nend`
    },
    {
      id: "bank",
      name: "BankService",
      label: "Banco",
      icon: "landmark",
      phase: 4,
      risk: "Médio",
      riskClass: "medium",
      role: "Move valor entre carteira e conta bancária e acumula juros.",
      question: "Quando o juro deve ser calculado e como impedir que tempo offline ou chamadas repetidas criem dinheiro sem limite?",
      source: "../../src/ServerScriptService/Services/Economy/BankService.luau",
      dependencies: ["CurrencyExchangeService", "TaxService"],
      dependents: ["UI bancária", "Metas de poupança", "Analytics"],
      truth: "A conta bancária é estado próprio exportável; a carteira continua no CurrencyExchangeService.",
      mentalModel: [
        "Depósito é débito da carteira seguido de crédito na conta.",
        "Saque é crédito da carteira seguido de débito da conta.",
        "Juro sob demanda substitui um loop por jogador.",
        "O período offline máximo limita tanto abuso quanto erros de relógio."
      ],
      flow: [
        ["Carregar conta", "Cria estado vazio ou importa o save do jogador."],
        ["Atualizar juros", "Calcula horas desde LastAccruedAt com limite offline."],
        ["Tributar juros", "TaxService divide o ganho antes de somá-lo à conta."],
        ["Validar operação", "Mínimo, saldo e MaximumBalance são verificados."],
        ["Mover valor", "CurrencyExchangeService altera a carteira e a conta muda em seguida."],
        ["Exportar estado", "Balance e LastAccruedAt seguem para o save existente."]
      ],
      stages: [
        "Definir moeda, limites e taxa por hora.",
        "Implementar conta e juros sob demanda.",
        "Implementar depósito e saque com adaptador de carteira.",
        "Conectar ImportPlayer antes de liberar operações.",
        "Conectar ExportPlayer ao save no fechamento e em checkpoints."
      ],
      methods: [
        ["Deposit(player, amount)", "Move carteira para banco.", "resultado"],
        ["Withdraw(player, amount)", "Move banco para carteira.", "resultado"],
        ["GetSnapshot(player)", "Atualiza juros e retorna estado público.", "table"],
        ["ExportPlayer(player)", "Produz estado serializável atualizado.", "table"],
        ["ImportPlayer(player, state)", "Restaura e limita uma conta.", "boolean"]
      ],
      configKeys: ["Currency", "MinimumTransaction", "MaximumBalance", "InterestRatePerHour", "MaximumOfflineHours"],
      invariants: [
        "Depósito não cria valor entre carteira e conta.",
        "Conta nunca fica negativa ou acima do máximo.",
        "Juros usam apenas o intervalo ainda não processado.",
        "Importação limita dados fora da faixa válida."
      ],
      mistakes: [
        ["Não importar o save", "A primeira consulta cria conta zero e pode sobrescrever progresso legítimo."],
        ["Juro em loop por jogador", "Escala mal e cria problemas de precisão. Calcule quando necessário."],
        ["Sem limite offline", "Uma taxa alterada pode gerar saldo gigantesco em contas antigas."],
        ["Remote direto no método", "Valide formato e aplique rate limit antes de Deposit ou Withdraw."]
      ],
      tests: [
        "Depósito reduz carteira e aumenta banco pelo mesmo valor.",
        "Saque insuficiente é recusado sem alterar carteira.",
        "Juro é aplicado uma única vez por intervalo.",
        "Período offline respeita o máximo.",
        "Imposto de juros entra no tesouro.",
        "Exportar e importar preserva saldo e relógio."
      ],
      example: `local Bank = require(ServerScriptService.Services.Economy.BankService)\n\nlocal deposit = Bank:Deposit(player, 500)\nif deposit.Ok then\n    print("Saldo bancário:", deposit.Balance)\nend\n\nlocal snapshot = Bank:GetSnapshot(player)`
    },
    {
      id: "loan",
      name: "LoanService",
      label: "Empréstimos",
      icon: "hand-coins",
      phase: 4,
      risk: "Alto",
      riskClass: "high",
      role: "Cria contratos de dívida com juros, vencimento e pagamento parcial.",
      question: "Quais estados tornam um contrato auditável e como garantir que crédito, dívida e pagamento nunca se desencontrem?",
      source: "../../src/ServerScriptService/Services/Economy/LoanService.luau",
      dependencies: ["CurrencyExchangeService", "HttpService"],
      dependents: ["UI de crédito", "Benefícios VIP futuros", "Progressão financeira"],
      truth: "Cada contrato mantém principal, saldo, criação, vencimento, último cálculo e estado; a carteira só recebe ou paga valores.",
      mentalModel: [
        "Um empréstimo é um contrato persistente, não apenas um crédito de Cash.",
        "Principal explica a origem; Balance representa o que ainda é devido.",
        "Juros são atualizados antes de consultar ou pagar.",
        "Vencimento sinaliza risco, mas não apaga nem duplica a dívida."
      ],
      flow: [
        ["Validar elegibilidade", "Limite de contratos, principal e duração são conferidos."],
        ["Creditar carteira", "O contrato só é criado se o crédito for aceito."],
        ["Criar contrato", "GUID e timestamps tornam o empréstimo identificável."],
        ["Acumular juros", "Balance cresce de acordo com horas ainda não processadas."],
        ["Receber pagamento", "Valor é limitado ao saldo devido e debitado da carteira."],
        ["Encerrar", "Saldo menor que uma unidade vira zero e State passa para Paid."]
      ],
      stages: [
        "Definir política de principal, prazo e quantidade aberta.",
        "Criar contrato serializável com ID e timestamps.",
        "Implementar juros sob demanda e snapshots.",
        "Implementar pagamento parcial e quitação.",
        "Persistir contratos antes de expor Borrow ao jogador."
      ],
      methods: [
        ["Borrow(player, principal, hours)", "Credita e abre um contrato.", "resultado"],
        ["Repay(player, loanId, amount)", "Atualiza juros e paga parte ou tudo.", "resultado"],
        ["GetLoans(player)", "Retorna snapshots atualizados.", "table"],
        ["ExportPlayer(player)", "Serializa contratos internos.", "table"],
        ["ImportPlayer(player, state)", "Restaura contratos validados.", "boolean"]
      ],
      configKeys: ["Currency", "MinimumPrincipal", "MaximumPrincipal", "InterestRatePerHour", "MaximumDurationHours", "MaximumOpenLoans"],
      invariants: [
        "Contrato só existe depois que o crédito foi aceito.",
        "Pagamento nunca ultrapassa a dívida atual.",
        "Contrato pago nunca volta a acumular juros.",
        "Cada contrato possui ID único."
      ],
      mistakes: [
        ["Liberar sem persistência", "Reconectar apagaria a dívida e manteria o dinheiro creditado."],
        ["Usar os.time do cliente", "Criação, juros e vencimento pertencem ao relógio do servidor."],
        ["Permitir principal arbitrário", "Valores precisam de limites e futura regra de elegibilidade."],
        ["Apagar contratos pagos", "Manter histórico facilita suporte, auditoria e análise de comportamento."]
      ],
      tests: [
        "Recusa segundo contrato acima do limite.",
        "Recusa principal e duração fora da faixa.",
        "Borrow credita exatamente o principal.",
        "Repay recusa carteira insuficiente.",
        "Pagamento excedente é limitado ao saldo.",
        "Contrato importado continua juros sem duplicar intervalo."
      ],
      example: `local Loans = require(ServerScriptService.Services.Economy.LoanService)\n\nlocal result = Loans:Borrow(player, 2000, 24)\nif result.Ok then\n    local payment = Loans:Repay(player, result.Loan.Id, 500)\n    print(payment.Loan.Balance)\nend`
    },
    {
      id: "auction-house",
      name: "AuctionHouseService",
      label: "Casa de leilões",
      icon: "gavel",
      phase: 5,
      risk: "Alto",
      riskClass: "high",
      role: "Coordena custódia de item, reserva de lance, entrega e pagamento.",
      question: "Onde ficam item e dinheiro durante cada estado do leilão? Se a resposta não for explícita, há risco de perda ou duplicação.",
      source: "../../src/ServerScriptService/Services/Economy/AuctionHouseService.luau",
      dependencies: ["InventoryService", "CurrencyExchangeService", "TaxService", "EventBus", "HttpService"],
      dependents: ["UI de leilões", "Notificações", "Analytics", "Persistência"],
      truth: "Itens listados e maior lance ficam em custódia lógica do serviço até cancelar, expirar, vender ou aguardar coleta.",
      mentalModel: [
        "Leilão é uma máquina de estados com dois escrows: item e dinheiro.",
        "O item sai do vendedor antes de a listagem se tornar visível.",
        "Cada novo lance reserva dinheiro e devolve o lance anterior.",
        "Entrega ao vencedor acontece antes do pagamento ao vendedor."
      ],
      flow: [
        ["Criar listagem", "Valida limites e remove o item para custódia."],
        ["Receber lance", "Valida prazo, incremento, identidade e saldo."],
        ["Trocar reserva", "Debita o novo vencedor e reembolsa o anterior."],
        ["Encerrar prazo", "Um loop curto identifica listagens vencidas."],
        ["Entregar item", "Inventário cheio gera AwaitingClaim e mantém o acerto pendente."],
        ["Pagar vendedor", "Depois da entrega, aplica imposto e credita o valor líquido."]
      ],
      stages: [
        "Desenhar estados e posse de cada ativo em papel.",
        "Implementar criação e cancelamento com custódia do item.",
        "Implementar lance e reembolso da reserva anterior.",
        "Implementar Settle e AwaitingClaim com rollback parcial.",
        "Adicionar persistência e política de desconexão antes de produção."
      ],
      methods: [
        ["CreateListing(player, item, amount, bid, duration)", "Move item para custódia e cria GUID.", "resultado"],
        ["GetMinimumBid(listing)", "Calcula próximo lance válido.", "number"],
        ["PlaceBid(player, id, amount)", "Reserva novo lance e reembolsa anterior.", "resultado"],
        ["Settle(id)", "Expira ou conclui uma venda vencida.", "resultado"],
        ["ClaimWonItem(player, id)", "Repete entrega quando havia inventário cheio.", "resultado"],
        ["CancelListing(player, id)", "Devolve item se ainda não há lance.", "resultado"],
        ["GetListing(id) / GetActiveListings()", "Retorna snapshots sem referências mutáveis.", "table"],
        ["Start() / Destroy()", "Controla o ciclo de encerramento.", "void"]
      ],
      configKeys: ["Currency", "MinimumBid", "MinimumIncrementRate", "MinimumDuration", "MaximumDuration", "MaxActiveListingsPerPlayer", "SettlementInterval"],
      invariants: [
        "Item ativo não permanece no inventário do vendedor.",
        "Apenas o maior lance continua reservado.",
        "Vendedor não pode dar lance na própria listagem.",
        "Vendedor só recebe depois da entrega integral do item."
      ],
      mistakes: [
        ["Produção sem persistência", "Servidor fechando pode perder listagem, item e reserva. O estado atual é adequado a protótipo de sessão."],
        ["Entrega parcial", "Inventory:AddItem pode aceitar menos; reverta a parte aceita antes de tentar novamente."],
        ["Ignorar desconexão", "Defina cancelamento ou persistência para vendedor e vencedor que saem do servidor."],
        ["Expor tabelas internas", "Snapshots evitam que outro módulo altere State ou HighestBid por referência."]
      ],
      tests: [
        "Criar listagem remove exatamente o item anunciado.",
        "Lance baixo, tardio e do vendedor são recusados.",
        "Novo lance reembolsa integralmente o anterior.",
        "Sem lances, o item volta ao vendedor.",
        "Inventário cheio do vencedor mantém AwaitingClaim sem pagar vendedor.",
        "Venda concluída entrega item, paga líquido e registra imposto.",
        "Cancelamento após lance é recusado.",
        "Rollback de entrega parcial não duplica item."
      ],
      example: `local Auctions = require(ServerScriptService.Services.Economy.AuctionHouseService)\n\nlocal created = Auctions:CreateListing(player, "CottonFabric", 5, 100, 600)\nif created.Ok then\n    local listingId = created.Listing.Id\n    Auctions:PlaceBid(otherPlayer, listingId, 120)\nend`
    },
    {
      id: "gifting",
      name: "GiftingService",
      label: "Presentes",
      icon: "gift",
      phase: 6,
      risk: "Médio",
      riskClass: "medium",
      role: "Transfere moeda ou itens como presente unilateral com limites e rollback.",
      question: "Como permitir generosidade sem transformar presentes em duplicação, lavagem de moeda ou um segundo sistema de trade?",
      source: "../../src/ServerScriptService/Services/Economy/GiftingService.luau",
      dependencies: ["CurrencyExchangeService", "InventoryService", "TaxService", "EventBus"],
      dependents: ["UI social", "WalletHistoryService", "Analytics"],
      truth: "Carteira e inventário continuam donos dos ativos; GiftingService guarda somente limites de atividade.",
      mentalModel: [
        "Presente é uma transferência unilateral; não possui oferta da contraparte.",
        "O servidor escolhe itens permitidos, limites e imposto aplicável.",
        "Débito vem antes do crédito e qualquer falha exige rollback.",
        "Limite diário precisa sobreviver à reconexão para ser efetivo."
      ],
      flow: [
        ["Validar participantes", "Impede auto presente e destinatário inválido."],
        ["Aplicar limites", "Cooldown, mínimo, máximo e total diário são conferidos."],
        ["Reservar ativo", "Remove moeda ou item do remetente."],
        ["Entregar", "Credita apenas o líquido ou a quantidade integral."],
        ["Reverter falha", "Saldo ou item volta ao remetente se o destinatário não puder receber."],
        ["Registrar", "Atualiza atividade e publica evento de domínio."]
      ],
      stages: [
        "Definir moedas e itens presenteáveis no config.",
        "Implementar limites por operação e por dia.",
        "Implementar moeda com imposto e rollback.",
        "Implementar item com tratamento de entrega parcial.",
        "Persistir atividade diária antes de liberar o RemoteFunction."
      ],
      methods: [
        ["GiftCurrency(sender, recipient, amount)", "Transfere moeda com imposto opcional.", "resultado"],
        ["GiftItem(sender, recipient, itemId, amount)", "Transfere item permitido integralmente.", "resultado"],
        ["GetRemainingDailyCurrency(player)", "Consulta limite diário restante.", "number"],
        ["ExportPlayer() / ImportPlayer()", "Persiste atividade e cooldown.", "table / boolean"]
      ],
      configKeys: ["Currency", "MinimumCurrencyAmount", "MaximumCurrencyAmount", "DailyCurrencyLimit", "CooldownSeconds", "AllowedItems", "ApplyGiftTax"],
      invariants: [
        "Remetente e destinatário nunca são a mesma conta.",
        "Falha de entrega devolve integralmente o ativo.",
        "Item não permitido nunca sai do inventário.",
        "Presente não cria uma transação bilateral escondida."
      ],
      mistakes: [
        ["Reutilizar TradeService", "Trade exige confirmação dos dois lados; presente é outra máquina de estados."],
        ["Limite só em memória", "Reconectar reinicia o dia e permite contornar controles."],
        ["Entrega parcial aceita", "Parte do item pode sumir ou duplicar; reverta antes de responder."],
        ["Destinatário escolhido pelo cliente sem validação", "Resolva o Player no servidor e bloqueie auto presente."]
      ],
      tests: [
        "Recusa auto presente e destinatário inválido.",
        "Respeita cooldown e limite diário.",
        "Rollback restaura saldo quando crédito falha.",
        "Inventário cheio restaura todos os itens.",
        "Imposto é registrado apenas após sucesso.",
        "Importação preserva o total enviado no dia."
      ],
      example: `local Gifting = require(ServerScriptService.Services.Economy.GiftingService)\n\nlocal result = Gifting:GiftCurrency(sender, recipient, 500)\nif not result.Ok then\n    warn(result.Error)\nend`
    },
    {
      id: "wallet-history",
      name: "WalletHistoryService",
      label: "Histórico da carteira",
      icon: "history",
      phase: 6,
      risk: "Baixo",
      riskClass: "low",
      role: "Observa ajustes de saldo e oferece histórico limitado, filtrável e paginado.",
      question: "Como obter auditoria útil sem permitir que o histórico se torne outro caminho para movimentar dinheiro?",
      source: "../../src/ServerScriptService/Services/Economy/WalletHistoryService.luau",
      dependencies: ["EventBus", "CurrencyExchangeService"],
      dependents: ["Suporte", "UI de extrato", "Analytics", "RefundService"],
      truth: "O histórico é projeção dos eventos Wallet.BalanceAdjusted; nunca é fonte de saldo.",
      mentalModel: [
        "Ledger de leitura explica mudanças, mas não reconstrói automaticamente a carteira.",
        "Motivo e referência tornam uma variação auditável.",
        "Retenção limitada protege memória e payload.",
        "Paginação e filtros pertencem ao servidor para não enviar tudo ao cliente."
      ],
      flow: [
        ["Receber evento", "CurrencyExchangeService publica delta, saldo, motivo e referência."],
        ["Clonar entrada", "Evita que metadados sejam alterados por referência."],
        ["Aplicar retenção", "Entradas mais antigas saem ao ultrapassar o teto."],
        ["Filtrar", "Moeda e motivo reduzem o conjunto consultado."],
        ["Paginar", "Offset e PageSize limitam a resposta."],
        ["Exportar", "O save pode preservar o recorte recente do extrato."]
      ],
      stages: [
        "Publicar eventos em toda mutação de carteira.",
        "Assinar o EventBus sem acoplar aos produtores.",
        "Aplicar retenção por jogador.",
        "Implementar filtros e paginação defensivos.",
        "Definir política de persistência e privacidade do histórico."
      ],
      methods: [
        ["Record(change)", "Adiciona uma entrada validada.", "boolean"],
        ["GetHistory(player, options)", "Filtra e pagina do mais novo ao antigo.", "page"],
        ["ExportPlayer() / ImportPlayer()", "Serializa o recorte retido.", "table / boolean"],
        ["Start() / Destroy()", "Controla assinatura do EventBus.", "void"]
      ],
      configKeys: ["MaximumEntriesPerPlayer", "DefaultPageSize", "MaximumPageSize"],
      invariants: [
        "O histórico nunca altera saldo.",
        "O número de entradas nunca ultrapassa o teto.",
        "Falha de rede não inventa transação.",
        "Snapshots retornados não expõem tabelas internas."
      ],
      mistakes: [
        ["Registrar só módulos novos", "Vendas e upgrades antigos somem do extrato; todos devem usar o adaptador."],
        ["Guardar Player", "Use UserId para evitar retenção de instâncias após saída."],
        ["Enviar o histórico inteiro", "Paginação limita custo e exposição."],
        ["Usar histórico como saldo", "Ele pode ter retenção; a carteira continua canônica."]
      ],
      tests: [
        "Venda, upgrade e presente geram motivos distintos.",
        "Retenção remove somente as entradas mais antigas.",
        "Filtro de moeda e motivo funciona em conjunto.",
        "PageSize é limitado pelo config.",
        "Exportar e importar preserva ordem.",
        "Consultar não altera entradas."
      ],
      example: `local History = require(ServerScriptService.Services.Economy.WalletHistoryService)\n\nlocal page = History:GetHistory(player, {\n    Currency = "Cash",\n    PageSize = 20,\n})`
    },
    {
      id: "vip-benefits",
      name: "VIPBenefitsService",
      label: "Benefícios VIP",
      icon: "crown",
      phase: 7,
      risk: "Baixo",
      riskClass: "low",
      role: "Centraliza multiplicadores e descontos VIP sem processar a compra do benefício.",
      question: "Como impedir condicionais VIP espalhadas e ainda deixar o GamepassService existente como autoridade de elegibilidade?",
      source: "../../src/ServerScriptService/Services/Economy/VIPBenefitsService.luau",
      dependencies: ["GamepassService existente", "DiscountService", "EconomySystemsConfig"],
      dependents: ["Venda", "Coleta", "Banco", "Crafting"],
      truth: "O resolver decide quem é VIP; o config decide quais benefícios esse estado concede.",
      mentalModel: [
        "Elegibilidade e efeito são responsabilidades diferentes.",
        "Não VIP recebe valores neutros, como multiplicador 1.",
        "IDs de desconto conectam VIP ao DiscountService sem duplicar preço.",
        "Um único catálogo evita bônus divergentes entre sistemas."
      ],
      flow: [
        ["Resolver elegibilidade", "Usa função injetada ou atributo local."],
        ["Ler catálogo", "Benefícios ficam em EconomySystemsConfig."],
        ["Retornar neutro", "Jogadores sem VIP recebem fallback do consumidor."],
        ["Aplicar multiplicador", "O sistema de gameplay mantém sua fórmula original."],
        ["Fornecer descontos", "IDs são enviados ao DiscountService."],
        ["Trocar origem", "SetEligibilityResolver conecta o GamepassService real."]
      ],
      stages: [
        "Definir catálogo de benefícios e valores neutros.",
        "Conectar o resolver ao GamepassService existente.",
        "Substituir condicionais VIP por GetValue.",
        "Conectar DiscountIds ao cálculo de preço.",
        "Testar remoção do benefício durante a sessão."
      ],
      methods: [
        ["SetEligibilityResolver(resolver)", "Liga a autoridade VIP existente.", "void"],
        ["IsVIP(player)", "Consulta elegibilidade com fallback.", "boolean"],
        ["GetBenefits(player)", "Retorna snapshot do catálogo ativo.", "table"],
        ["GetValue(player, id, fallback)", "Obtém benefício ou valor neutro.", "any"],
        ["GetDiscountIds(player)", "Lista descontos VIP aplicáveis.", "table"],
        ["ApplyMultiplier(player, id, value)", "Aplica um multiplicador numérico.", "number"]
      ],
      configKeys: ["PlayerAttribute", "Benefits", "SaleMultiplier", "GatherMultiplier", "BankInterestMultiplier", "DiscountIds"],
      invariants: [
        "O serviço nunca concede VIP por conta própria.",
        "Não VIP recebe comportamento econômico neutro.",
        "Catálogo retornado não permite mutar o config.",
        "Compra e verificação permanecem no GamepassService."
      ],
      mistakes: [
        ["Verificar passe em cada sistema", "Duplica chamadas e regras de elegibilidade."],
        ["Misturar compra e benefício", "Falha de compra não deve viver no catálogo de efeitos."],
        ["Fallback zero para multiplicador", "Pode zerar produção; use 1 como neutro."],
        ["Confiar em atributo do cliente", "Atributos de elegibilidade devem ser definidos pelo servidor."]
      ],
      tests: [
        "Resolver verdadeiro retorna catálogo VIP.",
        "Resolver falso retorna fallbacks neutros.",
        "Erro no resolver usa fallback seguro.",
        "DiscountIds retorna uma cópia.",
        "Multiplicador aplica somente ao elegível.",
        "Trocar resolver altera a fonte sem reiniciar módulo."
      ],
      example: `local VIP = require(ServerScriptService.Services.Economy.VIPBenefitsService)\n\nVIP:SetEligibilityResolver(function(player)\n    return GamepassService:IsVIP(player)\nend)\n\nlocal payout = VIP:ApplyMultiplier(player, "SaleMultiplier", basePayout)`
    },
    {
      id: "subscription",
      name: "SubscriptionService",
      label: "Assinaturas",
      icon: "calendar-sync",
      phase: 7,
      risk: "Médio",
      riskClass: "medium",
      role: "Mantém direitos temporários por plano após uma compra ou concessão já confirmada.",
      question: "Onde termina a plataforma de pagamento e começa o contrato de gameplay que precisa sobreviver a sessões?",
      source: "../../src/ServerScriptService/Services/Economy/SubscriptionService.luau",
      dependencies: ["EventBus", "Compra verificada", "PlayerDataService"],
      dependents: ["Benefícios recorrentes", "UI de assinatura", "Analytics"],
      truth: "O contrato importado guarda início, fim e estado; o pagamento permanece fora do módulo.",
      mentalModel: [
        "Ativação é consequência de uma compra validada, não o processo de compra.",
        "Renovar estende o período vigente em vez de substituir dias restantes.",
        "Cancelar desliga renovação, mas preserva o direito até o fim.",
        "Revogar encerra imediatamente e exige motivo confiável."
      ],
      flow: [
        ["Receber confirmação", "Um adaptador confiável chama Activate."],
        ["Validar plano", "Duração e benefícios vêm do config."],
        ["Criar ou renovar", "EndsAt parte do fim atual quando ainda ativo."],
        ["Consultar direito", "IsActive compara relógio do servidor e estado."],
        ["Processar expiração", "Loop leve e consultas atualizam contratos vencidos."],
        ["Persistir", "Importação e exportação preservam o contrato entre sessões."]
      ],
      stages: [
        "Definir planos e benefícios internos.",
        "Criar contrato serializável e renovação acumulativa.",
        "Implementar cancelamento, revogação e expiração.",
        "Conectar ativação ao callback de compra verificada.",
        "Persistir antes de conceder benefícios recorrentes."
      ],
      methods: [
        ["Activate(player, planId, options)", "Cria ou renova um contrato.", "resultado"],
        ["Get(player, planId) / IsActive()", "Consulta estado e validade.", "snapshot / boolean"],
        ["Cancel(player, planId)", "Desliga renovação sem cortar período.", "resultado"],
        ["Revoke(player, planId, reason)", "Encerra imediatamente.", "resultado"],
        ["GetActiveBenefits(player)", "Agrega benefícios dos planos ativos.", "table"],
        ["ExportPlayer() / ImportPlayer()", "Persiste contratos.", "table / boolean"]
      ],
      configKeys: ["RenewalGraceSeconds", "Plans", "DurationSeconds", "Benefits"],
      invariants: [
        "Activate nunca presume que houve pagamento.",
        "Renovação não perde tempo já comprado.",
        "Contrato expirado não concede benefícios.",
        "Relógio do servidor define todas as datas."
      ],
      mistakes: [
        ["Processar Robux aqui", "Mistura domínio e plataforma e dificulta receipt handling."],
        ["Recomeçar duração na renovação", "Remove dias restantes do jogador."],
        ["Cancelar como revogar", "Cancelamento normal costuma preservar acesso até EndsAt."],
        ["Não persistir", "Reconexão apagaria direitos já adquiridos."]
      ],
      tests: [
        "Plano desconhecido é recusado.",
        "Renovação estende EndsAt atual.",
        "Cancelamento mantém acesso até o fim.",
        "Revogação corta acesso imediatamente.",
        "Expiração remove benefícios.",
        "Importação preserva referência externa."
      ],
      example: `local Subscriptions = require(ServerScriptService.Services.Economy.SubscriptionService)\n\n-- Chame somente depois da confirmação de compra.\nSubscriptions:Activate(player, "CottonClub", {\n    Source = "VerifiedPurchase",\n    ExternalReference = receiptId,\n})`
    },
    {
      id: "refund",
      name: "RefundService",
      label: "Estornos internos",
      icon: "undo-2",
      phase: 7,
      risk: "Alto",
      riskClass: "high",
      role: "Registra, revisa e executa estornos internos por handlers específicos de transação.",
      question: "Como provar que uma compra pode ser revertida uma única vez e que o handler realmente concluiu antes de aprovar?",
      source: "../../src/ServerScriptService/Services/Economy/RefundService.luau",
      dependencies: ["EventBus", "Handlers de domínio", "Persistência global"],
      dependents: ["Suporte", "WalletHistoryService", "AuditLogService futuro"],
      truth: "O pedido guarda a decisão; cada handler conhece a reversão concreta do tipo de compra.",
      mentalModel: [
        "Pedido, decisão e execução são etapas diferentes.",
        "TransactionId único impede estorno duplicado.",
        "O estado só vira Approved depois que o handler confirma sucesso.",
        "Robux e dinheiro real seguem processos oficiais fora deste serviço."
      ],
      flow: [
        ["Validar janela", "Compra precisa estar dentro do prazo configurado."],
        ["Bloquear duplicidade", "TransactionId só pode originar um pedido."],
        ["Criar Pending", "Registro guarda jogador, tipo e metadados."],
        ["Revisar", "Código autorizado escolhe Approve ou Reject."],
        ["Executar handler", "A reversão específica roda dentro de pcall."],
        ["Confirmar decisão", "Approved só é gravado após resultado positivo."]
      ],
      stages: [
        "Definir tipos internos realmente reversíveis.",
        "Criar registro idempotente por TransactionId.",
        "Registrar handlers por tipo de transação.",
        "Persistir pedidos antes de abrir ferramentas de suporte.",
        "Adicionar autorização e AuditLog no painel de revisão."
      ],
      methods: [
        ["RegisterHandler(type, handler)", "Liga a reversão concreta do domínio.", "void"],
        ["Request(player, txId, type, purchasedAt, metadata)", "Cria pedido Pending.", "resultado"],
        ["Approve(requestId, reviewerId)", "Executa handler e confirma estorno.", "resultado"],
        ["Reject(requestId, reviewerId, reason)", "Encerra pedido sem reversão.", "resultado"],
        ["GetPlayerRequests(player)", "Lista solicitações recentes.", "table"],
        ["ExportState() / ImportState()", "Persiste pedidos e índice de transação.", "table / boolean"]
      ],
      configKeys: ["RequestWindowSeconds", "MaximumPendingPerPlayer", "AllowedTransactionTypes"],
      invariants: [
        "TransactionId nunca possui dois pedidos.",
        "Approved implica handler concluído com sucesso.",
        "Jogador não aprova o próprio pedido.",
        "O módulo não promete reembolso de Robux."
      ],
      mistakes: [
        ["Aprovar antes do handler", "Falha de execução deixa registro mentindo sobre o estorno."],
        ["Handler genérico", "Cada compra possui ativos e rollback próprios."],
        ["Sem persistência global", "Trocar de servidor pode permitir duplicidade."],
        ["Expor Approve ao jogador", "Somente código administrativo autorizado pode decidir."]
      ],
      tests: [
        "Recusa tipo, janela e TransactionId inválidos.",
        "Bloqueia segundo pedido da mesma transação.",
        "Handler ausente mantém Pending.",
        "Falha do handler mantém Pending.",
        "Aprovação registra reviewer e resultado.",
        "Importação reconstrói índice de TransactionId."
      ],
      example: `local Refunds = require(ServerScriptService.Services.Economy.RefundService)\n\nRefunds:RegisterHandler("ItemPurchase", function(request)\n    return reverseInternalPurchase(request)\nend)\n\nlocal result = Refunds:Request(player, transactionId, "ItemPurchase", purchasedAt)`
    },
    {
      id: "leveling",
      name: "LevelingService",
      label: "Níveis e XP",
      icon: "trending-up",
      phase: 8,
      risk: "Médio",
      riskClass: "medium",
      role: "Controla XP, curva, múltiplos level-ups e sincronização do leaderstat Nível.",
      question: "Qual estado é canônico quando XP interno, atributos replicados e leaderstats mostram a mesma progressão?",
      source: "../../src/ServerScriptService/Services/Progression/LevelingService.luau",
      dependencies: ["LeaderstatsService", "EventBus", "ProgressionSystemsConfig"],
      dependents: ["Desbloqueios", "Títulos", "Badges", "SeasonPass futuro"],
      truth: "O perfil interno guarda Level e XP; leaderstat e atributos são apenas espelhos para UI.",
      mentalModel: [
        "XP é progresso dentro do nível atual; Level é o marco consolidado.",
        "Uma recompensa grande pode atravessar vários níveis.",
        "O excedente precisa continuar no próximo nível.",
        "No nível máximo, XP deixa de acumular para manter estado simples."
      ],
      flow: [
        ["Validar recompensa", "Somente XP inteiro positivo entra no sistema."],
        ["Somar XP", "O valor é adicionado ao perfil canônico."],
        ["Consumir requisitos", "Loop subtrai XPRequired e incrementa Level."],
        ["Aplicar máximo", "No teto, XP restante é zerado."],
        ["Sincronizar", "Leaderstat e atributos recebem o snapshot final."],
        ["Publicar", "Eventos distinguem ganho de XP e level-up."]
      ],
      stages: [
        "Definir curva e nível máximo.",
        "Implementar GetXPRequired como função pura.",
        "Implementar AddXP com vários level-ups.",
        "Sincronizar espelhos somente após estado válido.",
        "Persistir Level e XP antes de conceder recompensas reais."
      ],
      methods: [
        ["GetXPRequired(level)", "Calcula requisito da curva.", "number"],
        ["GetSnapshot(player)", "Retorna nível, XP e próximo requisito.", "table"],
        ["AddXP(player, amount, source)", "Aplica recompensa e level-ups.", "resultado"],
        ["ExportPlayer() / ImportPlayer()", "Persiste o perfil de nível.", "table / boolean"]
      ],
      configKeys: ["MaximumLevel", "BaseXP", "GrowthFactor", "LevelAttribute", "XPAttribute"],
      invariants: [
        "Level permanece entre 1 e MaximumLevel.",
        "XP nunca é negativo.",
        "XP abaixo do requisito representa o nível atual.",
        "Espelhos nunca são usados como fonte de escrita externa."
      ],
      mistakes: [
        ["Um level-up por chamada", "Recompensas grandes perdem níveis ou excedente."],
        ["Confiar no leaderstat", "Ele é replicado e não carrega XP detalhado."],
        ["Curva sem simulação", "GrowthFactor pequeno muda drasticamente níveis altos."],
        ["XP vindo do cliente", "A fonte da recompensa deve ser validada no servidor."]
      ],
      tests: [
        "XP insuficiente permanece no mesmo nível.",
        "XP exato sobe e zera o progresso.",
        "Recompensa grande sobe vários níveis.",
        "Nível máximo não acumula XP.",
        "Importação limita estado inválido.",
        "Leaderstat reflete o snapshot final."
      ],
      example: `local Leveling = require(ServerScriptService.Services.Progression.LevelingService)\n\nlocal result = Leveling:AddXP(player, 250, "Harvest")\nif result.LevelsGained > 0 then\n    print("Novo nível:", result.Level)\nend`
    },
    {
      id: "skill-tree",
      name: "SkillTreeService",
      label: "Árvore de habilidades",
      icon: "git-fork",
      phase: 8,
      risk: "Médio",
      riskClass: "medium",
      existing: true,
      role: "Módulo já existente que compra nós, valida pré-requisitos e agrega efeitos de produção.",
      question: "Como integrar um sistema já funcional ao novo ledger sem recriar estado, remotes ou fórmulas de efeitos?",
      source: "../../src/ServerScriptService/Services/SkillTreeService.luau",
      dependencies: ["SkillTreeConfig", "CurrencyExchangeService", "Inventory/Economy consumidores"],
      dependents: ["CottonService", "MachineService", "EconomyService", "InventoryService"],
      truth: "PlayerTrees e SkillTreeConfig existentes continuam canônicos; apenas o débito agora passa pela carteira auditável.",
      mentalModel: [
        "Não duplique um sistema que já possui estado e consumidores reais.",
        "Pré-requisitos formam um grafo direcionado de desbloqueios.",
        "Efeitos são agregados por Kind e TargetId.",
        "A integração nova deve trocar somente a fronteira de pagamento."
      ],
      flow: [
        ["Encontrar skill", "SkillTreeConfig resolve ID, custo e efeitos."],
        ["Bloquear repetição", "Unlocked impede comprar o mesmo nó duas vezes."],
        ["Validar grafo", "Todos os pré-requisitos precisam estar desbloqueados."],
        ["Debitar Cash", "CurrencyExchangeService registra SkillPurchase no histórico."],
        ["Desbloquear", "O nó entra no estado canônico após o débito."],
        ["Agregar efeitos", "Consumidores consultam bônus sem copiar a árvore."]
      ],
      stages: [
        "Manter o ModuleScript existente como único dono da árvore.",
        "Passar compras pelo CurrencyExchangeService.",
        "Persistir PlayerTrees no PlayerDataService.",
        "Adicionar validação de ciclos ao editar SkillTreeConfig.",
        "Migrar para OOP apenas em refatoração dedicada e com testes de regressão."
      ],
      methods: [
        ["BuySkill(player, skillId)", "Valida, debita e desbloqueia um nó.", "resultado"],
        ["IsSkillUnlocked(player, skillId)", "Consulta propriedade do nó.", "boolean"],
        ["GetSnapshot(player)", "Retorna mapa e contagens para UI.", "table"],
        ["GetEffectValue(player, kind, targetId)", "Agrega efeitos compatíveis.", "number"],
        ["GetHarvestAmount / GetSaleMultiplier / ...", "Adaptadores para consumidores atuais.", "number"]
      ],
      configKeys: ["Skills", "Order", "Connections", "Prerequisites", "Effects", "Kind", "TargetId", "Value"],
      invariants: [
        "Um nó só desbloqueia depois de seus pré-requisitos.",
        "Cash só é debitado uma vez por nó.",
        "Efeitos vêm apenas de nós desbloqueados.",
        "Nenhum segundo SkillTreeService é criado."
      ],
      mistakes: [
        ["Recriar em OOP agora", "Dois estados e remotes concorrentes quebrariam consumidores existentes."],
        ["Debitar direto no leaderstat", "A compra ficaria fora do WalletHistory."],
        ["Grafo com ciclo", "Nós envolvidos se tornam inalcançáveis."],
        ["Efeito aplicado em dois lugares", "O bônus pode ser multiplicado duas vezes."]
      ],
      tests: [
        "Recusa skill inexistente e já desbloqueada.",
        "Recusa pré-requisito ausente.",
        "Compra gera SkillPurchase no histórico.",
        "Falha de débito não desbloqueia.",
        "Efeitos agregam somente nós ativos.",
        "Snapshots preservam a ordem do config."
      ],
      example: `local Skills = require(ServerScriptService.Services.SkillTreeService)\n\nlocal result = Skills:BuySkill(player, "CottonYield")\nif result.Ok then\n    print(Skills:GetHarvestAmount(player))\nend`
    },
    {
      id: "prestige-tier",
      name: "PrestigeTierService",
      label: "Faixas de prestígio",
      icon: "medal",
      phase: 9,
      risk: "Baixo",
      riskClass: "low",
      role: "Traduz rebirths existentes em faixas e multiplicadores sem executar outro reset.",
      question: "Que parte é apresentação de status e que parte pertence ao RebirthService que já controla o reset?",
      source: "../../src/ServerScriptService/Services/Progression/PrestigeTierService.luau",
      dependencies: ["RebirthService existente", "ProgressionSystemsConfig"],
      dependents: ["Recompensas", "Títulos", "Perfil público"],
      truth: "A contagem de rebirths vem de resolver injetado ou atributo; o módulo apenas resolve a faixa.",
      mentalModel: [
        "Prestígio é classificação derivada, não uma segunda moeda de reset.",
        "Tiers são limites ordenados do menor para o maior.",
        "O próximo tier serve à UI sem mutar progresso.",
        "Multiplicadores ficam na faixa, mas consumidores escolhem onde aplicá-los."
      ],
      flow: [
        ["Ler rebirths", "Resolver conecta o sistema já existente."],
        ["Percorrer limites", "A última faixa alcançada vence."],
        ["Retornar cópia", "Consumidores não alteram o config."],
        ["Calcular próximo", "Mostra rebirths restantes até a próxima faixa."],
        ["Aplicar recompensa", "Multiplica somente quando o consumidor pede."],
        ["Montar snapshot", "Reúne contagem, tier atual e próximo."]
      ],
      stages: [
        "Ordenar tiers por MinimumRebirths.",
        "Conectar resolver ao RebirthService existente.",
        "Implementar tier atual como função pura.",
        "Implementar progresso para o próximo tier.",
        "Aplicar multiplicadores em pontos econômicos explícitos."
      ],
      methods: [
        ["SetRebirthResolver(resolver)", "Liga a fonte de rebirths.", "void"],
        ["GetTierForRebirths(count)", "Resolve faixa sem Player.", "tier"],
        ["GetTier(player) / GetNextTier(player)", "Consulta classificação e progresso.", "tier?"],
        ["ApplyRewardMultiplier(player, value)", "Aplica bônus da faixa.", "number"],
        ["GetSnapshot(player)", "Retorna visão completa.", "table"]
      ],
      configKeys: ["RebirthAttribute", "Tiers", "MinimumRebirths", "RewardMultiplier"],
      invariants: [
        "O serviço nunca altera rebirths.",
        "Sempre existe uma faixa inicial.",
        "Tiers retornados não mutam o config.",
        "Contagem negativa é normalizada para zero."
      ],
      mistakes: [
        ["Criar outro reset", "Duplicaria RebirthService e poderia apagar progresso duas vezes."],
        ["Tiers fora de ordem", "A busca seleciona faixa incorreta."],
        ["Aplicar multiplicador globalmente", "Bônus pode afetar custos que deveriam permanecer fixos."],
        ["Confiar em atributo do cliente", "O resolver do servidor deve ser preferido em produção."]
      ],
      tests: [
        "Zero rebirth retorna Starter.",
        "Limites exatos escolhem a nova faixa.",
        "Entre limites mantém a faixa anterior.",
        "Última faixa não possui NextTier.",
        "Resolver inválido usa atributo seguro.",
        "Multiplicador preserva valor base no tier inicial."
      ],
      example: `local Prestige = require(ServerScriptService.Services.Progression.PrestigeTierService)\n\nPrestige:SetRebirthResolver(function(player)\n    return RebirthService:GetRebirths(player)\nend)\n\nlocal snapshot = Prestige:GetSnapshot(player)`
    },
    {
      id: "badge",
      name: "BadgeService",
      label: "Badges Roblox",
      icon: "award",
      phase: 9,
      risk: "Médio",
      riskClass: "medium",
      role: "Consulta e concede badges oficiais por chaves internas configuráveis.",
      question: "Como lidar com APIs que cedem, limites da plataforma e IDs ainda não publicados sem bloquear o gameplay principal?",
      source: "../../src/ServerScriptService/Services/Progression/BadgeService.luau",
      dependencies: ["Roblox BadgeService", "EventBus", "ProgressionSystemsConfig"],
      dependents: ["Milestones futuros", "Títulos", "Perfil do jogador"],
      truth: "A plataforma Roblox é fonte de propriedade; cache local reduz consultas repetidas.",
      mentalModel: [
        "Badge é reconhecimento externo, não estado econômico crítico.",
        "Chaves internas escondem IDs numéricos do gameplay.",
        "ID zero significa desativado com segurança.",
        "Falha de API deve retornar erro, não travar a recompensa principal."
      ],
      flow: [
        ["Resolver chave", "Config transforma FirstHarvest em badgeId."],
        ["Validar jogador", "Award exige jogador conectado à experiência."],
        ["Consultar cache", "Propriedade recente evita nova chamada."],
        ["Buscar informações", "Confirma que o badge está habilitado."],
        ["Conceder", "AwardBadgeAsync roda no servidor dentro de pcall."],
        ["Atualizar cache", "Sucesso marca propriedade e publica evento."]
      ],
      stages: [
        "Criar badges no Creator Dashboard e preencher IDs.",
        "Manter IDs zero enquanto assets não existirem.",
        "Implementar Has e GetInfo com pcall e cache.",
        "Implementar Award idempotente.",
        "Conectar conquistas sem tornar a API parte da transação principal."
      ],
      methods: [
        ["GetBadgeId(key)", "Resolve somente IDs configurados.", "number?"],
        ["Has(player, key)", "Consulta propriedade com cache.", "boolean, erro?"],
        ["GetInfo(key)", "Obtém metadados e IsEnabled.", "table?, erro?"],
        ["Award(player, key)", "Concede de forma idempotente.", "resultado"],
        ["ClearCache(player?)", "Invalida propriedade e informações.", "void"]
      ],
      configKeys: ["CacheSeconds", "Badges", "FirstHarvest", "FirstFabric", "FactoryMaster"],
      invariants: [
        "Badge sem ID real nunca chama a plataforma.",
        "Somente jogador conectado recebe Award.",
        "Falha externa não é cacheada como não propriedade.",
        "Award já possuído retorna sucesso idempotente."
      ],
      mistakes: [
        ["Usar método deprecated", "Prefira AwardBadgeAsync e UserHasBadgeAsync."],
        ["Award no cliente", "A concessão precisa partir de Script do servidor."],
        ["ID de outra experiência", "A plataforma recusará o badge fora da experiência associada."],
        ["Falha quebrando recompensa", "Badge deve ser consequência; registre erro e preserve o gameplay."]
      ],
      tests: [
        "ID zero retorna BadgeNotConfigured sem chamada externa.",
        "Cache evita consulta repetida dentro do TTL.",
        "Jogador desconectado é recusado.",
        "Badge desabilitado não recebe Award.",
        "Falha da plataforma retorna erro de domínio.",
        "Sucesso publica Progression.BadgeAwarded."
      ],
      example: `local Badges = require(ServerScriptService.Services.Progression.BadgeService)\n\nlocal result = Badges:Award(player, "FirstHarvest")\nif not result.Ok then\n    warn(result.Error)\nend`
    },
    {
      id: "title",
      name: "TitleService",
      label: "Títulos",
      icon: "tag",
      phase: 9,
      risk: "Baixo",
      riskClass: "low",
      role: "Desbloqueia, equipa e replica títulos internos persistíveis.",
      question: "Como separar a conquista que desbloqueia um título da escolha do jogador sobre qual título exibir?",
      source: "../../src/ServerScriptService/Services/Progression/TitleService.luau",
      dependencies: ["EventBus", "ProgressionSystemsConfig", "PlayerDataService"],
      dependents: ["ProfileCard futuro", "Chat", "UI de perfil"],
      truth: "O perfil interno mantém IDs desbloqueados e equipado; o atributo replica somente DisplayName.",
      mentalModel: [
        "Unlock é uma conquista; Equip é preferência do jogador.",
        "Título padrão garante que sempre exista estado válido.",
        "IDs persistidos sobrevivem a mudanças de texto exibido.",
        "Importação filtra títulos removidos do catálogo."
      ],
      flow: [
        ["Validar catálogo", "Somente IDs definidos podem ser desbloqueados."],
        ["Desbloquear", "Operação idempotente marca o ID no perfil."],
        ["Escolher", "Equip exige que o ID já esteja desbloqueado."],
        ["Replicar", "Atributo recebe DisplayName para UI."],
        ["Ordenar snapshot", "SortOrder produz lista estável."],
        ["Importar com fallback", "Título inválido volta ao padrão."]
      ],
      stages: [
        "Definir catálogo, IDs e título padrão.",
        "Implementar Unlock idempotente.",
        "Implementar Equip com validação de propriedade.",
        "Replicar somente dados necessários à UI.",
        "Conectar eventos de Leveling, Badge ou Prestige aos desbloqueios."
      ],
      methods: [
        ["IsUnlocked(player, titleId)", "Consulta propriedade interna.", "boolean"],
        ["Unlock(player, titleId, source)", "Concede título idempotentemente.", "resultado"],
        ["Equip(player, titleId)", "Seleciona um título desbloqueado.", "resultado"],
        ["GetSnapshot(player)", "Lista catálogo ordenado e estado.", "table"],
        ["ExportPlayer() / ImportPlayer()", "Persiste desbloqueios e escolha.", "table / boolean"]
      ],
      configKeys: ["DefaultTitleId", "PlayerAttribute", "Titles", "DisplayName", "SortOrder"],
      invariants: [
        "Título equipado sempre está desbloqueado.",
        "Título padrão nunca desaparece do perfil.",
        "Unlock repetido não duplica recompensa.",
        "DisplayName não é usado como chave persistente."
      ],
      mistakes: [
        ["Persistir texto", "Renomear o título quebraria saves; persista o ID."],
        ["Equipar bloqueado", "Cliente pode pedir qualquer ID; valide no servidor."],
        ["Sem título padrão", "Remover um título equipado deixa estado inválido."],
        ["Misturar condição no catálogo", "Eventos de progressão devem chamar Unlock explicitamente."]
      ],
      tests: [
        "Perfil novo possui e equipa o padrão.",
        "Unlock repetido retorna AlreadyUnlocked.",
        "Equip bloqueado é recusado.",
        "Equip válido atualiza atributo.",
        "Importação remove IDs desconhecidos.",
        "Snapshot respeita SortOrder."
      ],
      example: `local Titles = require(ServerScriptService.Services.Progression.TitleService)\n\nTitles:Unlock(player, "CottonFarmer", "FirstHarvest")\nlocal result = Titles:Equip(player, "CottonFarmer")`
    }
  ];

  systems.forEach((system, index) => {
    system.category = index < 15 ? "Economia" : "Progressão";
  });

  const integrationBlueprints = window.INTEGRATION_SYSTEM_BLUEPRINTS || [];
  const expansionBlueprints = window.NEON_SYSTEM_EXPANSION || [];

  const integrationModeProfiles = {
    State: {
      truth: "A tabela interna indexada por UserId é o estado de runtime. A persistência só acontece quando um adaptador exporta esse snapshot para PlayerDataService.",
      before: "states[userId] = nil",
      after: "states[userId] = { UpdatedAt = os.time(), Value = novoEstado }",
      memory: "GetState devolve uma cópia profunda. Quem recebe o snapshot pode alterá-lo sem modificar silenciosamente a tabela canônica guardada pelo serviço.",
      compare: ["Attributes", "Espelho replicado e temporário"],
      notUse: "Não use o estado interno como save permanente nem como substituto do PlayerDataService. Ele desaparece quando o servidor fecha."
    },
    Registry: {
      truth: "O registro interno usa IDs estáveis como chaves. Instances, nomes visuais e posições mutáveis ficam dentro do valor, nunca como identidade persistente.",
      before: "records[recordId] = nil",
      after: "records[recordId] = { Id = recordId, Status = \"Active\" }",
      memory: "CreateRecord copia a tabela recebida. Isso impede o chamador de guardar a mesma referência e mudar um registro depois da validação sem passar por UpdateRecord.",
      compare: ["Tabela comum", "Sem contrato de ID, cópia ou colisão"],
      notUse: "Não crie um registro para um valor calculado que pode ser reconstruído sem custo. Persistir cache derivado aumenta migração e risco de divergência."
    },
    Queue: {
      truth: "A fila interna mantém ordem FIFO: o primeiro valor inserido é o primeiro removido. Persistência e coordenação entre servidores exigem um adaptador de MemoryStore.",
      before: "queue = { jobA, jobB }",
      after: "queue = { jobB } -- Dequeue removeu jobA",
      memory: "Enqueue armazena uma cópia do trabalho. Dequeue transfere a posse daquela cópia ao consumidor e a remove da fila em memória.",
      compare: ["MemoryStoreQueue", "Fila temporária realmente compartilhada entre servidores"],
      notUse: "Não use a fila local quando dois servidores precisam disputar o mesmo trabalho. Nesse caso, conecte MemoryStoreQueue e defina expiração."
    },
    Policy: {
      truth: "A política não concede prêmio nem move item sozinha. Ela retorna uma decisão e um motivo; o serviço consumidor continua dono da mutação.",
      before: "decision = nil",
      after: "decision = { Allowed = false, Reason = \"OutOfRange\" }",
      memory: "O evaluator recebe contexto por referência durante a chamada, mas deve tratar essa tabela como somente leitura e retornar uma decisão nova.",
      compare: ["if espalhado", "Regra duplicada e difícil de auditar"],
      notUse: "Não use uma Policy como banco de dados. Se a decisão depende de histórico, injete um serviço que seja dono desse histórico."
    },
    Pipeline: {
      truth: "O handler registrado é dono da sequência de domínio. A factory valida, executa com pcall, registra métricas, deduplica RequestId e só então publica o resultado.",
      before: "processed[requestId] = nil",
      after: "processed[requestId] = { Ok = true, Result = ... }",
      memory: "O payload é copiado antes de entrar no handler. O resultado idempotente também é copiado antes de ser guardado e antes de voltar ao chamador.",
      compare: ["Função direta", "Sem deduplicação, métricas ou fronteira comum"],
      notUse: "Não transforme uma leitura pura em pipeline. Consultas sem mutação devem continuar simples e não ocupar histórico idempotente."
    }
  };

  const targetMethodDetails = {
    Execute: ["Executa uma operação de domínio registrada, validada e idempotente.", "resultado"],
    Evaluate: ["Avalia uma regra sem alterar a fonte de verdade.", "boolean, motivo"],
    GetState: ["Retorna uma cópia do estado da identidade informada.", "table?"],
    SetState: ["Substitui estado após validação e cópia profunda.", "boolean, erro?"],
    ClearState: ["Remove o estado de runtime da identidade.", "boolean"],
    CreateRecord: ["Cria registro por ID e recusa colisão.", "resultado"],
    GetRecord: ["Consulta uma cópia do registro.", "table?"],
    UpdateRecord: ["Aplica patch explícito a registro existente.", "resultado"],
    RemoveRecord: ["Remove registro existente pelo ID.", "boolean"],
    ListRecords: ["Retorna snapshot do catálogo de registros.", "table"],
    Enqueue: ["Insere uma cópia no fim da fila.", "tamanho"],
    Dequeue: ["Remove e retorna o primeiro elemento.", "valor?"],
    Peek: ["Consulta o primeiro elemento sem remover.", "valor?"],
    GetQueueSize: ["Informa quantos trabalhos aguardam.", "number"],
    GetMetrics: ["Retorna chamadas, sucessos, falhas e duplicatas.", "table"]
  };

  function buildIntegrationExample(blueprint) {
    const [operationName, targetMethod] = blueprint.operations[0];
    const serviceFolder = blueprint.folder
      ? `Academy.${blueprint.folder}`
      : `Integration.${blueprint.tier === "Básico" ? "Basic" : blueprint.tier === "Intermediário" ? "Intermediate" : "Advanced"}`;
    const requireLine = `local Service = require(ServerScriptService.Services.${serviceFolder}.${blueprint.name})`;

    if (targetMethod === "CreateRecord") {
      return `${requireLine}\n\nlocal created = Service:${operationName}("example-001", {\n    OwnerUserId = player.UserId,\n    Status = "Active",\n})\n\nif not created.Ok then\n    warn(created.Error)\nend`;
    }
    if (targetMethod === "Enqueue") {
      return `${requireLine}\n\nlocal queueSize = Service:${operationName}({\n    PlayerUserId = player.UserId,\n    CreatedAt = os.time(),\n})\n\nprint("Itens aguardando:", queueSize)`;
    }
    if (targetMethod === "Evaluate") {
      return `${requireLine}\n\nService:RegisterHandler("Evaluate", function(subject, context)\n    return context.Distance <= 18, "OutOfRange"\nend)\n\nlocal allowed, reason = Service:${operationName}(player, { Distance = 12 })\nprint(allowed, reason)`;
    }
    return `${requireLine}\n\nService:AddValidator(function(operation, actor, payload)\n    if not actor or type(payload) ~= "table" then\n        return false, "InvalidRequest"\n    end\n    return true\nend)\n\nService:RegisterHandler("${operationName}", function(actor, payload)\n    -- Conecte aqui a fonte de verdade do domínio.\n    return { Ok = true, Actor = actor.UserId, Payload = payload }\nend)\n\nlocal result = Service:${operationName}(player, { Value = 1 }, {\n    RequestId = tostring(player.UserId) .. ":example-001",\n})\n\nif not result.Ok then\n    warn(result.Error)\nend`;
  }

  function createIntegrationSystem(blueprint, index) {
    const profile = integrationModeProfiles[blueprint.mode];
    const primaryOperation = blueprint.operations[0][0];
    const tierFolder = blueprint.tier === "Básico" ? "Basic" : blueprint.tier === "Intermediário" ? "Intermediate" : "Advanced";
    const category = `Integração ${blueprint.tier.toLocaleLowerCase("pt-BR")}`;
    const risk = blueprint.tier === "Básico" ? "Baixo" : blueprint.tier === "Intermediário" ? "Médio" : "Alto";
    const riskClass = blueprint.tier === "Básico" ? "low" : blueprint.tier === "Intermediário" ? "medium" : "high";

    return {
      id: `integration-${blueprint.id}`,
      name: blueprint.name,
      label: blueprint.label,
      icon: blueprint.icon,
      phase: blueprint.tier === "Básico" ? 10 : blueprint.tier === "Intermediário" ? 11 : 12,
      risk,
      riskClass,
      role: blueprint.role,
      question: `${blueprint.why} Qual serviço possui a fonte de verdade e qual parte desta API apenas coordena o acesso a ela?`,
      source: `../../src/ServerScriptService/Services/Integration/${tierFolder}/${blueprint.name}.luau`,
      dependencies: blueprint.dependencies,
      dependents: blueprint.tier === "Básico" ? ["Sistemas intermediários", "UI e controllers", "PlayerDataService"] : blueprint.tier === "Intermediário" ? ["RemoteGatewayService", "Live Ops", "Ferramentas operacionais"] : ["Operação em produção", "Observabilidade", "Recuperação de falhas"],
      truth: profile.truth,
      mentalModel: [
        `Problema concreto: ${blueprint.why}`,
        `${blueprint.name} expõe um contrato; a factory fornece o mecanismo comum sem conhecer a regra específica.`,
        `O método ${primaryOperation} não deve confiar em payload vindo do cliente nem escrever em uma fonte que pertence a outro serviço.`,
        "Cópias profundas impedem que uma tabela entregue ao chamador continue apontando para o estado interno."
      ],
      flow: [
        ["Receber intenção", `O chamador encontra a referência de ${blueprint.name} por require() e chama ${primaryOperation}.`],
        ["Normalizar contexto", "Identidade, payload e RequestId entram em um formato previsível."],
        ["Validar fronteira", "Validators recusam tipo, permissão, distância, estado ou limite antes da mutação."],
        ["Executar mecanismo", `O modo ${blueprint.mode} escolhe estado, registro, fila, política ou pipeline.`],
        ["Proteger resultado", "pcall converte erro inesperado em falha de domínio; RequestId evita repetir sucesso."],
        ["Publicar e medir", `O EventBus publica ${blueprint.name}.${primaryOperation} e as métricas registram o resultado.`]
      ],
      stages: [
        `Escrever o contrato de ${primaryOperation}: entrada, saída e erros de domínio.`,
        "Registrar validators sem efeitos colaterais antes do handler principal.",
        `Conectar ${blueprint.dependencies.join(" e ")} por injeção ou require controlado.`,
        "Implementar o handler com rollback para toda mutação parcial.",
        "Exportar o estado necessário para PlayerDataService ou adaptador operacional.",
        "Testar repetição do mesmo RequestId, falha do handler e payload inválido."
      ],
      methods: blueprint.operations.map(([name, target]) => {
        const detail = targetMethodDetails[target] || ["Executa operação do contrato configurado.", "resultado"];
        return [`${name}(...)`, detail[0], detail[1]];
      }).concat([
        ["RegisterHandler(operation, callback)", "Conecta a regra de domínio à infraestrutura.", "self"],
        ["AddValidator(callback)", "Adiciona validação sem mutação antes da execução.", "self"],
        ["ExportState() / ImportState()", "Move snapshot entre runtime e persistência.", "table / boolean"]
      ]),
      configKeys: ["Name", "Tier", "Mode", "Enabled", "Dependencies", "Operations"],
      invariants: [
        "Nenhum handler ausente confirma sucesso: a factory retorna HandlerNotRegistered.",
        "Payload e resultado idempotente são copiados antes de cruzar a fronteira do serviço.",
        "O mesmo RequestId devolve o resultado anterior sem executar a mutação novamente.",
        `${blueprint.name} não assume propriedade sobre dados pertencentes a ${blueprint.dependencies.join(", ")}.`
      ],
      mistakes: [
        ["Handler sem validação", "pcall captura erro, mas não prova permissão, saldo, distância ou ownership. Validators precisam fazer isso antes."],
        ["Confundir runtime com save", profile.notUse],
        ["Aceitar RequestId do cliente sem escopo", "Combine identidade, operação e referência canônica para evitar colisões escolhidas pelo atacante."],
        ["Retornar referência interna", "Sem cópia, o chamador alteraria estado sem evento, validação ou auditoria."]
      ],
      tests: [
        `${primaryOperation} recusa operação quando o serviço está desabilitado.`,
        "Payload que não é table retorna PayloadMustBeTable.",
        "Validator recusado impede o handler de executar.",
        "Handler que lança erro retorna HandlerFailed.",
        "RequestId repetido aumenta Duplicates e não executa novamente.",
        "ExportState seguido de ImportState preserva somente dados serializáveis."
      ],
      example: buildIntegrationExample(blueprint),
      category,
      tier: blueprint.tier,
      mode: blueprint.mode,
      integrationIndex: index + 1,
      course: {
        what: `${blueprint.name} é um serviço ${blueprint.mode} que ${blueprint.role.charAt(0).toLocaleLowerCase("pt-BR")}${blueprint.role.slice(1)}`,
        why: blueprint.why,
        diagram: `🟦 CLIENTE / CONTROLLER\n        │ intenção\n        ▼\n🟨 RemoteGateway + validação\n        │ payload permitido\n        ▼\n🟥 ${blueprint.name}\n        │ delega para\n        ├── ${blueprint.dependencies.join("\n        ├── ")}\n        ▼\nFonte de verdade + evento + resposta`,
        internals: [
          "require() executa o ModuleScript uma vez naquele ambiente e recebe a instância criada pela factory.",
          `O config localiza ${primaryOperation} em Operations e cria um alias que aponta para o mecanismo ${blueprint.operations[0][1]}.`,
          "A chamada entra por uma cópia do payload; validators rodam na ordem em que foram registrados.",
          "O handler de domínio usa dependências para consultar ou alterar a fonte de verdade.",
          "O resultado é normalizado, contabilizado e associado ao RequestId quando a operação é idempotente.",
          "O EventBus publica uma cópia para consumidores; nenhum RemoteEvent é disparado automaticamente."
        ],
        before: profile.before,
        after: profile.after,
        memory: profile.memory,
        syntax: [
          ["Service", `referência retornada pelo require de ${blueprint.name}.`],
          [":", "passa Service automaticamente como self na chamada."],
          [primaryOperation, "alias de domínio criado a partir do IntegrationSystemsConfig."],
          ["player", "ator da intenção; no servidor, essa referência não vem dentro do payload."],
          ["payload", "tabela de dados permitidos, copiada antes do handler."],
          ["RequestId", "chave de deduplicação; repetir devolve o resultado guardado."]
        ],
        boundary: `O cliente pode pedir ${primaryOperation} e mostrar a resposta. O servidor encontra a referência real do Player no OnServerEvent, valida o payload e chama ${blueprint.name}. Tabelas Luau são serializadas pela rede; funções, conexões, metatables e Instances não permitidas não devem cruzar essa fronteira.`,
        minimum: `local Service = {}\n\nfunction Service.${primaryOperation}(payload)\n    return { Ok = true, Payload = payload }\nend\n\nreturn Service`,
        robloxVsDeveloper: [
          ["Luau", "table, function, pcall, setmetatable e referências em memória."],
          ["API Roblox", "Player, RemoteEvent, DataStore, MemoryStore ou MessagingService quando a integração exigir."],
          ["Código do jogo", `${blueprint.name}, seus validators, handlers, IDs, invariantes e erros de domínio.`]
        ],
        removeConsequence: `Sem ${blueprint.name}, ${blueprint.why.charAt(0).toLocaleLowerCase("pt-BR")}${blueprint.why.slice(1)} O problema não desaparece: ele volta como lógica duplicada nos consumidores.`,
        comparison: [profile.compare, [blueprint.name, `Contrato ${blueprint.mode} com validação, cópia, eventos e métricas`]],
        whenUse: [`Quando mais de um consumidor precisa de ${blueprint.label.toLocaleLowerCase("pt-BR")}.`, `Quando ${primaryOperation} precisa de validação e erro previsível.`, "Quando retry ou reconexão não pode repetir a mesma consequência."],
        whenNot: [profile.notUse, "Não crie uma instância nova por chamada; o ModuleScript já retorna o singleton do servidor.", "Não use esse serviço para esconder uma função local que possui um único chamador e nenhum estado ou regra compartilhada."],
        scaling: `Função local → ModuleScript → ${blueprint.name} → validators + handlers → persistência/observabilidade → operação distribuída`,
        gameUse: `${blueprint.name} recebe fatos ou intenções de sistemas de gameplay, consulta ${blueprint.dependencies.join(" e ")}, publica um resultado estável e permite que UI, analytics e operação reajam sem escrever na mesma fonte de verdade.`,
        exercise: `Crie um handler real para ${primaryOperation}. Defina três erros de domínio, adicione um validator e prove com um contador que repetir RequestId não executa a mutação duas vezes.`,
        questions: [
          `Qual valor require() retorna para ${blueprint.name}?`,
          `Qual mecanismo base está por trás de ${primaryOperation}?`,
          "Por que o payload é copiado antes do handler?",
          "Quem é dono da fonte de verdade desta operação?",
          "O que acontece quando não existe handler registrado?",
          "Que parte pode rodar no cliente e que parte precisa permanecer no servidor?"
        ],
        summary: [`Serviço ${blueprint.mode} de nível ${blueprint.tier}.`, `Operação inicial: ${primaryOperation}.`, `Dependências: ${blueprint.dependencies.join(", ")}.`, "Falha fechado sem handler.", "Copia tabelas, mede chamadas e deduplica RequestId."]
      }
    };
  }

  function createExpansionSystem(blueprint, index) {
    const tierNames = { Basico: "Básico", Intermediario: "Intermediário", Avancado: "Avançado" };
    const normalizedBlueprint = { ...blueprint, tier: tierNames[blueprint.tier] || blueprint.tier };
    const system = createIntegrationSystem(normalizedBlueprint, index + integrationBlueprints.length);
    const primaryOperation = blueprint.operations[0][0];

    system.id = `academy-${blueprint.id}`;
    system.category = blueprint.domain;
    system.phase = blueprint.phase;
    system.source = `../../src/ServerScriptService/Services/Academy/${blueprint.folder}/${blueprint.name}.luau`;
    system.learningLevels = blueprint.levels;
    system.stages = blueprint.levels.map((level) => `${level.name}: ${level.goal}`).concat([
      `Contrato: documentar entradas, retornos e erros de ${primaryOperation}.`,
      `Segurança: provar que o cliente não altera a fonte de verdade de ${blueprint.name}.`,
      "Produção: executar os testes de falha, retry, concorrência e recuperação."
    ]);
    system.question = `${blueprint.why} Como ${blueprint.name} elimina esse problema sem assumir dados que pertencem a outro serviço?`;
    system.mentalModel = [
      `Dor que inicia o projeto: ${blueprint.why}`,
      `Responsabilidade única: ${blueprint.role}`,
      `A primeira fronteira é ${primaryOperation}; ela recebe intenção e devolve um resultado de domínio previsível.`,
      "A progressão Básico → Intermediário → Avançado aumenta confiabilidade e escala sem trocar a fonte de verdade."
    ];
    system.course.what = `${blueprint.name} pertence à especialização ${blueprint.domain} e ${blueprint.role.charAt(0).toLocaleLowerCase("pt-BR")}${blueprint.role.slice(1)}`;
    system.course.exercise = `${blueprint.levels[0].goal} Depois, force uma falha da primeira dependência e implemente ${blueprint.levels[2].goal.charAt(0).toLocaleLowerCase("pt-BR")}${blueprint.levels[2].goal.slice(1)}`;
    system.course.summary = [
      `Especialização: ${blueprint.domain}.`,
      `Operação inicial: ${primaryOperation}.`,
      `Básico: ${blueprint.levels[0].goal}`,
      `Intermediário: ${blueprint.levels[1].goal}`,
      `Avançado: ${blueprint.levels[2].goal}`
    ];
    return system;
  }

  systems.push(
    ...integrationBlueprints.map(createIntegrationSystem),
    ...expansionBlueprints.map(createExpansionSystem)
  );

  const roadmap = [
    {
      title: "Fundação econômica",
      systems: ["currency-exchange", "tax", "discount"],
      purpose: "Defina como valor é representado, transformado e reduzido antes de criar fluxos que dependem dele.",
      gate: "Saldos não ficam negativos; cálculos não alteram estado; taxas possuem teto."
    },
    {
      title: "Cálculos de leitura",
      systems: ["market-price", "crafting-cost"],
      purpose: "Crie cotações e preços que possam ser exibidos e testados sem movimentar itens ou dinheiro.",
      gate: "Mesma entrada e mesmo estado produzem o mesmo resultado; previews são puros."
    },
    {
      title: "Adaptadores de gameplay",
      systems: ["resource-gathering", "sell-all"],
      purpose: "Ligue ações do mundo aos serviços existentes, preservando inventário e economia como fontes de verdade.",
      gate: "O servidor prova distância, cooldown e seleção; nenhuma regra central foi copiada."
    },
    {
      title: "Estado financeiro persistente",
      systems: ["bank", "loan"],
      purpose: "Adicione contas e contratos somente depois de definir importação, exportação e relógio do servidor.",
      gate: "Reconectar não cria dinheiro, apaga dívida nem reaplica o mesmo intervalo de juros."
    },
    {
      title: "Custódia e concorrência",
      systems: ["auction-house"],
      purpose: "Implemente o fluxo mais arriscado por último, quando carteira, imposto, inventário e eventos já estiverem estáveis.",
      gate: "Cada estado explica exatamente quem possui item e dinheiro; todos os caminhos têm rollback."
    },
    {
      title: "Auditoria e economia social",
      systems: ["wallet-history", "gifting"],
      purpose: "Registre mutações da carteira antes de permitir transferências unilaterais entre jogadores.",
      gate: "Cada presente possui referência auditável, limite diário, cooldown e compensação em caso de falha."
    },
    {
      title: "Benefícios e contratos",
      systems: ["vip-benefits", "subscription", "refund"],
      purpose: "Modele vantagens, assinaturas e reversões internas como contratos de domínio independentes da compra em Robux.",
      gate: "Benefícios são idempotentes; expiração é previsível; reembolso nunca promete devolver Robux."
    },
    {
      title: "Progressão principal",
      systems: ["leveling", "skill-tree"],
      purpose: "Estabeleça XP e níveis antes de conectar desbloqueios permanentes e custos da árvore de habilidades.",
      gate: "Importar dados não concede XP novamente; habilidades bloqueadas não debitam saldo; compras repetidas são recusadas."
    },
    {
      title: "Reconhecimento do progresso",
      systems: ["prestige-tier", "badge", "title"],
      purpose: "Converta conquistas já validadas em tiers, badges da plataforma e títulos equipáveis.",
      gate: "Tier não executa reset; badge exige ID real; apenas títulos desbloqueados podem ser equipados."
    },
    {
      title: "Fronteira com o jogador",
      systems: [],
      purpose: "Só então exponha RemoteFunctions, UI, notificações, rate limits e telemetria sobre contratos maduros.",
      gate: "Entradas são validadas no servidor e respostas usam erros de domínio previsíveis."
    },
    {
      title: "Integração básica",
      systems: integrationBlueprints.filter((item) => item.tier === "Básico").map((item) => `integration-${item.id}`),
      purpose: "Construa contratos locais de estado, catálogo, recompensa e interação antes de lidar com concorrência ou múltiplos servidores.",
      gate: "Cada serviço possui fonte de verdade explícita, handler registrado, payload validado e teste de RequestId repetido."
    },
    {
      title: "Integração intermediária",
      systems: integrationBlueprints.filter((item) => item.tier === "Intermediário").map((item) => `integration-${item.id}`),
      purpose: "Combine serviços básicos em transações, crafting, trades, filas, auditoria e ferramentas operacionais.",
      gate: "Falhas parciais possuem compensação; registros usam IDs estáveis; nenhum cliente escreve diretamente no domínio."
    },
    {
      title: "Integração avançada",
      systems: integrationBlueprints.filter((item) => item.tier === "Avançado").map((item) => `integration-${item.id}`),
      purpose: "Prepare concorrência, coordenação entre servidores, rollout, recuperação e performance para produção.",
      gate: "Retry possui limite; locks expiram; shutdown drena; rollback atua sobre dados e toda operação distribuída é observável."
    }
  ];

  roadmap.push(...[...new Set(expansionBlueprints.map((item) => item.domain))].map((domain) => ({
    title: domain,
    systems: expansionBlueprints.filter((item) => item.domain === domain).map((item) => `academy-${item.id}`),
    purpose: `Evolua os contratos de ${domain.toLocaleLowerCase("pt-BR")} do protótipo local até uma versão observável e preparada para produção.`,
    gate: "Cada módulo deve passar pelas provas Básico, Intermediário e Avançado sem confiar no cliente nem duplicar a fonte de verdade."
  })));

  const architecture = [
    { label: "Fundação", ids: ["currency-exchange", "tax", "discount"] },
    { label: "Cálculo", ids: ["market-price", "crafting-cost"] },
    { label: "Operação", ids: ["resource-gathering", "sell-all"] },
    { label: "Estado", ids: ["bank", "loan"] },
    { label: "Custódia", ids: ["auction-house"] },
    { label: "Auditoria social", ids: ["wallet-history", "gifting"] },
    { label: "Benefícios", ids: ["vip-benefits", "subscription", "refund"] },
    { label: "Progressão", ids: ["leveling", "skill-tree"] },
    { label: "Reconhecimento", ids: ["prestige-tier", "badge", "title"] }
  ];

  architecture.push(
    { label: "Integração básica", ids: integrationBlueprints.filter((item) => item.tier === "Básico").slice(0, 6).map((item) => `integration-${item.id}`) },
    { label: "Integração intermediária", ids: integrationBlueprints.filter((item) => item.tier === "Intermediário").slice(0, 6).map((item) => `integration-${item.id}`) },
    { label: "Integração avançada", ids: integrationBlueprints.filter((item) => item.tier === "Avançado").slice(0, 6).map((item) => `integration-${item.id}`) }
  );

  const principles = [
    ["database", "Escolha a fonte de verdade", "Saldo, item, preço e contrato precisam ter um único dono. Outros módulos consultam ou delegam."],
    ["split", "Separe cálculo de mutação", "Quote, Split, Preview e Calculate existem para pensar e mostrar resultados sem alterar o jogo."],
    ["rotate-ccw", "Projete o rollback", "Antes do caminho feliz, escreva como cada débito, remoção ou custódia será desfeito."],
    ["shield-check", "Valide no servidor", "O cliente expressa intenção. Distância, saldo, item, taxa e recompensa são decididos no servidor."]
  ];

  const conceptGuides = {
    cframes: {
      route: "cframes",
      title: "CFrames",
      subtitle: "Como pensar em posicao, rotacao, espaco local, espaco global e movimento preciso no Roblox.",
      icon: "box",
      eyebrow: "Fundamento Roblox",
      calloutTitle: "A ideia central",
      callout: "CFrame e uma matriz de transformacao: ele guarda onde algo esta e para onde ele esta olhando. Pense nele como o sistema de coordenadas particular de uma peca, modelo ou camera.",
      metrics: [
        ["Resolve", "Posicao + rotacao"],
        ["Evita", "gimbal mental"],
        ["Usa", "World/Object space"],
        ["Aplica", "PivotTo, camera, tween"]
      ],
      mentalModel: [
        ["Vector3 e ponto", "Vector3 sozinho descreve posicao ou direcao. CFrame descreve posicao, orientacao e conversao entre espacos."],
        ["Frente, cima e lado", "LookVector aponta para frente, UpVector aponta para cima e RightVector aponta para o lado direito daquele objeto."],
        ["Local contra mundo", "ToWorldSpace leva um deslocamento local para o mundo. ToObjectSpace transforma uma posicao do mundo em referencia local."],
        ["Composicao", "Multiplicar CFrames encadeia transformacoes. A ordem importa: mover e depois girar nao e igual a girar e depois mover."]
      ],
      learningSteps: [
        ["Comece com pontos", "Use CFrame.new(x, y, z) para posicionar uma Part sem se preocupar com giro."],
        ["Adicione orientacao", "Use CFrame.Angles(math.rad(x), math.rad(y), math.rad(z)) quando precisar rotacionar em eixos conhecidos."],
        ["Olhe para alvos", "Use CFrame.lookAt(origin, target) para cameras, torres, NPCs e objetos que precisam mirar."],
        ["Entre em espaco local", "Use part.CFrame:ToObjectSpace(target.CFrame) para salvar offsets relativos, como encaixes e attachments."],
        ["Volte para o mundo", "Use base.CFrame:ToWorldSpace(localOffset) para reconstruir posicoes relativas quando a base se move."],
        ["Mova modelos com pivot", "Use Model:PivotTo(cframe) para mover um modelo inteiro de forma consistente."]
      ],
      apiRows: [
        ["CFrame.new(x, y, z)", "Cria um CFrame apenas com posicao.", "Spawn, teleporte, pontos fixos"],
        ["CFrame.Angles(rx, ry, rz)", "Cria rotacao em radianos.", "Giros simples e offsets"],
        ["CFrame.lookAt(from, to)", "Cria CFrame olhando de um ponto para outro.", "Camera, mira, torre"],
        ["cf.Position", "Retorna a posicao do CFrame.", "Leitura rapida"],
        ["cf.LookVector", "Direcao frontal do CFrame.", "Projetil, raycast, camera"],
        ["cf:ToWorldSpace(offset)", "Converte offset local para mundo.", "Slots, encaixes, orbitas"],
        ["cf:ToObjectSpace(world)", "Converte mundo para local.", "Salvar posicao relativa"],
        ["model:PivotTo(cf)", "Move o pivot do modelo para um CFrame.", "Tycoons, maquinas, NPCs"]
      ],
      examples: [
        {
          title: "Mover uma maquina para o plot",
          code: `local machine = workspace.TemplateMachine:Clone()
machine.Parent = workspace

local plotPivot = plot.Model:GetPivot()
local localOffset = CFrame.new(0, 2, -12)

machine:PivotTo(plotPivot:ToWorldSpace(localOffset))`
        },
        {
          title: "Fazer uma torre olhar para o alvo",
          code: `local origin = tower.Barrel.Position
local target = enemy.PrimaryPart.Position

tower.Barrel.CFrame = CFrame.lookAt(origin, target)`
        },
        {
          title: "Mover para frente do proprio objeto",
          code: `local distance = 8
local current = part.CFrame

part.CFrame = current + current.LookVector * distance`
        }
      ],
      mistakes: [
        ["Somar rotacao como se fosse posicao", "Rotacao vive no CFrame. Use multiplicacao por CFrame.Angles para girar."],
        ["Confundir eixo local com eixo global", "Vector3.new(0, 0, -5) no mundo nao e necessariamente para frente do objeto."],
        ["Usar SetPrimaryPartCFrame em codigo novo", "Prefira Model:PivotTo e Model:GetPivot para modelos modernos."],
        ["Esquecer math.rad", "CFrame.Angles recebe radianos, nao graus."],
        ["Mover no cliente algo autoritativo", "Movimento que afeta gameplay deve ser validado ou executado no servidor."]
      ],
      systems: [
        ["Sistema de colocacao", "Salva offsets locais dentro do plot e recria maquinas com ToWorldSpace."],
        ["Sistema de mira", "Usa lookAt e LookVector para torres, cameras e projeteis."],
        ["Sistema de cutscene", "Interpola CFrames de camera com TweenService ou Lerp."],
        ["Sistema de montagem", "Transforma slots locais em posicoes reais para esteiras, fabricas e decoracao."]
      ]
    },
    humanoid: {
      route: "humanoid",
      title: "Humanoid",
      subtitle: "Como controlar vida, movimento, estados, animacoes e comportamento de personagens/NPCs.",
      icon: "person-standing",
      eyebrow: "Fundamento Roblox",
      calloutTitle: "A ideia central",
      callout: "Humanoid e o controlador de personagem do Roblox. Ele cuida de vida, movimento, estados fisicos, animacao e morte, mas a regra de jogo deve continuar em servicos do servidor.",
      metrics: [
        ["Controla", "vida e movimento"],
        ["Depende", "rig + Animator"],
        ["Exige", "validacao servidor"],
        ["Serve", "players e NPCs"]
      ],
      mentalModel: [
        ["Humanoid nao e IA", "Ele move e representa o corpo, mas decisao de comportamento pertence a um sistema de NPC, combate ou quest."],
        ["RootPart e ancora logica", "HumanoidRootPart costuma ser a referencia de posicao, raycast, distancia e teleporte."],
        ["Estados explicam movimento", "Running, Jumping, FallingDown, Dead e outros estados ajudam a reagir sem adivinhar pelo frame."],
        ["Animator toca animacoes", "Carregue AnimationTrack no Animator do Humanoid para manter o fluxo padrao do Roblox."]
      ],
      learningSteps: [
        ["Encontre o personagem", "Espere CharacterAdded e procure Humanoid e HumanoidRootPart com WaitForChild."],
        ["Leia sem mandar", "Use Health, MaxHealth, MoveDirection e FloorMaterial para observar estado antes de alterar."],
        ["Aplique regras no servidor", "Dano, cura, recompensa por morte e teleporte precisam ser decididos por codigo confiavel."],
        ["Use MoveTo com cuidado", "Humanoid:MoveTo serve para destinos simples; pathfinding deve coordenar os proximos pontos."],
        ["Controle estados importantes", "StateChanged, Died e HealthChanged sao melhores do que loops tentando detectar tudo."],
        ["Separe visual de regra", "Animacao e efeitos podem ser locais; vida, dano e recompensas ficam autoritativos."]
      ],
      apiRows: [
        ["Humanoid.Health", "Vida atual do personagem.", "Combate, dano, cura"],
        ["Humanoid.MaxHealth", "Limite de vida.", "Progressao, buffs"],
        ["Humanoid.WalkSpeed", "Velocidade de caminhada.", "Sprint, stun, VIP"],
        ["Humanoid.JumpPower / JumpHeight", "Forca ou altura de pulo.", "Obby, buffs"],
        ["Humanoid:TakeDamage(amount)", "Aplica dano respeitando o sistema do Humanoid.", "Combate servidor"],
        ["Humanoid:MoveTo(position)", "Pede movimento ate um ponto.", "NPC simples, quest"],
        ["Humanoid.Died", "Evento disparado ao morrer.", "Drops, respawn, analytics"],
        ["Humanoid.StateChanged", "Evento de mudanca de estado.", "Queda, pulo, ragdoll"],
        ["Animator:LoadAnimation(animation)", "Cria uma faixa de animacao.", "Ataque, coleta, celebracao"]
      ],
      examples: [
        {
          title: "Preparar humanoid do jogador",
          code: `local Players = game:GetService("Players")

local function onCharacter(character)
    local humanoid = character:WaitForChild("Humanoid")
    local root = character:WaitForChild("HumanoidRootPart")

    humanoid.WalkSpeed = 16
    print("Spawn em", root.Position)
end

Players.PlayerAdded:Connect(function(player)
    player.CharacterAdded:Connect(onCharacter)
end)`
        },
        {
          title: "Aplicar dano no servidor",
          code: `local function damageCharacter(character, amount)
    local humanoid = character:FindFirstChildOfClass("Humanoid")
    if not humanoid or humanoid.Health <= 0 then
        return false
    end

    humanoid:TakeDamage(math.max(0, amount))
    return true
end`
        },
        {
          title: "Mover NPC por pontos",
          code: `for _, waypoint in ipairs(path:GetWaypoints()) do
    humanoid:MoveTo(waypoint.Position)
    local reached = humanoid.MoveToFinished:Wait()
    if not reached then
        break
    end
end`
        }
      ],
      mistakes: [
        ["Alterar WalkSpeed no cliente e confiar nisso", "O cliente pode simular visual, mas regra de velocidade precisa ser validada no servidor."],
        ["Usar loops pesados para detectar morte", "Humanoid.Died ja entrega o evento certo."],
        ["Assumir que Character sempre existe", "Personagem recria no respawn. Conecte CharacterAdded e trate nil."],
        ["Misturar animacao com dano", "AnimationTrack nao deve ser a fonte de verdade do hit; use janelas/hitboxes validadas."],
        ["Ignorar rig R6/R15", "Animacoes, nomes de partes e joints podem mudar conforme o rig."]
      ],
      systems: [
        ["Sistema de combate", "Centraliza dano, cooldown, hitbox e recompensa por morte."],
        ["Sistema de NPC", "Usa Humanoid para locomocao, mas a decisao vem de estados de IA."],
        ["Sistema de buffs", "Aplica WalkSpeed, JumpHeight e MaxHealth com expiracao clara."],
        ["Sistema de animacao", "Carrega AnimationTracks por acao e cancela conflitos previsivelmente."]
      ]
    },
    "ai-programming": {
      route: "ai-programming",
      title: "IA para NPCs e Inimigos",
      subtitle: "Como construir agentes que percebem, lembram, decidem, navegam e agem sem transformar cada NPC em um loop pesado e imprevisível.",
      icon: "brain-circuit",
      eyebrow: "Inteligência de gameplay",
      calloutTitle: "IA não é uma função mágica",
      callout: "Uma IA de jogo é um ciclo controlado: observar o mundo, atualizar memória, escolher uma intenção e executar uma ação. Pathfinding move o corpo; ele não decide o que o personagem deseja fazer.",
      metrics: [
        ["Entrada", "percepção"],
        ["Contexto", "memória"],
        ["Escolha", "decisão"],
        ["Saída", "ação"]
      ],
      mentalModel: [
        ["Sensor não é cérebro", "Visão, audição, dano recebido e distância apenas produzem fatos. Outra camada transforma esses fatos em decisão."],
        ["Memória evita amnésia por frame", "O blackboard guarda alvo atual, última posição vista, ameaça, cooldowns e objetivo para que o agente preserve contexto."],
        ["Decisão escolhe intenção", "Idle, Patrol, Chase, Attack, Flee e Return são intenções. Cada uma possui condições claras de entrada e saída."],
        ["Ação executa a intenção", "Navegação, animação, ataque e fala obedecem à decisão, mas não alteram o estado por conta própria."],
        ["Servidor decide gameplay", "Alvo válido, dano, loot e morte pertencem ao servidor. O cliente pode apresentar animações e efeitos próximos."],
        ["IA possui orçamento", "Nem todo NPC precisa pensar a cada frame. Frequência, distância e importância definem quanto processamento ele recebe."],
        ["Gameplay AI não exige machine learning", "FSM, árvores, pontuação e regras produzem comportamentos ricos, previsíveis e baratos. Redes neurais e IA generativa resolvem outra classe de problema."]
      ],
      learningSteps: [
        ["Defina o papel", "Escreva em uma frase o que o agente protege, procura ou evita. Um guarda e um monstro agressivo não compartilham a mesma prioridade."],
        ["Liste estímulos", "Determine o que ele pode perceber: linha de visão, raio, som, dano recebido, aliados e objetivo do mapa."],
        ["Crie o blackboard", "Guarde somente fatos úteis à decisão, com timestamps e referências que possam ser invalidadas."],
        ["Escolha o decisor", "Comece com FSM. Migre para Behavior Tree ou Utility AI quando transições ou prioridades realmente exigirem."],
        ["Separe navegação", "Um Navigator calcula e acompanha caminhos; o Brain apenas pede para alcançar uma posição."],
        ["Separe combate", "CombatService valida alcance, cooldown, linha de visão, dano e morte sem depender da animação."],
        ["Adicione recuperação", "Alvo destruído, caminho bloqueado e MoveTo falhando devem retornar a um estado conhecido."],
        ["Distribua o custo", "Pense em intervalos, lotes e níveis de detalhe antes de colocar dezenas de cérebros no Heartbeat."]
      ],
      apiRows: [
        ["PathfindingService:CreatePath(params)", "Cria um Path configurado para o tamanho e capacidades do agente.", "Navegação com obstáculos"],
        ["Path:ComputeAsync(start, finish)", "Calcula um caminho entre dois Vector3 e pode falhar.", "Ao trocar destino ou recuperar bloqueio"],
        ["Path:GetWaypoints()", "Retorna os pontos ordenados e ações como pulo.", "Conduzir Humanoid ou controlador próprio"],
        ["Path.Blocked", "Informa que um trecho do caminho foi bloqueado.", "Recalcular somente quando o bloqueio está adiante"],
        ["Humanoid:MoveTo(position)", "Solicita que o corpo caminhe até um ponto.", "Executar o waypoint atual"],
        ["Humanoid.MoveToFinished", "Informa sucesso ou falha do deslocamento solicitado.", "Avançar, recuperar ou recalcular"],
        ["Workspace:Raycast(origin, direction, params)", "Testa linha de visão com filtros explícitos.", "Visão, tiro e cobertura"],
        ["Workspace:GetPartBoundsInRadius(...)", "Busca candidatos espaciais próximos antes de filtros caros.", "Percepção em área e explosões"],
        ["CollectionService:GetTagged(tag)", "Obtém agentes ou pontos marcados sem depender de uma pasta fixa.", "Spawns, patrulhas e componentes"],
        ["Model:GetPivot()", "Fornece a transformação de referência do agente ou alvo.", "Distância, retorno e orientação"],
        ["os.clock()", "Fornece tempo monotônico para intervalos curtos e cooldowns de runtime.", "Think rate, ataques e recálculo"],
        ["RunService.Heartbeat", "Permite alimentar um scheduler central, não um loop pesado por NPC.", "Distribuição controlada de atualizações"]
      ],
      examples: [
        {
          title: "Troca de estado com ciclo de vida",
          code: `local Brain = {}
Brain.__index = Brain

function Brain.new(states, initialState)
    local self = setmetatable({
        States = states,
        Current = initialState,
    }, Brain)
    states[initialState]:Enter(self)
    return self
end

function Brain:Step(context)
    local state = self.States[self.Current]
    local nextState = state:Update(self, context)
    if nextState and nextState ~= self.Current then
        state:Exit(self)
        self.Current = nextState
        self.States[nextState]:Enter(self)
    end
end`
        },
        {
          title: "Linha de visão sem atravessar parede",
          code: `local Workspace = game:GetService("Workspace")

local function canSee(observerRoot, targetCharacter)
    local targetRoot = targetCharacter:FindFirstChild("HumanoidRootPart")
    if not targetRoot then
        return false
    end

    local params = RaycastParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude
    params.FilterDescendantsInstances = { observerRoot.Parent }

    local direction = targetRoot.Position - observerRoot.Position
    local result = Workspace:Raycast(observerRoot.Position, direction, params)
    return result ~= nil and result.Instance:IsDescendantOf(targetCharacter)
end`
        },
        {
          title: "Scheduler que distribui os cérebros",
          code: `local THINK_INTERVAL = 0.2
local buckets = 4
local tickIndex = 0
local lastTick = 0

RunService.Heartbeat:Connect(function()
    local now = os.clock()
    if now - lastTick < THINK_INTERVAL / buckets then
        return
    end
    lastTick = now
    tickIndex = (tickIndex % buckets) + 1

    for index, brain in brains do
        if ((index - 1) % buckets) + 1 == tickIndex then
            brain:Think(now)
        end
    end
end)`
        },
        {
          title: "Escolha simples por prioridade",
          code: `local function chooseState(context)
    if context.HealthRatio < 0.2 and context.CanFlee then
        return "Flee"
    elseif context.TargetInAttackRange and context.AttackReady then
        return "Attack"
    elseif context.HasVisibleTarget then
        return "Chase"
    elseif context.HasLastKnownPosition then
        return "Investigate"
    end
    return "Patrol"
end`
        }
      ],
      aiLayers: [
        ["01", "Percepção", "Produz candidatos por raio, visão, som ou evento. Primeiro filtra barato; depois confirma com raycast e regras."],
        ["02", "Memória", "Mantém alvo, última posição conhecida, ameaça, objetivo, tempo desde o último contato e dados compartilhados."],
        ["03", "Decisão", "Compara condições ou pontua opções e escolhe uma intenção sem mover o corpo diretamente."],
        ["04", "Navegação", "Calcula caminho, acompanha waypoints, trata bloqueios e informa sucesso ou falha ao cérebro."],
        ["05", "Ação", "Executa ataque, interação, fuga, trabalho ou habilidade por serviços autoritativos."],
        ["06", "Apresentação", "Animação, som, fala, partículas e telegraph comunicam a intenção ao jogador."]
      ],
      aiPatterns: [
        ["Básico", "Máquina de estados", "Poucos comportamentos mutuamente exclusivos.", "Clara e fácil de depurar; muitas transições podem virar uma teia."],
        ["Intermediário", "Behavior Tree", "Sequências, seletores e comportamentos reutilizáveis.", "Boa composição hierárquica; exige nós pequenos e observabilidade."],
        ["Intermediário", "Utility AI", "Várias ações competem por uma pontuação contextual.", "Decisões flexíveis; curvas e pesos precisam ser explicáveis."],
        ["Avançado", "GOAP", "O agente precisa montar um plano a partir de objetivos e efeitos.", "Poderoso para mundos sistêmicos; planejamento e debugging custam mais."],
        ["Especializado", "Steering / flocking", "Movimento local de grupos, separação e alinhamento.", "Complementa navegação; não substitui decisão de alto nível."],
        ["Coordenação", "Director AI", "Um sistema global controla pressão, ondas, spawns e ritmo.", "Evita que cada inimigo decida isoladamente o ritmo da partida."]
      ],
      enemyBlueprints: [
        ["Melee", "Visão curta + dano recebido", "Perseguir, cercar ou recuar", "Pathfinding, ataque corpo a corpo"],
        ["Ranged", "Linha de visão + distância ideal", "Buscar ângulo, manter alcance, atirar", "Cobertura, projétil e reposicionamento"],
        ["Boss", "Fases + vida + arena", "Escolher padrão legível por fase", "Telegraph, habilidade e invocação"],
        ["Worker NPC", "Fila de trabalho + máquina livre", "Reservar tarefa, executar, entregar", "Navegação e interação de tycoon"],
        ["Civilian", "Perigo + rotina + destino", "Continuar rotina, observar ou fugir", "Movimento leve e diálogo"],
        ["Squad", "Alvos e memória compartilhada", "Distribuir papéis e evitar sobreposição", "Blackboard de grupo e slots de ataque"]
      ],
      classConcepts: [
        {
          kind: "Concreta",
          name: "Classe concreta",
          definition: "Representa um objeto completo que pode ser instanciado e usado diretamente.",
          mentalModel: "Enemy.new(model) cria um inimigo real com estado próprio. Todos os métodos necessários para esse tipo estão implementados.",
          use: "Use para agentes finais como MeleeEnemy, WorkerNPC ou TurretBrain.",
          avoid: "Evite colocar nela serviços globais, configurações compartilhadas e toda variação possível de inimigo.",
          code: `--!strict
local Enemy = {}
Enemy.__index = Enemy

type EnemyData = {
    Model: Model,
    Health: number,
}

export type Enemy = typeof(setmetatable({} :: EnemyData, Enemy))

function Enemy.new(model: Model): Enemy
    return setmetatable({
        Model = model,
        Health = 100,
    }, Enemy)
end

function Enemy:TakeDamage(amount: number)
    self.Health = math.max(0, self.Health - amount)
end

return Enemy`
        },
        {
          kind: "Abstrata",
          name: "Classe abstrata",
          definition: "Descreve uma base incompleta e um contrato para classes concretas; ela não deveria ser criada diretamente.",
          mentalModel: "Agent define o que todo cérebro precisa oferecer, enquanto MeleeAgent decide como implementar ChooseAction.",
          use: "Use quando vários agentes compartilham ciclo de vida e invariantes reais, mas implementam partes específicas.",
          avoid: "Luau não possui abstract nativo. Se a herança só economiza poucas linhas, prefira tipos exportados e composição.",
          code: `-- AgentBase.luau
local AgentBase = {}
AgentBase.__index = AgentBase

function AgentBase.new()
    error("AgentBase é abstrata; crie uma classe concreta")
end

function AgentBase:_create(model)
    return setmetatable({ Model = model }, self)
end

function AgentBase:ChooseAction(_context)
    error("ChooseAction precisa ser implementado")
end

return AgentBase

-- MeleeAgent.luau (outro ModuleScript)
local AgentBase = require(script.Parent.AgentBase)
local MeleeAgent = setmetatable({}, AgentBase)
MeleeAgent.__index = MeleeAgent

function MeleeAgent.new(model)
    return setmetatable(AgentBase:_create(model), MeleeAgent)
end

function MeleeAgent:ChooseAction(context)
    return context.InRange and "Attack" or "Chase"
end

return MeleeAgent`
        },
        {
          kind: "Estática",
          name: "Classe estática",
          definition: "Funciona como um namespace de funções compartilhadas e não cria instâncias com estado individual.",
          mentalModel: "Targeting.GetClosest(...) calcula um resultado. Não existe Targeting.new(), self ou memória por inimigo.",
          use: "Use para funções puras, validação, matemática, serialização e helpers de IA.",
          avoid: "Luau não possui static nativo. Evite esconder estado global mutável dentro do módulo, pois testes e servidores passam a compartilhar efeitos silenciosos.",
          code: `-- Targeting.luau
local Targeting = {}

function Targeting.GetClosest(origin: Vector3, candidates: {BasePart})
    local closest = nil
    local closestDistance = math.huge

    for _, candidate in candidates do
        local distance = (candidate.Position - origin).Magnitude
        if distance < closestDistance then
            closest = candidate
            closestDistance = distance
        end
    end

    return closest, closestDistance
end

return table.freeze(Targeting)

-- Chamada com ponto, sem instância:
local target = Targeting.GetClosest(origin, candidates)`
        }
      ],
      mistakes: [
        ["Pathfinding em todo frame", "Calcule quando o destino mudou o suficiente, o caminho bloqueou ou o intervalo permitido venceu."],
        ["Raycast contra todo jogador", "Faça broad phase por distância ou consulta espacial antes da confirmação cara de visão."],
        ["Estado sem entrada e saída", "Conexões, animações e reservas vazam quando a troca de estado não possui cleanup explícito."],
        ["Ataque decidido pela animação", "Animação comunica. CombatService valida alcance, cooldown, alvo e dano no servidor."],
        ["Uma classe gigante por NPC", "Separe Brain, Perception, Navigator e ações. Composição permite trocar peças sem copiar o controlador inteiro."],
        ["Herança profunda", "Duas ou três camadas já dificultam descobrir qual método roda. Prefira componentes e contratos pequenos."],
        ["Todos os NPCs com Humanoid completo", "Agentes estáticos ou distantes podem usar alternativas mais leves e níveis de detalhe."],
        ["Referência de alvo eterna", "Character morre, respawna e pode sair. Valide Parent, Humanoid e vida antes de agir."]
      ],
      systems: [
        ["NPCBrainService", "Agenda pensamentos, registra agentes e aplica níveis de detalhe."],
        ["PerceptionService", "Gera candidatos e confirma visão, som e ameaça."],
        ["Blackboard", "Guarda fatos do agente ou do grupo sem executar ações."],
        ["Navigator", "Encapsula pathfinding, waypoints, bloqueio, timeout e cancelamento."],
        ["CombatService", "Valida ataque, dano, cooldown, morte e recompensa."],
        ["SpawnDirector", "Controla população, ondas, dificuldade e ritmo global."],
        ["ReservationService", "Reserva máquinas, posições de cobertura, tarefas e slots de ataque."],
        ["NPCPresentationController", "Apresenta animações, som, VFX e telegraph perto do jogador."]
      ]
    },
    storage: {
      route: "storage",
      title: "Storage no Roblox",
      subtitle: "O que salvar, onde salvar e como pensar em dados persistentes, temporarios, rankings e referencias de objetos.",
      icon: "database",
      eyebrow: "Persistencia e estado",
      calloutTitle: "A ideia central",
      callout: "Nem todo estado deve ir para DataStore. Separe dados persistentes, dados de sessao, cache entre servidores, ranking ordenado e referencias de objetos que so existem enquanto o jogo roda.",
      metrics: [
        ["Persistente", "DataStore/ProfileStore"],
        ["Ranking", "OrderedDataStore"],
        ["Temporario", "MemoryStore"],
        ["Runtime", "Attributes/Values"]
      ],
      mentalModel: [
        ["Persistencia e contrato", "Salve apenas aquilo que precisa sobreviver ao jogador sair: dinheiro, inventario, progresso, rebirths, maquinas compradas e configuracoes."],
        ["ProfileStore e camada de seguranca", "ProfileStore organiza sessoes, bloqueios, reconciliacao de schema e autosave em cima de DataStore."],
        ["DataStore guarda dados serializaveis", "Use tabelas, strings, numeros, booleanos e arrays simples. Instances, CFrames e Vector3 precisam virar dados simples antes de salvar."],
        ["ObjectStore nao e persistencia padrao", "Quando alguem fala ObjectStore, normalmente quer dizer uma camada propria para registrar objetos do mundo por id, tipo, dono, posicao e estado."],
        ["MemoryStore e curto prazo", "Use para filas, matchmaking, locks, cooldowns globais e cache com expiracao. Nao use como save permanente."],
        ["Attributes e ValueObjects sao runtime", "Ajudam UI, scripts e replicacao durante a sessao, mas nao substituem salvar no perfil."]
      ],
      learningSteps: [
        ["Desenhe o schema", "Liste campos do perfil: moedas, inventario, maquinas, upgrades, badges internos, configuracoes e timestamps."],
        ["Defina o dono do dado", "Um PlayerDataService ou ProfileService deve ser a unica porta para ler e escrever perfil."],
        ["Converta tipos Roblox", "CFrame vira tabela de 12 numeros ou posicao + rotacao. Vector3 vira {x, y, z}. Color3 vira RGB."],
        ["Use UpdateAsync mentalmente", "Toda escrita persistente precisa considerar concorrencia, retry e versao anterior."],
        ["Aplique reconciliacao", "Quando adicionar campo novo, perfis antigos recebem defaults sem quebrar."],
        ["Salve por eventos importantes", "Autosave ajuda, mas compras, trades e mudancas criticas precisam marcar o perfil como sujo imediatamente."],
        ["Teste falha de save", "O jogo deve conseguir avisar, bloquear a saida critica ou tentar novamente sem duplicar recompensa."]
      ],
      apiRows: [
        ["DataStoreService:GetDataStore(name)", "Abre um DataStore comum por nome.", "Perfis, configuracoes globais"],
        ["DataStore:GetAsync(key)", "Leitura direta de uma chave.", "Carregamento simples"],
        ["DataStore:SetAsync(key, value)", "Escrita direta de uma chave.", "Casos controlados; cuidado com overwrite"],
        ["DataStore:UpdateAsync(key, transform)", "Atualiza usando valor anterior.", "Moedas, compras, merges, seguranca"],
        ["DataStore:RemoveAsync(key)", "Remove uma chave.", "Reset, moderacao, testes"],
        ["DataStoreService:GetOrderedDataStore(name)", "Abre ranking numerico ordenado.", "Leaderboard global"],
        ["OrderedDataStore:GetSortedAsync(...)", "Busca paginas ordenadas.", "Top dinheiro, top rebirth"],
        ["MemoryStoreService:GetQueue(name)", "Fila temporaria entre servidores.", "Matchmaking, processamento"],
        ["MemoryStoreService:GetSortedMap(name)", "Mapa ordenado com expiracao.", "Cache global, locks, placares ao vivo"],
        ["ProfileStore/ProfileService", "Biblioteca de perfil sobre DataStore.", "Save robusto de jogador"],
        ["Instance:SetAttribute(name, value)", "Estado replicado durante runtime.", "UI, tags leves, flags temporarias"],
        ["Folder + ValueObjects", "Representacao em arvore no Explorer.", "Compatibilidade e debug visual"]
      ],
      examples: [
        {
          title: "Schema de perfil recomendado",
          code: `local DEFAULT_PROFILE = {
    Version = 1,
    Currencies = {
        Cash = 0,
        Gems = 0,
        Tokens = 0,
    },
    Machines = {},
    Inventory = {},
    Rebirths = 0,
    Settings = {
        Music = true,
        Sfx = true,
    },
}`
        },
        {
          title: "Salvar CFrame como dados simples",
          code: `local function packCFrame(cf)
    return { cf:GetComponents() }
end

local function unpackCFrame(values)
    return CFrame.new(table.unpack(values))
end

local savedMachine = {
    Id = "Loom01",
    Type = "BasicLoom",
    Pivot = packCFrame(machine:GetPivot()),
}`
        },
        {
          title: "UpdateAsync para atualizar saldo",
          code: `local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerProfiles")

local function addCash(userId, amount)
    store:UpdateAsync(("Player_%d"):format(userId), function(profile)
        profile = profile or table.clone(DEFAULT_PROFILE)
        profile.Currencies.Cash += amount
        profile.UpdatedAt = os.time()
        return profile
    end)
end`
        },
        {
          title: "Objeto do mundo salvo por id",
          code: `local objectRecord = {
    ObjectId = "plot-12-machine-004",
    OwnerUserId = player.UserId,
    TemplateId = "CottonSpinner",
    Level = 3,
    Pivot = packCFrame(model:GetPivot()),
    CustomState = {
        SpeedUpgrade = 2,
        Color = { 24, 168, 160 },
    },
}`
        }
      ],
      mistakes: [
        ["Salvar Instance direto", "DataStore nao salva Part, Model, Tool, Player ou Humanoid. Salve um id e reconstrua a Instance pelo template."],
        ["Salvar CFrame sem serializar", "CFrame precisa virar tabela numerica antes de persistir."],
        ["Usar SetAsync para tudo", "SetAsync pode sobrescrever mudancas concorrentes. Para perfil e economia, prefira UpdateAsync ou ProfileStore."],
        ["Guardar dados demais", "DataStores possuem limites. Salve estado essencial, nao historico infinito nem cache recriavel."],
        ["Usar MemoryStore como save", "MemoryStore expira. Serve para coordenacao temporaria, nao para progresso do jogador."],
        ["Misturar perfil com UI", "UI deve ler uma copia/estado replicado. O perfil real fica protegido em servico de servidor."],
        ["Nao versionar schema", "Sem Version e defaults, perfis antigos quebram quando o jogo evolui."]
      ],
      systems: [
        ["PlayerDataService", "Dono do perfil persistente e reconciliacao de schema."],
        ["ObjectStoreService", "Camada propria que transforma modelos do mundo em registros serializaveis."],
        ["LeaderboardService", "Usa OrderedDataStore para rankings globais e cache local para reduzir leitura."],
        ["SessionLockService", "Usa ProfileStore ou MemoryStore para evitar dois servidores editando o mesmo perfil."],
        ["AutosaveService", "Salva em intervalos, no PlayerRemoving e depois de transacoes criticas."],
        ["MigrationService", "Atualiza perfis antigos sem apagar progresso."]
      ]
    },
    "solo-dev": {
      route: "solo-dev",
      title: "O que ninguém te fala sobre o Roblox Studio",
      subtitle: "Os serviços invisíveis que um dev solo cria para lançar, atualizar e manter um jogo vivo sem se perder no caos.",
      icon: "flame-kindling",
      eyebrow: "Bastidores de produção",
      calloutTitle: "A verdade prática",
      callout: "Fazer o jogo funcionar é só metade do trabalho. Lançar exige serviços para salvar dados, observar erros, configurar eventos, atualizar conteúdo, proteger economia, atender jogador e corrigir produção sem quebrar perfis.",
      metrics: [
        ["Antes do launch", "fundação + QA"],
        ["Durante launch", "telemetria + proteção"],
        ["Depois", "live ops + updates"],
        ["Mentalidade", "operar como produto"]
      ],
      mentalModel: [
        ["Você não lança só features", "Você lança um sistema vivo que precisa sobreviver a bug, exploit, pico de jogadores, dados antigos e atualizações semanais."],
        ["Todo serviço precisa ter dono", "Se economia, save, analytics, eventos e monetização escrevem dados sem fronteira, o jogo fica impossível de manter."],
        ["Configuração vale ouro", "Quanto mais você controla por config, menos precisa publicar versão nova para ajustar preço, recompensa, evento e balanceamento."],
        ["Logs são visão noturna", "Sem logs, métricas e histórico de transações, você descobre problemas pelo comentário irritado do jogador."],
        ["Atualização é uma rotina", "O jogo precisa de migração, flags, changelog, rollback lógico e testes de compatibilidade."],
        ["Dev solo precisa reduzir decisão repetida", "Templates, checklists, painéis internos e scripts de validação protegem sua energia."]
      ],
      learningSteps: [
        ["Crie a base antes do conteúdo", "PlayerData, config, remotes, logs, versionamento e error handling vêm antes de criar 40 máquinas novas."],
        ["Separe gameplay de operação", "Serviços de produção cuidam de deploy, eventos, analytics, moderação, suporte, economia e migração."],
        ["Pense em falha como fluxo normal", "Save pode falhar, jogador pode reconectar, compra pode duplicar tentativa, servidor pode fechar no meio de uma transação."],
        ["Faça tudo ajustável por config", "Preços, recompensas, passes, chances, limites e textos de evento devem sair de tabelas versionadas."],
        ["Tenha checklist de lançamento", "Antes de publicar, valide datastore, produto, badge, teleport, permissões, mobile, Xbox/console se aplicar e performance."],
        ["Planeje atualização com migração", "Toda mudança de schema precisa aceitar perfil antigo. Nunca assuma que todos os jogadores têm dados novos."],
        ["Monitore o jogo depois de publicar", "Observe retenção, dinheiro entrando, falhas de save, erros de remotes, funil tutorial e abandono por etapa."]
      ],
      apiRows: [
        ["PlayerDataService", "Carrega, bloqueia, reconcilia, salva e libera perfis.", "Obrigatório antes de economia real"],
        ["ConfigService", "Centraliza valores de balanceamento e features ligadas/desligadas.", "Ajustes rápidos sem espalhar números"],
        ["RemoteGatewayService", "Valida tipos, cooldowns, distância, posse e permissões dos remotes.", "Primeira barreira contra exploit"],
        ["TransactionService", "Garante idempotência para compras, trades, recompensas e moedas.", "Evita duplicação e perda de ativos"],
        ["MigrationService", "Atualiza dados antigos para schemas novos.", "Toda atualização persistente"],
        ["AnalyticsService", "Registra funis, economia, retenção, mortes, compras e erros de fluxo.", "Decidir com evidência"],
        ["ErrorReporterService", "Agrupa erros de servidor/cliente e contexto útil.", "Corrigir produção sem adivinhar"],
        ["FeatureFlagService", "Liga/desliga sistemas, eventos e testes A/B por servidor ou porcentagem.", "Lançamentos graduais"],
        ["LiveOpsEventService", "Agenda eventos, boosts, quests temporárias e recompensas sazonais.", "Atualizações semanais"],
        ["PatchNotesService", "Mostra changelog por versão e marca leitura do jogador.", "Comunicar updates"],
        ["EconomyAuditService", "Audita fontes e drenos de moeda, compras, refunds internos e anomalias.", "Proteger economia"],
        ["ProductReceiptService", "Processa Developer Products com recibo idempotente.", "Monetização segura"],
        ["GamePassEntitlementService", "Consulta e cacheia benefícios de passes.", "VIP, boosts, permissões"],
        ["RewardInboxService", "Entrega recompensas pendentes quando jogador reconecta.", "Evitar perda por falha de sessão"],
        ["ModerationService", "Aplica mute, ban interno, bloqueios de trade e revisão de abuso.", "Operação e comunidade"],
        ["SupportSnapshotService", "Gera resumo do perfil para investigação.", "Resolver ticket sem abrir tudo manualmente"],
        ["ServerShutdownService", "Fecha servidor salvando perfis e bloqueando novas transações.", "Atualização e shutdown"],
        ["PerformanceBudgetService", "Observa memória, instâncias, loops, remotes e tempo de scripts.", "Manter FPS e servidor saudável"],
        ["AssetPreloadService", "Pré-carrega assets críticos e detecta falhas visuais.", "Primeira impressão melhor"],
        ["TutorialFunnelService", "Marca cada etapa do onboarding.", "Descobrir onde jogadores travam"],
        ["ContentUnlockService", "Controla ilhas, máquinas, áreas, receitas e requisitos.", "Atualizar conteúdo sem bagunçar regras"],
        ["DailyQuestService", "Gera objetivos diários e evita repetição abusiva.", "Retenção"],
        ["NotificationService", "Centraliza mensagens de sistema, recompensa e erro amigável.", "UX consistente"],
        ["LocalizationTextService", "Organiza textos por chave e idioma.", "Preparar expansão"],
        ["AdminCommandService", "Comandos seguros para owner/testers.", "Debug e suporte em produção"],
        ["QAScenarioService", "Cria cenários de teste: player novo, rico, sem save, save antigo.", "Testar update antes de publicar"],
        ["BackupExportService", "Exporta snapshots internos de dados críticos quando possível.", "Mitigar erro humano"],
        ["RollbackPlanService", "Define o que desligar, migrar ou compensar se update falhar.", "Sobreviver a atualização ruim"]
      ],
      examples: [
        {
          title: "Mapa de serviços para um dev solo",
          code: `local Services = {
    Foundation = {
        "PlayerDataService",
        "ConfigService",
        "RemoteGatewayService",
        "TransactionService",
        "MigrationService",
    },
    Launch = {
        "AnalyticsService",
        "ErrorReporterService",
        "FeatureFlagService",
        "ServerShutdownService",
        "QAScenarioService",
    },
    LiveOps = {
        "LiveOpsEventService",
        "PatchNotesService",
        "DailyQuestService",
        "NotificationService",
        "ContentUnlockService",
    },
    Monetization = {
        "ProductReceiptService",
        "GamePassEntitlementService",
        "RewardInboxService",
        "EconomyAuditService",
    },
}`
        },
        {
          title: "Feature flag simples",
          code: `local FeatureFlagService = {}

FeatureFlagService.Flags = {
    SummerEvent = false,
    NewAuctionHouse = true,
    DoubleCashWeekend = false,
}

function FeatureFlagService:IsEnabled(flagName)
    return self.Flags[flagName] == true
end

return FeatureFlagService`
        },
        {
          title: "Checklist antes de publicar update",
          code: `local LaunchChecklist = {
    "Data schema reconciliado",
    "Developer Products testados",
    "GamePass benefits testados",
    "Remotes com cooldown e validacao",
    "Player novo conclui tutorial",
    "Player antigo carrega sem erro",
    "Mobile sem texto cortado",
    "Shutdown salva perfis",
    "Patch notes aparecem uma vez",
    "Feature flags podem desligar o update",
}`
        },
        {
          title: "Evento de analytics de economia",
          code: `Analytics:Track(player, "CurrencyChanged", {
    Currency = "Cash",
    Delta = 250,
    BalanceAfter = newBalance,
    Reason = "SellAll",
    ServerVersion = game.PlaceVersion,
})`
        }
      ],
      mistakes: [
        ["Criar conteúdo antes de save robusto", "Quanto mais conteúdo existe sem base de dados, mais retrabalho aparece quando você precisa persistir tudo."],
        ["Não registrar motivo de moeda", "Cash +100 sem Reason não ajuda a descobrir exploit, bug ou fonte inflada."],
        ["Atualizar schema sem migração", "Perfil antigo quebra silenciosamente e o jogador acha que perdeu progresso."],
        ["Confiar que update vai dar certo", "Sempre tenha feature flag ou plano para desligar sistema novo."],
        ["Tratar analytics como luxo", "Sem funil, você não sabe se o problema é tutorial, preço, performance ou falta de objetivo."],
        ["Usar admin sem permissão forte", "Comandos internos precisam validar UserId, ambiente e escopo."],
        ["Guardar histórico infinito no perfil", "Perfil deve carregar rápido. Histórico grande vai para logs resumidos ou snapshots limitados."],
        ["Esquecer mobile", "Grande parte do público Roblox joga no celular. UI e controles precisam ser testados cedo."],
        ["Não separar teste de produção", "Dados de QA, boosts e comandos não podem vazar para todos os jogadores."],
        ["Tentar resolver comunidade só com código", "Patch notes, mensagens claras e compensações honestas também fazem parte da operação."]
      ],
      systems: [
        ["Fundação", "PlayerDataService, ConfigService, RemoteGatewayService, TransactionService, MigrationService."],
        ["Lançamento", "QAScenarioService, ErrorReporterService, AnalyticsService, ServerShutdownService, FeatureFlagService."],
        ["Atualizações", "PatchNotesService, LiveOpsEventService, ContentUnlockService, RewardInboxService, RollbackPlanService."],
        ["Monetização", "ProductReceiptService, GamePassEntitlementService, Subscription/VIP, EconomyAuditService, RefundService interno."],
        ["Comunidade", "ModerationService, SupportSnapshotService, NotificationService, LocalizationTextService."],
        ["Qualidade", "PerformanceBudgetService, AssetPreloadService, TutorialFunnelService, AdminCommandService."]
      ]
    }
  };

  const practicalLabs = {
    cframes: {
      title: "Laboratório: colocar máquinas dentro de qualquer plot",
      goal: "O jogador posiciona uma máquina em coordenadas locais. O servidor valida o limite do plot, salva o offset e reconstrói o modelo na posição correta.",
      architecture: ["PlacementController", "PlacementRemote", "PlacementService", "ObjectStoreService"],
      steps: [
        ["Cliente cria o preview", "Raycast encontra o chão e mostra apenas uma cópia visual sem colisão."],
        ["Cliente envia intenção", "O Remote envia TemplateId e o CFrame local proposto, nunca uma Instance pronta."],
        ["Servidor valida", "Confere dono do plot, distância, custo, limites e se o template existe."],
        ["Servidor posiciona", "Converte o offset local com ToWorldSpace e usa PivotTo no clone oficial."],
        ["Servidor persiste", "Salva TemplateId e os componentes do CFrame local para recriar depois."]
      ],
      code: `-- ServerScriptService/Services/PlacementService.luau
local PlacementService = {}

local MAX_LOCAL_X = 45
local MAX_LOCAL_Z = 60

local function isInsidePlot(localCF)
    local p = localCF.Position
    return math.abs(p.X) <= MAX_LOCAL_X
        and math.abs(p.Z) <= MAX_LOCAL_Z
        and p.Y >= 0
end

function PlacementService:Place(player, plot, template, localCF)
    if typeof(localCF) ~= "CFrame" or not isInsidePlot(localCF) then
        return { Ok = false, Error = "InvalidPlacement" }
    end

    local model = template:Clone()
    model:PivotTo(plot:GetPivot():ToWorldSpace(localCF))
    model.Parent = plot.Machines

    return {
        Ok = true,
        Model = model,
        SavedPivot = { localCF:GetComponents() },
    }
end

return PlacementService`,
      test: `local plotCF = CFrame.new(100, 0, 200) * CFrame.Angles(0, math.rad(90), 0)
local localCF = CFrame.new(10, 0, -12)
local worldCF = plotCF:ToWorldSpace(localCF)

assert(plotCF:ToObjectSpace(worldCF):FuzzyEq(localCF))
print("Conversão local/mundo preservada")`
    },
    humanoid: {
      title: "Laboratório: NPC que persegue, ataca e volta ao posto",
      goal: "Construir um NPC com estados explícitos. O Humanoid executa movimento; o controlador decide quando perseguir, atacar ou retornar.",
      architecture: ["NPCController", "TargetService", "PathfindingService", "CombatService"],
      steps: [
        ["Adquira um alvo", "Procure o personagem vivo mais próximo dentro do raio de percepção."],
        ["Calcule o caminho", "Crie o Path com parâmetros compatíveis com o tamanho do rig."],
        ["Mova por waypoints", "Use MoveToFinished com timeout e recalcule quando houver bloqueio."],
        ["Ataque pelo servidor", "Distância, cooldown e dano são validados pelo CombatService."],
        ["Recupere o estado", "Sem alvo, volte ao posto inicial e limpe conexões temporárias."]
      ],
      code: `-- ServerScriptService/NPC/NPCController.luau
local PathfindingService = game:GetService("PathfindingService")

local NPCController = {}
NPCController.__index = NPCController

function NPCController.new(model, combatService)
    return setmetatable({
        Model = model,
        Humanoid = model:WaitForChild("Humanoid"),
        Root = model:WaitForChild("HumanoidRootPart"),
        SpawnPosition = model:GetPivot().Position,
        Combat = combatService,
        LastAttack = 0,
    }, NPCController)
end

function NPCController:MoveTo(targetPosition)
    local path = PathfindingService:CreatePath({ AgentCanJump = true })
    path:ComputeAsync(self.Root.Position, targetPosition)
    if path.Status ~= Enum.PathStatus.Success then
        return false
    end

    for _, point in path:GetWaypoints() do
        if point.Action == Enum.PathWaypointAction.Jump then
            self.Humanoid.Jump = true
        end
        self.Humanoid:MoveTo(point.Position)
        if not self.Humanoid.MoveToFinished:Wait() then
            return false
        end
    end
    return true
end

function NPCController:TryAttack(targetCharacter)
    local targetRoot = targetCharacter:FindFirstChild("HumanoidRootPart")
    if not targetRoot or (targetRoot.Position - self.Root.Position).Magnitude > 7 then
        return false
    end
    if os.clock() - self.LastAttack < 1.2 then return false end
    self.LastAttack = os.clock()
    return self.Combat:Damage(self.Model, targetCharacter, 12)
end

return NPCController`,
      test: `-- Teste o controlador com dependência falsa.
local fakeCombat = {
    Damage = function(_, attacker, target, amount)
        assert(attacker and target and amount == 12)
        return true
    end,
}

local controller = NPCController.new(workspace.TestNPC, fakeCombat)
assert(controller.Humanoid.Health > 0)`
    },
    "ai-programming": {
      title: "Laboratório: cérebro de inimigo testável por dependências",
      goal: "Construir um inimigo que adquire alvo, persegue, ataca e perde interesse sem misturar percepção, pathfinding e dano dentro da mesma classe.",
      architecture: ["EnemyBrain", "Perception", "Blackboard", "Navigator", "CombatService", "Scheduler"],
      steps: [
        ["Injete capacidades", "O Brain recebe percepção, navegação e combate pelo construtor para que cada parte possa ser substituída em teste."],
        ["Atualize memória", "A percepção devolve alvo e posição; o blackboard registra quando esse alvo foi visto pela última vez."],
        ["Escolha uma intenção", "Distância e cooldown selecionam Attack ou Chase; ausência prolongada seleciona Return."],
        ["Controle frequência", "Think roda em intervalo baixo. Pathfinding possui outro intervalo ainda mais lento."],
        ["Teste sem mapa real", "Fakes provam transições e chamadas sem depender do motor de navegação ou de um personagem completo."],
        ["Conecte apresentação depois", "Animação observa a mudança de estado, mas não concede dano nem escolhe o próximo estado."]
      ],
      code: `--!strict
local EnemyBrain = {}
EnemyBrain.__index = EnemyBrain

local ATTACK_RANGE = 7
local FORGET_AFTER = 4
local REPATH_INTERVAL = 0.75

function EnemyBrain.new(model, perception, navigator, combat)
    return setmetatable({
        Model = model,
        Perception = perception,
        Navigator = navigator,
        Combat = combat,
        State = "Idle",
        Target = nil,
        LastSeenAt = 0,
        LastKnownPosition = nil,
        LastPathAt = 0,
    }, EnemyBrain)
end

function EnemyBrain:SetState(nextState)
    if self.State == nextState then
        return
    end
    self.State = nextState
    -- Um controller visual pode observar esta mudança.
end

function EnemyBrain:Think(now)
    local target, targetPosition = self.Perception:Acquire(self.Model)
    if target then
        self.Target = target
        self.LastSeenAt = now
        self.LastKnownPosition = targetPosition
    elseif now - self.LastSeenAt > FORGET_AFTER then
        self.Target = nil
        self.LastKnownPosition = nil
    end

    targetPosition = targetPosition or self.LastKnownPosition
    if not self.Target or not targetPosition then
        self:SetState("Return")
        return
    end

    local origin = self.Model:GetPivot().Position
    local distance = (targetPosition - origin).Magnitude

    if distance <= ATTACK_RANGE and self.Combat:IsReady(self.Model, now) then
        self:SetState("Attack")
        self.Navigator:Stop(self.Model)
        self.Combat:TryAttack(self.Model, self.Target, now)
    elseif now - self.LastPathAt >= REPATH_INTERVAL then
        self:SetState("Chase")
        self.LastPathAt = now
        self.Navigator:GoTo(self.Model, targetPosition)
    end
end

return EnemyBrain`,
      test: `local calls = { Navigate = 0, Attack = 0 }

local perception = {
    Acquire = function()
        return workspace.Target, Vector3.new(4, 0, 0)
    end,
}

local navigator = {
    Stop = function() end,
    GoTo = function()
        calls.Navigate += 1
    end,
}

local combat = {
    IsReady = function()
        return true
    end,
    TryAttack = function()
        calls.Attack += 1
    end,
}

local brain = EnemyBrain.new(workspace.Enemy, perception, navigator, combat)
brain:Think(10)

assert(brain.State == "Attack")
assert(calls.Attack == 1)
assert(calls.Navigate == 0)`
    },
    storage: {
      title: "Laboratório: perfil versionado com máquinas persistentes",
      goal: "Carregar um perfil antigo, reconciliar campos novos e salvar máquinas como registros simples, sem guardar Instances.",
      architecture: ["PlayerDataService", "Schema", "MigrationService", "ObjectStoreService"],
      steps: [
        ["Defina defaults", "O schema contém todos os campos que um jogador novo deve receber."],
        ["Carregue com lock", "A sessão deve impedir dois servidores de editar o mesmo perfil."],
        ["Reconcilie", "Campos ausentes recebem defaults; campos existentes nunca são apagados por acidente."],
        ["Migre por versão", "Cada migração transforma uma versão conhecida na próxima."],
        ["Serialize objetos", "Modelos viram TemplateId, upgrades, dono e CFrame local empacotado."],
        ["Salve com retry", "Falhas entram em fila e nunca concedem a mesma transação duas vezes."]
      ],
      code: `-- ServerScriptService/Data/Schema.luau
local Schema = {}

Schema.Default = {
    Version = 3,
    Currencies = { Cash = 0, Gems = 0 },
    Inventory = {},
    Machines = {},
    ProcessedReceipts = {},
}

local function reconcile(target, template)
    for key, defaultValue in pairs(template) do
        if target[key] == nil then
            target[key] = type(defaultValue) == "table"
                and table.clone(defaultValue)
                or defaultValue
        elseif type(target[key]) == "table" and type(defaultValue) == "table" then
            reconcile(target[key], defaultValue)
        end
    end
end

function Schema.Upgrade(profile)
    profile.Version = profile.Version or 1
    if profile.Version == 1 then
        profile.ProcessedReceipts = {}
        profile.Version = 2
    end
    if profile.Version == 2 then
        profile.Currencies.Gems = profile.Currencies.Gems or 0
        profile.Version = 3
    end
    reconcile(profile, Schema.Default)
    return profile
end

return Schema`,
      test: `local oldProfile = {
    Version = 1,
    Currencies = { Cash = 500 },
    Inventory = { Cotton = 12 },
}

local upgraded = Schema.Upgrade(oldProfile)
assert(upgraded.Version == 3)
assert(upgraded.Currencies.Cash == 500)
assert(upgraded.Currencies.Gems == 0)
assert(upgraded.Inventory.Cotton == 12)`
    },
    "solo-dev": {
      title: "Laboratório: update desligável e observável",
      goal: "Lançar uma feature por configuração, medir uso, impedir duplicidade e conseguir desligá-la sem apagar progresso.",
      architecture: ["FeatureFlagService", "RemoteGateway", "TransactionService", "AnalyticsService"],
      steps: [
        ["Proteja a entrada", "O gateway limita frequência, valida tipos e rejeita chamadas fora de contexto."],
        ["Cheque a flag", "A regra consulta se a feature está ativa antes de qualquer mutação."],
        ["Use uma transação", "A operação recebe um identificador idempotente para retry seguro."],
        ["Registre o resultado", "Analytics recebe sucesso, motivo da falha, versão e duração."],
        ["Prepare o desligamento", "Desligar a flag bloqueia novas entradas sem corromper dados existentes."]
      ],
      code: `-- Fluxo seguro de uma feature lançada por etapas
local function handleNewMachine(player, request)
    local startedAt = os.clock()

    if not FeatureFlags:IsEnabled("NewMachineV2", player) then
        return { Ok = false, Error = "FeatureDisabled" }
    end

    local valid, errorCode = RemoteGateway:Validate(player, "BuyMachine", request)
    if not valid then
        return { Ok = false, Error = errorCode }
    end

    local result = Transactions:Run(player, request.TransactionId, function()
        return MachineService:Purchase(player, request.TemplateId)
    end)

    Analytics:Track(player, "NewMachineAttempt", {
        Ok = result.Ok,
        Error = result.Error,
        DurationMs = math.floor((os.clock() - startedAt) * 1000),
        PlaceVersion = game.PlaceVersion,
    })

    return result
end`,
      test: `-- Cenários mínimos antes de ativar para todos
local scenarios = {
    "flag desligada bloqueia compra",
    "request repetida não cobra duas vezes",
    "saldo insuficiente não cria máquina",
    "erro depois do débito executa rollback",
    "analytics registra sucesso e falha",
    "perfil antigo continua carregando",
}`
    }
  };

  let progress = loadProgress();
  let workState = loadWorkState();
  let toastTimer = null;
  let scrollRevealObserver = null;
  let scrollAnimationFrame = null;
  let pointerAnimationFrame = null;
  let latestPointerEvent = null;
  let syncTimer = null;
  let syncStatus = "local";
  let deferredInstallPrompt = null;
  let labFeedback = "";
  let currentUser = null;
  let adminState = { status: "idle", users: [], total: 0, permissions: {}, events: [], readiness: null, error: "", query: "" };
  let activeQuiz = null;
  let commerceAccount = { available: false, purchasedEnergy: 0, plusActive: false };
  let commerceCatalog = [];
  let commerceLedger = [];
  let checkoutAvailable = false;
  let promotionVerified = false;
  let checkoutReturn = { checked: false, confirmed: false, paymentStatus: "", productId: "" };
  let purchaseRefreshAttempts = 0;
  let tutorAudioConfig = { available: false, maxBytes: 0, maxDurationMs: 0, maxDaily: 0, retentionDays: 0 };
  let tutorAudioRecorder = null;
  let tutorAudioStream = null;
  let tutorAudioChunks = [];
  let tutorAudioStartedAt = 0;
  let tutorAudioStopTimer = null;
  let discardTutorAudio = false;

  const content = document.getElementById("content");
  const sidebar = document.getElementById("sidebar");
  const sidebarScrim = document.getElementById("sidebar-scrim");
  const systemNav = document.getElementById("system-nav");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  const searchClear = document.getElementById("search-clear");
  const toast = document.getElementById("toast");

  function normalizeGameState(value) {
    const source = value && typeof value === "object" ? value : {};
    const today = new Date().toISOString().slice(0, 10);
    const lastRefillDate = typeof source.lastRefillDate === "string" ? source.lastRefillDate : "";
    let earnedEnergy = Number.isFinite(source.earnedEnergy) ? Math.max(0, Math.floor(source.earnedEnergy)) : 20;
    if (lastRefillDate !== today) earnedEnergy = Math.max(earnedEnergy, 20);
    return {
      xp: Number.isFinite(source.xp) ? Math.max(0, Math.floor(source.xp)) : 0,
      earnedEnergy,
      prestige: Number.isFinite(source.prestige) ? Math.max(0, Math.min(3, Math.floor(source.prestige))) : 0,
      completedSessions: source.completedSessions && typeof source.completedSessions === "object" ? source.completedSessions : {},
      bestScores: source.bestScores && typeof source.bestScores === "object" ? source.bestScores : {},
      correctAnswers: Number.isFinite(source.correctAnswers) ? Math.max(0, Math.floor(source.correctAnswers)) : 0,
      wrongAnswers: Number.isFinite(source.wrongAnswers) ? Math.max(0, Math.floor(source.wrongAnswers)) : 0,
      streak: Number.isFinite(source.streak) ? Math.max(0, Math.floor(source.streak)) : 0,
      lastRefillDate: today,
    };
  }

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      mouseTrail: source.mouseTrail !== false,
      clickEffects: source.clickEffects !== false,
      sounds: source.sounds !== false,
      particles: source.particles !== false,
      scene3d: source.scene3d !== false,
      spoilerMode: source.spoilerMode !== false,
    };
  }

  function getGameLevel(xp = progress.game.xp) {
    return Math.floor(xp / 250) + 1;
  }

  function getLevelProgress() {
    const current = progress.game.xp % 250;
    return { current, required: 250, percentage: Math.round((current / 250) * 100) };
  }

  function getRewardMultiplier() {
    return 2 ** progress.game.prestige;
  }

  function getTotalEnergy() {
    return progress.game.earnedEnergy + commerceAccount.purchasedEnergy;
  }

  function applyVisualSettings() {
    for (const [name, value] of Object.entries(progress.settings)) {
      document.body.dataset[name] = String(value);
    }
    localStorage.setItem(VISUAL_SETTINGS_KEY, JSON.stringify(progress.settings));
    document.documentElement.classList.toggle("spoiler-mode", progress.settings.spoilerMode);
  }

  function loadProgress() {
    try {
      const accountKey = `${STORAGE_KEY}:${activeAccountId}`;
      const legacyValue = localStorage.getItem(STORAGE_KEY);
      if (activeAccountId !== "guest" && localStorage.getItem(accountKey) === null && legacyValue !== null) {
        localStorage.setItem(accountKey, legacyValue);
        localStorage.removeItem(STORAGE_KEY);
      }
      const stored = JSON.parse(localStorage.getItem(accountKey) || legacyValue);
      const sharedSettings = JSON.parse(localStorage.getItem(VISUAL_SETTINGS_KEY) || "{}");
      return {
        systems: stored?.systems && typeof stored.systems === "object" ? stored.systems : {},
        steps: stored?.steps && typeof stored.steps === "object" ? stored.steps : {},
        favorites: stored?.favorites && typeof stored.favorites === "object" ? stored.favorites : {},
        systemNotes: stored?.systemNotes && typeof stored.systemNotes === "object" ? stored.systemNotes : {},
        quizAnswers: stored?.quizAnswers && typeof stored.quizAnswers === "object" ? stored.quizAnswers : {},
        labDrafts: stored?.labDrafts && typeof stored.labDrafts === "object" ? stored.labDrafts : {},
        tutorMessages: Array.isArray(stored?.tutorMessages) ? stored.tutorMessages.slice(-40) : [],
        game: normalizeGameState(stored?.game),
        settings: normalizeSettings({ ...sharedSettings, ...stored?.settings }),
        recents: Array.isArray(stored?.recents) ? stored.recents.slice(0, 8) : [],
        lastRoute: typeof stored?.lastRoute === "string" ? stored.lastRoute : "",
        updatedAt: Number.isFinite(stored?.updatedAt) ? stored.updatedAt : 0
      };
    } catch (_error) {
      return { systems: {}, steps: {}, favorites: {}, systemNotes: {}, quizAnswers: {}, labDrafts: {}, tutorMessages: [], game: normalizeGameState(), settings: normalizeSettings(), recents: [], lastRoute: "", updatedAt: 0 };
    }
  }

  function persistProgressLocally() {
    localStorage.setItem(`${STORAGE_KEY}:${activeAccountId}`, JSON.stringify(progress));
  }

  function saveProgress(shouldSync = true) {
    if (shouldSync) progress.updatedAt = Date.now();
    persistProgressLocally();
    updateProgressUI();
    if (shouldSync) scheduleCloudSync();
  }

  function createDefaultWorkState() {
    return {
      project: {
        name: "Cotton Fabric Tycoon",
        systems: [
          { id: "data", name: "Data", done: true },
          { id: "coins", name: "Coins", done: true },
          { id: "inventory", name: "Inventory", done: true },
          { id: "machines", name: "Machines", done: true },
          { id: "quests", name: "Quests", done: false },
          { id: "live-ops", name: "Live Ops", done: false }
        ]
      },
      tasks: [
        { id: "task-review-save", title: "Testar perfil novo e perfil antigo", done: false },
        { id: "task-mobile-ui", title: "Revisar interface no mobile", done: false }
      ],
      plans: [],
      snippets: [
        {
          id: "snippet-player-character",
          title: "Encontrar Player pelo Character",
          tags: ["Players", "Character", "Server"],
          code: "local player = Players:GetPlayerFromCharacter(character)"
        }
      ],
      notes: "",
      bugs: [],
      ideas: []
    };
  }

  function loadWorkState() {
    const defaults = createDefaultWorkState();
    try {
      const accountKey = `${WORKSPACE_KEY}:${activeAccountId}`;
      const legacyValue = localStorage.getItem(WORKSPACE_KEY);
      if (activeAccountId !== "guest" && localStorage.getItem(accountKey) === null && legacyValue !== null) {
        localStorage.setItem(accountKey, legacyValue);
        localStorage.removeItem(WORKSPACE_KEY);
      }
      const stored = JSON.parse(localStorage.getItem(accountKey) || legacyValue);
      if (!stored || typeof stored !== "object") return defaults;
      const storedProject = stored.project && typeof stored.project === "object" ? stored.project : {};
      return {
        project: {
          name: typeof storedProject.name === "string" ? storedProject.name : defaults.project.name,
          systems: Array.isArray(storedProject.systems) ? storedProject.systems : defaults.project.systems
        },
        tasks: Array.isArray(stored.tasks) ? stored.tasks : defaults.tasks,
        plans: Array.isArray(stored.plans) ? stored.plans : defaults.plans,
        snippets: Array.isArray(stored.snippets) ? stored.snippets : defaults.snippets,
        notes: typeof stored.notes === "string" ? stored.notes : "",
        bugs: Array.isArray(stored.bugs) ? stored.bugs : defaults.bugs,
        ideas: Array.isArray(stored.ideas) ? stored.ideas : defaults.ideas
      };
    } catch (_error) {
      return defaults;
    }
  }

  function saveWorkState(shouldRender) {
    localStorage.setItem(`${WORKSPACE_KEY}:${activeAccountId}`, JSON.stringify(workState));
    progress.updatedAt = Date.now();
    persistProgressLocally();
    scheduleCloudSync();
    if (shouldRender) render();
  }

  function buildLearningProfile() {
    return { version: 2, progress, workspace: workState };
  }

  function scheduleCloudSync() {
    if (window.location.protocol === "file:" || syncStatus === "unavailable") return;
    clearTimeout(syncTimer);
    syncStatus = syncStatus === "synced" ? "saving" : syncStatus;
    syncTimer = setTimeout(pushLearningProfile, 900);
  }

  async function pushLearningProfile() {
    try {
      const response = await fetch("/api/learning/profile", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: buildLearningProfile() })
      });
      if (response.status === 503) {
        syncStatus = "unavailable";
        return;
      }
      if (!response.ok) throw new Error("Learning profile sync failed.");
      syncStatus = "synced";
    } catch (_error) {
      syncStatus = navigator.onLine ? "error" : "offline";
    }
  }

  async function hydrateLearningProfile() {
    try {
      const response = await fetch("/api/learning/profile", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload.syncAvailable) {
        syncStatus = "unavailable";
        return;
      }
      syncStatus = "synced";
      const remoteUpdatedAt = Number(payload.profile?.progress?.updatedAt) || 0;
      if (payload.profile && remoteUpdatedAt > progress.updatedAt) {
        const remoteProgress = payload.profile.progress;
        localStorage.setItem(`${STORAGE_KEY}:${activeAccountId}`, JSON.stringify(remoteProgress));
        if (payload.profile.workspace) {
          localStorage.setItem(`${WORKSPACE_KEY}:${activeAccountId}`, JSON.stringify(payload.profile.workspace));
        }
        progress = loadProgress();
        workState = loadWorkState();
        renderSystemNav();
        render();
      } else if (!payload.profile || progress.updatedAt > remoteUpdatedAt) {
        scheduleCloudSync();
      }
    } catch (_error) {
      syncStatus = navigator.onLine ? "error" : "offline";
    }
  }

  function createLocalId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getWorkspaceXP() {
    const studied = systems.filter((system) => progress.systems[system.id]).length;
    const completedTasks = workState.tasks.filter((taskItem) => taskItem.done).length;
    const completedProjectSystems = workState.project.systems.filter((item) => item.done).length;
    const total = studied * 120 + completedTasks * 40 + completedProjectSystems * 80 + workState.snippets.length * 20;
    const levelSize = 500;
    return {
      total,
      level: Math.floor(total / levelSize) + 1,
      current: total % levelSize,
      required: levelSize,
      percentage: Math.round(((total % levelSize) / levelSize) * 100)
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getSystem(id) {
    return systems.find((system) => system.id === id);
  }

  function icon(name) {
    return `<i data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  function routeTo(route) {
    window.location.hash = route;
  }

  function currentRoute() {
    const raw = window.location.hash.replace(/^#\/?/, "");
    return raw || "overview";
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarScrim.hidden = true;
  }

  function renderSystemNav() {
    const categories = [...new Set(systems.map((system) => system.category))];
    const activeSystem = currentRoute().startsWith("system/") ? getSystem(currentRoute().split("/")[1]) : null;
    systemNav.innerHTML = categories.map((category, categoryIndex) => {
      const categorySystems = systems.filter((system) => system.category === category);
      const completed = categorySystems.filter((system) => progress.systems[system.id]).length;
      const shouldOpen = activeSystem ? activeSystem.category === category : categoryIndex === 0;
      return `
      <details class="system-nav-group" ${shouldOpen ? "open" : ""}>
        <summary class="system-group-label"><span>${category}</span><b>${completed}/${categorySystems.length}</b>${icon("chevron-down")}</summary>
        <div class="system-group-items">
        ${categorySystems.map((system) => `
          <button class="nav-item" type="button" data-route="system/${system.id}" title="${system.name}">
            ${icon(system.icon)}
            <span>${system.label}</span>
            <b class="nav-check ${progress.systems[system.id] ? "done" : ""}" aria-hidden="true"></b>
          </button>
        `).join("")}
        </div>
      </details>`;
    }).join("");
  }

  function updateActiveNav() {
    const route = currentRoute();
    document.querySelectorAll("[data-route]").forEach((element) => {
      const targetRoute = element.dataset.route;
      const isSectionRoot = (targetRoute === "methods" && route.startsWith("methods/"))
        || (targetRoute === "workspace" && route.startsWith("workspace/"))
        || (targetRoute === "areas" && route.startsWith("areas/"))
        || (targetRoute === "store" && route.startsWith("store/"));
      element.classList.toggle("active", targetRoute === route || isSectionRoot);
    });
  }

  function updateProgressUI() {
    const completed = systems.filter((system) => progress.systems[system.id]).length;
    const percentage = Math.round((completed / systems.length) * 100);
    document.getElementById("sidebar-progress-label").textContent = `${percentage}%`;
    document.getElementById("sidebar-progress-bar").style.width = `${percentage}%`;
    document.getElementById("resource-level").textContent = `LV ${getGameLevel()}`;
    document.getElementById("resource-energy").textContent = commerceAccount.plusActive ? "∞" : String(getTotalEnergy());
    applyVisualSettings();
    renderSystemNav();
    updateActiveNav();
    refreshIcons();
  }

  function renderOverview() {
    const completed = systems.filter((system) => progress.systems[system.id]).length;
    const methodCount = systems.reduce((total, system) => total + system.methods.length, 0);
    const highRisk = systems.filter((system) => system.risk === "Alto").length;

    content.innerHTML = `
      <header class="page-header">
        <div>
          <div class="eyebrow">${icon("graduation-cap")} Neon Studios System Academy</div>
          <h1>Engenharia de sistemas Roblox</h1>
          <p class="lead">Como raciocinar, implementar, integrar e testar ${systems.length} módulos em Luau, do fundamento à produção.</p>
        </div>
        <div class="header-actions">
          <button class="button primary" type="button" data-route="roadmap">${icon("route")} Ver ordem recomendada</button>
        </div>
      </header>

      ${renderContinuePanel()}

      <figure class="visual-banner">
        <img src="assets/economy-workshop.png" alt="Fábrica de algodão conectada a banco, leilão, mercado, crafting e descontos">
        <figcaption class="banner-caption">${icon("workflow")} Um circuito de jogo: recursos circulam, contratos preservam valor e ações constroem progressão.</figcaption>
      </figure>

      <section class="metric-grid" aria-label="Resumo do lote">
        <article class="metric-card"><span>Sistemas</span><strong>${systems.length}</strong><small>OOP, configuração e contratos claros</small></article>
        <article class="metric-card"><span>APIs públicas</span><strong>${methodCount}</strong><small>Métodos documentados neste guia</small></article>
        <article class="metric-card"><span>Alto risco</span><strong>${highRisk}</strong><small>Custódia, dívida, coleta e reversão</small></article>
        <article class="metric-card"><span>Estudados</span><strong>${completed}/${systems.length}</strong><small>Progresso salvo neste navegador</small></article>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Fundamentos</div><h2>Como pensar antes de programar</h2></div>
          <p>Essas quatro perguntas resolvem grande parte das decisões de arquitetura deste lote.</p>
        </div>
        <div class="principle-grid">
          ${principles.map(([iconName, title, description]) => `
            <article class="principle-card">
              <div class="principle-icon">${icon(iconName)}</div>
              <div><h3>${title}</h3><p>${description}</p></div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Roblox essencial</div><h2>Abas de estudo técnico</h2></div>
          <p>Conceitos que aparecem em quase todo sistema grande: transformações, personagens e armazenamento.</p>
        </div>
        <div class="concept-card-grid">
          ${Object.values(conceptGuides).map(renderConceptCard).join("")}
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Arquitetura</div><h2>Mapa de responsabilidades</h2></div>
          <p>Da fundação de valor até progressão, reconhecimento e contratos com o jogador.</p>
        </div>
        ${renderArchitecture()}
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Catálogo</div><h2>Os ${systems.length} sistemas</h2></div>
          <p>A fase indica a ordem de construção, não a importância do módulo.</p>
        </div>
        <div class="system-grid">
          ${systems.map(renderSystemCard).join("")}
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Método</div><h2>Loop de decisão</h2></div>
          <p>Repita o ciclo para cada nova operação econômica.</p>
        </div>
        <div class="reasoning-loop">
          ${[
            ["Nomeie o ativo", "Dinheiro, item, contrato, preço ou benefício."],
            ["Escolha o dono", "Um único serviço mantém o estado canônico."],
            ["Desenhe estados", "Liste entrada, sucesso, falha e cancelamento."],
            ["Escreva invariantes", "Defina o que jamais pode acontecer."],
            ["Prove com testes", "Teste abuso, limite, retry e rollback."]
          ].map(([title, description], index) => `
            <article class="reasoning-step"><span>${index + 1}</span><h3>${title}</h3><p>${description}</p></article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderConceptCard(guide) {
    return `
      <article class="concept-card">
        <div class="concept-card-icon">${icon(guide.icon)}</div>
        <div>
          <h3>${guide.title}</h3>
          <p>${guide.subtitle}</p>
          <button class="text-button" type="button" data-route="${guide.route}">Abrir aba ${icon("arrow-right")}</button>
        </div>
      </article>
    `;
  }

  function renderArchitecture() {
    return `
      <div class="architecture" role="region" aria-label="Fluxo de dependências" tabindex="0">
        <div class="architecture-flow">
          ${architecture.map((column, columnIndex) => `
            <div class="architecture-column">
              <div class="architecture-column-label">${column.label}</div>
              ${column.ids.map((id) => {
                const system = getSystem(id);
                return `
                  <button class="architecture-node" type="button" data-route="system/${id}">
                    ${icon(system.icon)}
                    <span><strong>${system.label}</strong><span>Fase ${system.phase}</span></span>
                    ${columnIndex < architecture.length - 1 ? '<b class="architecture-arrow" aria-hidden="true"></b>' : ""}
                  </button>
                `;
              }).join("")}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderSystemCard(system) {
    return `
      <article class="system-card">
        <div class="system-card-top">
          <div class="system-icon">${icon(system.icon)}</div>
          <div class="badge-row compact">
            ${system.existing ? '<span class="existing-badge">Integrado</span>' : ""}
            ${system.tier ? `<span class="tier-badge tier-${system.tier === "Básico" ? "basic" : system.tier === "Intermediário" ? "intermediate" : "advanced"}">${system.tier}</span>` : ""}
            <span class="risk-badge risk-${system.riskClass}">${system.risk} risco</span>
          </div>
        </div>
        <h3>${system.label}</h3>
        <p>${system.role}</p>
        <footer>
          <span>Fase ${system.phase}</span>
          <button class="text-button" type="button" data-route="system/${system.id}">Estudar ${icon("arrow-right")}</button>
        </footer>
      </article>
    `;
  }

  function renderRoadmap() {
    content.innerHTML = `
      <header class="page-header">
        <div>
          <div class="eyebrow">${icon("route")} Plano de implementação</div>
          <h1>Qual sistema fazer primeiro</h1>
          <p class="lead">A ordem reduz retrabalho: começa com regras puras, passa por adaptadores e deixa custódia concorrente para quando as dependências estiverem maduras.</p>
        </div>
      </header>

      <section class="thinking-callout">
        ${icon("lightbulb")}
        <div><strong>A regra que orienta a sequência</strong><p>Quanto mais um serviço movimenta ativos, mantém estado persistente ou coordena vários donos, mais tarde ele entra. Primeiro prove os blocos simples dos quais ele depende.</p></div>
      </section>

      <section class="content-section">
        <div class="roadmap-list">
          ${roadmap.map((phase, index) => `
            <article class="roadmap-phase">
              <div class="phase-index">${index + 1}</div>
              <div class="phase-body">
                <h2>${phase.title}</h2>
                <p>${phase.purpose}</p>
                <div class="phase-systems">
                  ${phase.systems.length ? phase.systems.map((id) => {
                    const system = getSystem(id);
                    return `<button class="dependency-pill" type="button" data-route="system/${id}">${system.label}</button>`;
                  }).join("") : '<span class="dependency-pill">Remotes</span><span class="dependency-pill">UI</span><span class="dependency-pill">Rate limit</span><span class="dependency-pill">Analytics</span>'}
                </div>
              </div>
              <aside class="phase-gate"><strong>Critério de saída</strong>${phase.gate}</aside>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Antes de produção</div><h2>Portões obrigatórios</h2></div>
        </div>
        <div class="test-grid">
          ${[
            ["save", "Persistência", "Banco, empréstimos, moedas secundárias e leilões precisam entrar no ciclo real de importação e exportação."],
            ["shield-check", "Autoridade", "Todo Remote valida tipos, limites, posse e frequência antes de chamar o domínio."],
            ["refresh-cw", "Idempotência", "Retry, clique duplo e reconexão não podem repetir crédito, item ou cobrança."],
            ["activity", "Observabilidade", "Falhas, volume, impostos e transações críticas precisam de logs e eventos auditáveis."]
          ].map(([iconName, title, description]) => `
            <article class="test-card"><h3>${icon(iconName)} ${title}</h3><p>${description}</p></article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderMethodsLibrary(focusedMethodId) {
    const categories = [...new Set(methodCatalog.map((method) => method.category))];
    content.innerHTML = `
      <header class="page-header">
        <div>
          <div class="eyebrow">${icon("braces")} Referência prática</div>
          <h1>Métodos Roblox e Luau</h1>
          <p class="lead">Uma biblioteca única para entender retorno, momento de uso, custo mental e diferenças entre APIs parecidas.</p>
        </div>
        <div class="header-actions"><button class="button primary" type="button" data-route="workspace/snippets">${icon("notebook-pen")} Guardar snippet</button></div>
      </header>

      <section class="metric-grid method-metrics">
        <article class="metric-card"><span>Métodos</span><strong>${methodCatalog.length}</strong><small>Com exemplo e decisão de uso</small></article>
        <article class="metric-card"><span>Categorias</span><strong>${categories.length}</strong><small>Sem páginas duplicadas</small></article>
        <article class="metric-card"><span>Instances</span><strong>${methodCatalog.filter((item) => item.category === "Instances").length}</strong><small>Hierarquia, cópia e atributos</small></article>
        <article class="metric-card"><span>Prática</span><strong>100%</strong><small>Todos possuem código Luau</small></article>
      </section>

      <div class="method-category-index">
        ${categories.map((category) => `<a href="#method-category-${category.toLocaleLowerCase("pt-BR").replaceAll(" ", "-")}">${category}<span>${methodCatalog.filter((item) => item.category === category).length}</span></a>`).join("")}
      </div>

      ${categories.map((category) => `
        <section class="content-section method-category" id="method-category-${category.toLocaleLowerCase("pt-BR").replaceAll(" ", "-")}">
          <div class="section-heading"><div><div class="eyebrow">API e mecanismo</div><h2>${category}</h2></div><p>Compare métodos próximos antes de escolher o que parece mais conveniente.</p></div>
          <div class="method-reference-list">
            ${methodCatalog.filter((method) => method.category === category).map((method) => `
              <article class="method-reference ${focusedMethodId === method.id ? "focused" : ""}" id="method-${method.id}">
                <header>
                  <div><span class="category-badge">${method.category}</span><h3>${method.name}</h3></div>
                  <code>${escapeHtml(method.signature)}</code>
                </header>
                <p class="method-definition">${method.definition}</p>
                <div class="method-decision-grid">
                  <div class="method-use"><strong>${icon("circle-check-big")} Quando usar</strong><p>${method.use}</p></div>
                  <div class="method-avoid"><strong>${icon("triangle-alert")} Quando evitar</strong><p>${method.avoid}</p></div>
                </div>
                <div class="method-code-row">
                  <div class="code-panel"><div class="code-toolbar"><span>Exemplo mínimo</span><button class="icon-button copy-code" type="button" data-copy-method="${method.id}" aria-label="Copiar exemplo" title="Copiar exemplo">${icon("copy")}</button></div><pre><code>${escapeHtml(method.example)}</code></pre></div>
                  <aside><span>Retorna</span><code>${escapeHtml(method.returns)}</code><span>Relacionados</span><div class="related-pills">${method.related.map((item) => `<b>${item}</b>`).join("")}</div></aside>
                </div>
              </article>
            `).join("")}
          </div>
        </section>
      `).join("")}
    `;

    if (focusedMethodId) {
      requestAnimationFrame(() => document.getElementById(`method-${focusedMethodId}`)?.scrollIntoView({ block: "center" }));
    }
  }

  function renderWorkspaceTab(tab) {
    const xp = getWorkspaceXP();
    const projectDone = workState.project.systems.filter((item) => item.done).length;
    const projectPercentage = Math.round((projectDone / Math.max(workState.project.systems.length, 1)) * 100);

    if (tab === "tasks") {
      return `<section class="work-panel"><div class="work-panel-heading"><div><div class="eyebrow">Execução</div><h2>Tarefas</h2></div><span>${workState.tasks.filter((item) => item.done).length}/${workState.tasks.length}</span></div>
        <form class="work-inline-form" data-work-form="task"><label class="sr-only" for="task-title">Nova tarefa</label><input id="task-title" name="title" required maxlength="120" placeholder="Ex.: validar rollback do crafting"><button class="button primary" type="submit">${icon("plus")} Adicionar</button></form>
        <div class="work-list">${workState.tasks.length ? workState.tasks.map((item) => `<div class="work-list-item ${item.done ? "done" : ""}"><label><input type="checkbox" data-work-task="${item.id}" ${item.done ? "checked" : ""}><span>${escapeHtml(item.title)}</span></label><button class="icon-button danger-button" type="button" data-delete-task="${item.id}" aria-label="Excluir tarefa" title="Excluir tarefa">${icon("trash-2")}</button></div>`).join("") : '<div class="work-empty">Nenhuma tarefa registrada.</div>'}</div></section>`;
    }

    if (tab === "planning") {
      return `<section class="work-panel"><div class="work-panel-heading"><div><div class="eyebrow">Arquitetura</div><h2>Planejador de sistemas</h2></div><span>${workState.plans.length} planos</span></div>
        <form class="work-form-grid" data-work-form="plan">
          <label>Nome<input name="name" required maxlength="80" placeholder="QuestService"></label>
          <label>Objetivo<input name="objective" required maxlength="180" placeholder="Gerenciar quests e recompensas"></label>
          <label class="full">Responsabilidades<textarea name="responsibilities" required rows="4" placeholder="Uma responsabilidade por linha"></textarea></label>
          <label class="full">Dependências<input name="dependencies" placeholder="PlayerDataService, RewardService"></label>
          <div class="full form-actions"><button class="button primary" type="submit">${icon("save")} Salvar planejamento</button></div>
        </form>
        <div class="work-card-grid">${workState.plans.map((plan) => `<article class="work-record"><header><div><span class="category-badge">Sistema</span><h3>${escapeHtml(plan.name)}</h3></div><button class="icon-button danger-button" type="button" data-delete-plan="${plan.id}" aria-label="Excluir planejamento" title="Excluir planejamento">${icon("trash-2")}</button></header><p>${escapeHtml(plan.objective)}</p><strong>Responsabilidades</strong><ul>${plan.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><strong>Dependências</strong><div class="related-pills">${plan.dependencies.map((item) => `<b>${escapeHtml(item)}</b>`).join("") || "<span>Nenhuma</span>"}</div></article>`).join("") || '<div class="work-empty">Use o formulário para estruturar o primeiro sistema.</div>'}</div>
      </section>`;
    }

    if (tab === "systems") {
      const tiers = ["Básico", "Intermediário", "Avançado"];
      return `<section class="work-panel"><div class="work-panel-heading"><div><div class="eyebrow">Biblioteca</div><h2>Sistemas</h2></div><button class="button" type="button" data-route="roadmap">${icon("route")} Abrir roadmap</button></div>
        <div class="work-system-summary">${tiers.map((tier) => { const tierSystems = systems.filter((system) => system.tier === tier); const done = tierSystems.filter((system) => progress.systems[system.id]).length; return `<article><span>${tier}</span><strong>${done}/${tierSystems.length}</strong><div class="xp-track"><i style="width:${Math.round((done / Math.max(tierSystems.length, 1)) * 100)}%"></i></div></article>`; }).join("")}</div>
        <div class="work-system-links">${systems.slice(0, 18).map((system) => `<button class="dependency-pill" type="button" data-route="system/${system.id}">${progress.systems[system.id] ? icon("circle-check-big") : icon("circle")} ${system.label}</button>`).join("")}</div>
      </section>`;
    }

    if (tab === "snippets") {
      return `<section class="work-panel"><div class="work-panel-heading"><div><div class="eyebrow">Código reutilizável</div><h2>Snippets</h2></div><span>${workState.snippets.length} salvos</span></div>
        <form class="work-form-grid" data-work-form="snippet"><label>Título<input name="title" required maxlength="100" placeholder="Encontrar Player pelo Character"></label><label>Tags<input name="tags" placeholder="Players, Character, Server"></label><label class="full">Código<textarea name="code" required rows="6" spellcheck="false" placeholder="local player = Players:GetPlayerFromCharacter(character)"></textarea></label><div class="full form-actions"><button class="button primary" type="submit">${icon("save")} Guardar snippet</button></div></form>
        <div class="snippet-grid">${workState.snippets.map((snippet) => `<article class="snippet-record"><header><div><h3>${escapeHtml(snippet.title)}</h3><div class="related-pills">${snippet.tags.map((tag) => `<b>${escapeHtml(tag)}</b>`).join("")}</div></div><div><button class="icon-button copy-work-snippet" type="button" data-copy-work-snippet="${snippet.id}" aria-label="Copiar snippet" title="Copiar snippet">${icon("copy")}</button><button class="icon-button danger-button" type="button" data-delete-snippet="${snippet.id}" aria-label="Excluir snippet" title="Excluir snippet">${icon("trash-2")}</button></div></header><div class="code-panel"><pre><code>${escapeHtml(snippet.code)}</code></pre></div></article>`).join("") || '<div class="work-empty">Nenhum snippet salvo.</div>'}</div>
      </section>`;
    }

    if (tab === "notes") {
      return `<section class="work-panel notes-panel"><div class="work-panel-heading"><div><div class="eyebrow">Rascunho local</div><h2>Anotações</h2></div><span>Salvo automaticamente</span></div><label class="sr-only" for="workspace-notes">Anotações</label><textarea id="workspace-notes" data-work-notes rows="20" placeholder="Registre decisões, dúvidas e observações da sessão...">${escapeHtml(workState.notes)}</textarea></section>`;
    }

    if (tab === "bugs") {
      return `<section class="work-panel"><div class="work-panel-heading"><div><div class="eyebrow">Diagnóstico</div><h2>Bugs</h2></div><span>${workState.bugs.length} registros</span></div>
        <form class="work-form-grid" data-work-form="bug"><label>Problema<input name="problem" required maxlength="160"></label><label>Causa<input name="cause" maxlength="180" placeholder="Ainda desconhecida"></label><label class="full">Tentativa<textarea name="attempt" rows="3"></textarea></label><label class="full">Solução<textarea name="solution" rows="3"></textarea></label><div class="full form-actions"><button class="button primary" type="submit">${icon("bug")} Registrar bug</button></div></form>
        <div class="work-card-grid">${workState.bugs.map((bug) => `<article class="work-record bug-record"><header><h3>${escapeHtml(bug.problem)}</h3><button class="icon-button danger-button" type="button" data-delete-bug="${bug.id}" aria-label="Excluir bug" title="Excluir bug">${icon("trash-2")}</button></header><dl><dt>Causa</dt><dd>${escapeHtml(bug.cause || "Ainda não identificada")}</dd><dt>Tentativa</dt><dd>${escapeHtml(bug.attempt || "Nenhuma registrada")}</dd><dt>Solução</dt><dd>${escapeHtml(bug.solution || "Em investigação")}</dd></dl></article>`).join("") || '<div class="work-empty">Nenhum bug registrado.</div>'}</div>
      </section>`;
    }

    if (tab === "ideas") {
      return `<section class="work-panel"><div class="work-panel-heading"><div><div class="eyebrow">Backlog criativo</div><h2>Ideias</h2></div><span>${workState.ideas.length} ideias</span></div><form class="work-inline-form idea-form" data-work-form="idea"><select name="category" aria-label="Categoria"><option>Sistema</option><option>Jogo</option><option>Mecânica</option><option>Vídeo</option><option>Conteúdo</option><option>Melhoria</option></select><input name="text" required maxlength="220" placeholder="Descreva a ideia"><button class="button primary" type="submit">${icon("lightbulb")} Adicionar</button></form><div class="idea-list">${workState.ideas.map((idea) => `<article><span class="category-badge">${escapeHtml(idea.category)}</span><p>${escapeHtml(idea.text)}</p><button class="icon-button danger-button" type="button" data-delete-idea="${idea.id}" aria-label="Excluir ideia" title="Excluir ideia">${icon("trash-2")}</button></article>`).join("") || '<div class="work-empty">Nenhuma ideia guardada.</div>'}</div></section>`;
    }

    return `<div class="workspace-dashboard">
      <section class="work-panel project-panel"><div class="work-panel-heading"><div><div class="eyebrow">Projeto Atual</div><h2>${escapeHtml(workState.project.name)}</h2></div><span>${projectPercentage}%</span></div><label>Nome do projeto<input data-work-project-name maxlength="100" value="${escapeHtml(workState.project.name)}"></label><div class="xp-track project-track"><i style="width:${projectPercentage}%"></i></div><div class="project-systems">${workState.project.systems.map((item) => `<label class="project-system ${item.done ? "done" : ""}"><input type="checkbox" data-work-project-system="${item.id}" ${item.done ? "checked" : ""}>${item.done ? icon("circle-check-big") : icon("circle")}<span>${escapeHtml(item.name)}</span></label>`).join("")}</div></section>
      <section class="work-panel xp-panel"><div class="work-panel-heading"><div><div class="eyebrow">Progresso de estudo</div><h2>LV. ${xp.level}</h2></div><span>${xp.total.toLocaleString("pt-BR")} XP total</span></div><div class="xp-value"><strong>${xp.current.toLocaleString("pt-BR")}</strong><span>/ ${xp.required.toLocaleString("pt-BR")} XP</span></div><div class="xp-track large"><i style="width:${xp.percentage}%"></i></div><p>Estudar sistemas, concluir tarefas e guardar conhecimento útil aumenta este progresso local.</p></section>
      <section class="work-panel workspace-shortcuts"><div class="work-panel-heading"><div><div class="eyebrow">Atalhos</div><h2>Continuar trabalhando</h2></div></div><div>${[["tasks","list-checks","Tarefas"],["planning","workflow","Planejamento"],["snippets","code-2","Snippets"],["bugs","bug","Bugs"],["ideas","lightbulb","Ideias"],["notes","notebook-pen","Anotações"]].map(([route, iconName, label]) => `<button type="button" data-route="workspace/${route}">${icon(iconName)}<span>${label}</span>${icon("arrow-right")}</button>`).join("")}</div></section>
    </div>`;
  }

  function renderWorkspace(tab) {
    const tabs = [
      ["project", "Projeto Atual"], ["tasks", "Tarefas"], ["planning", "Planejamento"], ["systems", "Sistemas"],
      ["snippets", "Snippets"], ["notes", "Anotações"], ["bugs", "Bugs"], ["ideas", "Ideias"]
    ];
    const activeTab = tabs.some(([id]) => id === tab) ? tab : "project";
    content.innerHTML = `
      <header class="page-header work-header"><div><div class="eyebrow">${icon("panels-top-left")} Produtividade local</div><h1>Local de Trabalho</h1><p class="lead">Planeje, registre e acompanhe o desenvolvimento dentro da Neon Studios System Academy.</p></div></header>
      <nav class="workspace-tabs" aria-label="Áreas do Local de Trabalho">${tabs.map(([id, label]) => `<button type="button" class="${activeTab === id ? "active" : ""}" data-route="workspace/${id}">${label}</button>`).join("")}</nav>
      ${renderWorkspaceTab(activeTab)}
    `;
  }

  function renderAiProgrammingSections(guide) {
    if (!guide.aiLayers) return "";

    return `
      <section class="content-section ai-architecture-section">
        <div class="section-heading">
          <div><div class="eyebrow">Arquitetura da mente</div><h2>Do estímulo até a ação</h2></div>
          <p>Cada camada possui uma responsabilidade e pode falhar sem corromper as demais.</p>
        </div>
        <div class="ai-layer-grid">
          ${guide.aiLayers.map(([index, title, description]) => `
            <article class="ai-layer-card">
              <span>${index}</span>
              <h3>${title}</h3>
              <p>${description}</p>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Decisão de arquitetura</div><h2>Qual modelo de IA escolher</h2></div>
          <p>Comece pelo menor modelo que deixa o comportamento legível e testável.</p>
        </div>
        <div class="table-wrap ai-pattern-table">
          <table>
            <thead><tr><th>Nível</th><th>Padrão</th><th>Quando faz sentido</th><th>Limite principal</th></tr></thead>
            <tbody>${guide.aiPatterns.map(([tier, pattern, use, tradeoff]) => `<tr><td><span class="tier-badge">${tier}</span></td><td><strong>${pattern}</strong></td><td>${use}</td><td>${tradeoff}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </section>

      <section class="content-section">
        <div class="section-heading">
          <div><div class="eyebrow">Aplicação</div><h2>Blueprints de NPCs e inimigos</h2></div>
          <p>O tipo visual não define a IA; sensores, intenção e ações definem o contrato.</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Agente</th><th>Percepção</th><th>Decisão</th><th>Execução</th></tr></thead>
            <tbody>${guide.enemyBlueprints.map(([agent, senses, decision, action]) => `<tr><td><strong>${agent}</strong></td><td>${senses}</td><td>${decision}</td><td>${action}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </section>

      <section class="content-section class-concepts-section">
        <div class="section-heading">
          <div><div class="eyebrow">Orientação a objetos</div><h2>Classe concreta, abstrata e estática</h2></div>
          <p>Em Luau, esses nomes descrevem padrões de projeto; não existem palavras-chave <code>class</code>, <code>abstract</code> ou <code>static</code>.</p>
        </div>
        <div class="thinking-callout compact-callout">
          ${icon("blocks")}
          <div><strong>A distinção que evita confusão</strong><p><code>:</code> recebe uma instância como <code>self</code>. <code>.</code> chama uma função do módulo sem inserir <code>self</code>. Isso explica métodos de instância e funções estáticas em Luau.</p></div>
        </div>
        <div class="class-concept-list">
          ${guide.classConcepts.map((concept, index) => `
            <article class="class-concept">
              <div class="class-concept-copy">
                <span class="class-kind">${concept.kind}</span>
                <h3>${concept.name}</h3>
                <p class="class-definition">${concept.definition}</p>
                <dl>
                  <dt>Modelo mental</dt><dd>${concept.mentalModel}</dd>
                  <dt>Quando usar</dt><dd>${concept.use}</dd>
                  <dt>Quando evitar</dt><dd>${concept.avoid}</dd>
                </dl>
              </div>
              <div class="code-panel">
                <div class="code-toolbar"><span>${concept.name} em Luau</span><button class="icon-button copy-code" type="button" aria-label="Copiar exemplo" title="Copiar exemplo" data-copy-snippet="${guide.route}:class:${index}">${icon("copy")}</button></div>
                <pre><code>${escapeHtml(concept.code)}</code></pre>
              </div>
            </article>
          `).join("")}
        </div>
        <div class="next-step-panel class-rule-panel">
          <div><span>Regra prática</span><strong>Prefira composição para montar comportamentos</strong><p>Um Enemy pode receber Perception, Navigator e Combat como objetos separados. Herança deve representar uma relação real, não apenas reaproveitar linhas.</p></div>
          <button class="button" type="button" data-route="methods">${icon("braces")} Rever métodos Luau</button>
        </div>
      </section>
    `;
  }

  function renderConceptGuide(guide) {
    const lab = practicalLabs[guide.route];
    content.innerHTML = `
      <header class="detail-heading concept-heading">
        <div class="detail-icon">${icon(guide.icon)}</div>
        <div class="detail-title">
          <div class="eyebrow">${guide.eyebrow}</div>
          <h1>${guide.title}</h1>
          <p class="lead">${guide.subtitle}</p>
        </div>
      </header>

      <section class="thinking-callout">
        ${icon("brain")}
        <div><strong>${guide.calloutTitle}</strong><p>${guide.callout}</p></div>
      </section>

      <section class="metric-grid concept-metrics" aria-label="Resumo de ${guide.title}">
        ${guide.metrics.map(([label, value]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>Base para sistemas Roblox</small></article>`).join("")}
      </section>

      <div class="two-column">
        <div>
          <section class="content-section">
            <div class="section-heading"><div><div class="eyebrow">Modelo mental</div><h2>Como pensar</h2></div></div>
            <div class="lesson-grid">
              ${guide.mentalModel.map(([title, description]) => `
                <article class="lesson-card">
                  <h3>${icon("sparkles")} ${title}</h3>
                  <p>${description}</p>
                </article>
              `).join("")}
            </div>
          </section>

          <section class="content-section">
            <div class="section-heading"><div><div class="eyebrow">Estudo</div><h2>Ordem etapa por etapa</h2></div></div>
            <ol class="flow-list">
              ${guide.learningSteps.map(([title, description]) => `<li><strong>${title}</strong><span>${description}</span></li>`).join("")}
            </ol>
          </section>
        </div>

        <aside class="stack">
          <section class="fact-panel">
            <h3>${icon("wrench")} Onde isso vira sistema</h3>
            <ul class="plain-list">${guide.systems.map(([title, description]) => `<li><strong>${title}</strong><span>${description}</span></li>`).join("")}</ul>
          </section>
          <section class="fact-panel">
            <h3>${icon("triangle-alert")} Regra de ouro</h3>
            <p>Cliente pode pedir e mostrar. Servidor decide quando isso altera dinheiro, inventario, vida, posicao autoritativa ou progresso persistente.</p>
          </section>
        </aside>
      </div>

      <section class="content-section">
        <div class="section-heading"><div><div class="eyebrow">Referencia</div><h2>APIs e usos principais</h2></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>API / conceito</th><th>Responsabilidade</th><th>Quando usar</th></tr></thead>
            <tbody>
              ${guide.apiRows.map(([name, purpose, use]) => `<tr><td><code>${escapeHtml(name)}</code></td><td>${purpose}</td><td>${use}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>

      ${renderAiProgrammingSections(guide)}

      <section class="content-section">
        <div class="section-heading"><div><div class="eyebrow">Pratica</div><h2>Exemplos em Luau</h2></div></div>
        <div class="example-grid">
          ${guide.examples.map((example, index) => `
            <article class="code-panel">
              <div class="code-toolbar"><span>${example.title}</span><button class="icon-button copy-code" type="button" aria-label="Copiar exemplo" title="Copiar exemplo" data-copy-snippet="${guide.route}:example:${index}">${icon("copy")}</button></div>
              <pre><code>${escapeHtml(example.code)}</code></pre>
            </article>
          `).join("")}
        </div>
      </section>

      ${lab ? `
        <section class="content-section practice-lab">
          <div class="section-heading">
            <div><div class="eyebrow">Projeto completo</div><h2>${lab.title}</h2></div>
            <p>Um exercício para sair do conceito isolado e chegar a um sistema integrado.</p>
          </div>

          <div class="lab-goal">
            <div class="principle-icon">${icon("target")}</div>
            <div><strong>Objetivo do laboratório</strong><p>${lab.goal}</p></div>
          </div>

          <div class="service-pipeline" aria-label="Arquitetura do laboratório">
            ${lab.architecture.map((item, index) => `<div class="pipeline-node"><span>${String(index + 1).padStart(2, "0")}</span><strong>${item}</strong></div>`).join("")}
          </div>

          <div class="lab-layout">
            <div>
              <h3>Como construir</h3>
              <ol class="flow-list">
                ${lab.steps.map(([title, description]) => `<li><strong>${title}</strong><span>${description}</span></li>`).join("")}
              </ol>
            </div>
            <aside class="fact-panel lab-checkpoint">
              <h3>${icon("circle-check-big")} Critério de pronto</h3>
              <p>O caminho feliz funciona, entradas inválidas não alteram estado e repetir a mesma intenção não duplica recompensa, cobrança ou objeto.</p>
            </aside>
          </div>

          <div class="example-grid lab-code-grid">
            <article class="code-panel">
              <div class="code-toolbar"><span>Implementação principal</span><button class="icon-button copy-code" type="button" aria-label="Copiar implementação" title="Copiar implementação" data-copy-snippet="${guide.route}:lab:code">${icon("copy")}</button></div>
              <pre><code>${escapeHtml(lab.code)}</code></pre>
            </article>
            <article class="code-panel">
              <div class="code-toolbar"><span>Teste de confiança</span><button class="icon-button copy-code" type="button" aria-label="Copiar teste" title="Copiar teste" data-copy-snippet="${guide.route}:lab:test">${icon("copy")}</button></div>
              <pre><code>${escapeHtml(lab.test)}</code></pre>
            </article>
          </div>
        </section>
      ` : ""}

      <section class="content-section">
        <div class="section-heading"><div><div class="eyebrow">Revisao</div><h2>Erros comuns</h2></div></div>
        <div class="risk-grid">
          ${guide.mistakes.map(([title, description]) => `<article class="risk-card"><h3>${icon("triangle-alert")} ${title}</h3><p>${description}</p></article>`).join("")}
        </div>
      </section>

      <section class="content-section related-learning">
        <div class="section-heading"><div><div class="eyebrow">Continue conectando</div><h2>Conceitos relacionados</h2></div><p>Use as conexões para transformar conceitos isolados em arquitetura.</p></div>
        <div class="related-learning-grid">
          ${Object.values(conceptGuides).filter((item) => item.route !== guide.route).slice(0, 3).map((item) => `<button type="button" data-route="${item.route}">${icon(item.icon)}<span><strong>${item.title}</strong><small>${item.subtitle}</small></span>${icon("arrow-right")}</button>`).join("")}
          <button type="button" data-route="methods">${icon("braces")}<span><strong>Métodos Roblox/Luau</strong><small>Compare APIs usadas nesta aula.</small></span>${icon("arrow-right")}</button>
        </div>
      </section>

      <footer class="detail-footer">
        <button class="button" type="button" data-route="overview">${icon("arrow-left")} <span>Visao geral</span></button>
        <button class="button primary" type="button" data-route="roadmap"><span>Ordem dos sistemas</span> ${icon("route")}</button>
      </footer>
    `;
  }

  function renderCourseLesson(system) {
    const course = system.course;
    const lessonSteps = [
      "O que é", "Por que existe", "Modelo mental", "Por baixo dos panos",
      "Estado e memória", "Sintaxe", "Fluxo", "Rede", "Aplicação", "Decisão", "Teste"
    ];

    return `
      <section class="content-section course-deep-dive" id="deep-lesson">
        <div class="section-heading">
          <div><div class="eyebrow">Aula completa</div><h2>Do conceito à autonomia</h2></div>
          <p>Esta trilha explica o mecanismo, não apenas o código que deve ser digitado.</p>
        </div>

        <nav class="lesson-path" aria-label="Etapas desta aula">
          ${lessonSteps.map((label, index) => `<span><b>${String(index + 1).padStart(2, "0")}</b>${label}</span>`).join("")}
        </nav>

        <div class="course-grid">
          <article class="course-block">
            <div class="course-block-icon">${icon("book-open")}</div>
            <div><div class="eyebrow">1. O que é</div><h3>${system.name}</h3><p>${course.what} Ele é um ModuleScript no servidor que retorna uma única instância configurada pela <code>IntegrationServiceFactory</code>.</p></div>
          </article>
          <article class="course-block">
            <div class="course-block-icon warm">${icon("circle-help")}</div>
            <div><div class="eyebrow">2. Por que existe</div><h3>O problema anterior</h3><p>${course.why}</p></div>
          </article>
        </div>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">3. Modelo mental</div><h2>Quem chama quem</h2></div><p>As setas mostram posse de referência e direção da intenção.</p></div>
          <div class="mental-diagram"><pre>${escapeHtml(course.diagram)}</pre></div>
          <p class="diagram-explanation"><strong>Leia de cima para baixo:</strong> o cliente não possui a referência do serviço de servidor. Ele envia somente uma intenção por RemoteEvent. O gateway encontra o Player real, valida os dados e então usa a referência obtida por <code>require()</code> para chamar o serviço.</p>
        </section>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">4. Por baixo dos panos</div><h2>Como a chamada funciona internamente</h2></div></div>
          <ol class="flow-list course-flow">
            ${course.internals.map((step) => `<li><strong>${step}</strong></li>`).join("")}
          </ol>
        </section>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">5. Estado antes e depois</div><h2>Qual linha muda os dados</h2></div></div>
          <div class="before-after-grid">
            <article class="state-snapshot before"><span>Antes</span><pre><code>${escapeHtml(course.before)}</code></pre></article>
            <div class="state-arrow">${icon("arrow-right")}</div>
            <article class="state-snapshot after"><span>Depois</span><pre><code>${escapeHtml(course.after)}</code></pre></article>
          </div>
          <div class="thinking-callout compact-callout">${icon("network")}<div><strong>Memória e referências</strong><p>${course.memory}</p></div></div>
        </section>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">6. Sintaxe desmontada</div><h2>O que cada parte significa</h2></div></div>
          <div class="syntax-line"><code>Service:${system.course.summary[1].replace("Operação inicial: ", "").replace(".", "")}(player, payload, context)</code></div>
          <div class="table-wrap">
            <table><thead><tr><th>Parte</th><th>O que acontece</th></tr></thead><tbody>
              ${course.syntax.map(([part, explanation]) => `<tr><td><code>${escapeHtml(part)}</code></td><td>${explanation}</td></tr>`).join("")}
            </tbody></table>
          </div>
        </section>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">7-9. Execução e rede</div><h2>Cliente, servidor e compartilhado</h2></div></div>
          <div class="runtime-lanes">
            <article><span class="lane client">Cliente</span><h3>Inicia e apresenta</h3><p>Controller coleta a intenção e atualiza UI. Ele não escolhe Player, saldo, distância final nem sucesso.</p></article>
            <article><span class="lane shared">Compartilhado</span><h3>Transporta contrato</h3><p>RemoteEvent leva apenas dados serializáveis permitidos. Configs públicos podem compartilhar IDs, nunca segredos.</p></article>
            <article><span class="lane server">Servidor</span><h3>Valida e decide</h3><p>${course.boundary}</p></article>
          </div>
        </section>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">10. Exemplo mínimo</div><h2>O menor módulo que preserva a ideia</h2></div><p>Primeiro entenda retorno e require; depois adicione factory, rede e persistência.</p></div>
          <div class="example-grid">
            <article class="code-panel"><div class="code-toolbar"><span>ModuleScript mínimo</span></div><pre><code>${escapeHtml(course.minimum)}</code></pre></article>
            <article class="fact-panel"><h3>${icon("layers-3")} Quem fornece cada mecanismo</h3><ul class="plain-list">${course.robloxVsDeveloper.map(([owner, explanation]) => `<li><strong>${owner}</strong><span>${explanation}</span></li>`).join("")}</ul></article>
          </div>
        </section>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">14-18. Decisões</div><h2>Erros, comparação e limites</h2></div></div>
          <div class="decision-grid">
            <article class="decision-panel use"><h3>${icon("circle-check-big")} Quando usar</h3><ul>${course.whenUse.map((item) => `<li>${item}</li>`).join("")}</ul></article>
            <article class="decision-panel avoid"><h3>${icon("circle-x")} Quando não usar</h3><ul>${course.whenNot.map((item) => `<li>${item}</li>`).join("")}</ul></article>
          </div>
          <div class="table-wrap comparison-table"><table><thead><tr><th>Abordagem</th><th>Diferença concreta</th></tr></thead><tbody>${course.comparison.map(([name, explanation]) => `<tr><td><code>${escapeHtml(name)}</code></td><td>${explanation}</td></tr>`).join("")}</tbody></table></div>
          <div class="thinking-callout compact-callout warning-callout">${icon("unplug")}<div><strong>O que acontece se removermos o serviço?</strong><p>${course.removeConsequence}</p></div></div>
        </section>

        <section class="course-subsection">
          <div class="section-heading"><div><div class="eyebrow">19-20. Escala</div><h2>Do exemplo ao jogo completo</h2></div></div>
          <div class="scaling-chain">${course.scaling.split(" → ").map((item) => `<span>${item}</span>`).join(icon("arrow-right"))}</div>
          <p class="game-application"><strong>No Cotton Fabric Tycoon:</strong> ${course.gameUse}</p>
        </section>

        <section class="course-subsection exercise-panel">
          <div><div class="eyebrow">21. Teste você mesmo</div><h2>Exercício de entendimento</h2><p>${course.exercise}</p></div>
          <div><div class="eyebrow">22. Perguntas de verificação</div><ol>${course.questions.map((question) => `<li>${question}</li>`).join("")}</ol></div>
        </section>

        <section class="course-subsection technical-summary">
          <div class="eyebrow">23. Resumo técnico</div><h2>O que precisa ficar na memória</h2>
          <ul>${course.summary.map((item) => `<li>${item}</li>`).join("")}</ul>
        </section>
      </section>
    `;
  }

  function renderRelatedLearning(system) {
    const currentIndex = systems.indexOf(system);
    const dependencyNames = new Set([...system.dependencies, ...system.dependents].map((item) => item.toLocaleLowerCase("pt-BR")));
    const directMatches = systems.filter((candidate) => candidate !== system && (
      dependencyNames.has(candidate.name.toLocaleLowerCase("pt-BR"))
      || dependencyNames.has(candidate.name.replace(/Service$/, "").toLocaleLowerCase("pt-BR"))
    ));
    const sameCategory = systems.filter((candidate) => candidate !== system && candidate.category === system.category);
    const related = [...new Set([...directMatches, ...sameCategory])].slice(0, 4);
    const nextSystem = systems[currentIndex + 1];

    return `
      <section class="content-section related-learning" id="related-learning">
        <div class="section-heading"><div><div class="eyebrow">Mapa de aprendizado</div><h2>Conceitos relacionados</h2></div><p>Dependências mostram quais referências este sistema precisa possuir para cumprir o contrato.</p></div>
        <div class="related-learning-grid">
          ${related.map((candidate) => `<button type="button" data-route="system/${candidate.id}">${icon(candidate.icon)}<span><strong>${candidate.label}</strong><small>${candidate.role}</small></span>${icon("arrow-right")}</button>`).join("")}
          <button type="button" data-route="methods">${icon("braces")}<span><strong>Métodos relacionados</strong><small>Instances, eventos, tabelas e APIs Roblox.</small></span>${icon("arrow-right")}</button>
        </div>
        ${nextSystem ? `<div class="next-step-panel"><div><span>Próximo passo recomendado</span><strong>${nextSystem.name}</strong><p>${nextSystem.role}</p></div><button class="button primary" type="button" data-route="system/${nextSystem.id}">Continuar ${icon("arrow-right")}</button></div>` : ""}
      </section>
    `;
  }

  function renderLearningLevels(system) {
    if (!system.learningLevels) return "";
    const levelIcons = ["blocks", "network", "rocket"];
    return `
      <section class="content-section learning-levels" id="learning-levels">
        <div class="section-heading">
          <div><div class="eyebrow">Progressão guiada</div><h2>Básico, intermediário e avançado</h2></div>
          <p>Construa uma camada por vez. A prova de cada nível evita avançar com uma base apenas aparente.</p>
        </div>
        <div class="implementation-map learning-level-grid">
          ${system.learningLevels.map((level, index) => `
            <article class="implementation-step learning-level-card level-${index + 1}">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <h3>${icon(levelIcons[index])} ${level.name}</h3>
              <p>${level.goal}</p>
              <small><strong>Prova de conclusão</strong>${level.proof}</small>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderSystemDetail(system) {
    const previous = systems[systems.indexOf(system) - 1];
    const next = systems[systems.indexOf(system) + 1];
    const completed = Boolean(progress.systems[system.id]);

    content.innerHTML = `
      <header class="detail-heading">
        <div class="detail-icon">${icon(system.icon)}</div>
        <div class="detail-title">
          <div class="eyebrow">${system.existing ? "Sistema existente integrado" : `Sistema ${String(systems.indexOf(system) + 1).padStart(2, "0")}`}</div>
          <h1>${system.name}</h1>
          <p class="lead">${system.role}</p>
          <div class="badge-row">
            <span class="category-badge">${system.category}</span>
            ${system.tier ? `<span class="tier-badge tier-${system.tier === "Básico" ? "basic" : system.tier === "Intermediário" ? "intermediate" : "advanced"}">${system.tier}</span>` : ""}
            <span class="phase-badge">Fase ${system.phase}</span>
            <span class="risk-badge risk-${system.riskClass}">${system.risk} risco</span>
          </div>
        </div>
        <div class="detail-actions"><button class="icon-button favorite-button ${progress.favorites[system.id] ? "active" : ""}" type="button" data-favorite="${system.id}" aria-label="${progress.favorites[system.id] ? "Remover dos favoritos" : "Adicionar aos favoritos"}" title="${progress.favorites[system.id] ? "Remover dos favoritos" : "Adicionar aos favoritos"}">${icon("star")}</button><label class="completion-control"><input type="checkbox" data-system-complete="${system.id}" ${completed ? "checked" : ""}><span>Estudado</span></label></div>
      </header>

      <section class="thinking-callout">
        ${icon("brain")}
        <div><strong>Pergunta de projeto</strong><p>${system.question}</p></div>
      </section>

      <div class="two-column">
        <div>
          <section class="content-section" id="mental-model">
            <div class="section-heading"><div><div class="eyebrow">Modelo mental</div><h2>Como pensar no sistema</h2></div></div>
            <ul class="flow-list">
              ${system.mentalModel.map((item) => `<li><strong>${item}</strong></li>`).join("")}
            </ul>
          </section>

          <section class="content-section" id="flow">
            <div class="section-heading"><div><div class="eyebrow">Runtime</div><h2>Fluxo etapa por etapa</h2></div></div>
            <ol class="flow-list">
              ${system.flow.map(([title, description]) => `<li><strong>${title}</strong><span>${description}</span></li>`).join("")}
            </ol>
          </section>
        </div>

        <aside class="stack">
          <section class="fact-panel">
            <h3>${icon("database")} Fonte de verdade</h3>
            <p>${system.truth}</p>
          </section>
          <section class="fact-panel">
            <h3>${icon("boxes")} Depende de</h3>
            <div class="config-keys">${system.dependencies.map((item) => `<span class="dependency-pill">${item}</span>`).join("")}</div>
          </section>
          <section class="fact-panel">
            <h3>${icon("git-branch")} Alimenta</h3>
            <ul class="plain-list">${system.dependents.map((item) => `<li>${item}</li>`).join("")}</ul>
          </section>
          <section class="fact-panel">
            <h3>${icon("settings-2")} Configuração</h3>
            <div class="config-keys">${system.configKeys.map((item) => `<span class="config-key">${item}</span>`).join("")}</div>
          </section>
        </aside>
      </div>

      ${renderLearningLevels(system)}

      <section class="content-section" id="implementation">
        <div class="section-heading">
          <div><div class="eyebrow">Construção</div><h2>Implementação por etapas</h2></div>
          <p>Marque conforme validar cada camada. O estado fica salvo neste navegador.</p>
        </div>
        <div class="check-list">
          ${system.stages.map((stage, index) => {
            const key = `${system.id}:${index}`;
            return `<label class="check-item"><input type="checkbox" data-step="${key}" ${progress.steps[key] ? "checked" : ""}><span>${stage}</span></label>`;
          }).join("")}
        </div>
      </section>

      <section class="content-section" id="from-idea-to-code">
        <div class="section-heading">
          <div><div class="eyebrow">Raciocínio aplicado</div><h2>Da ideia ao código</h2></div>
          <p>Use esta sequência antes de escrever a primeira função pública.</p>
        </div>
        <div class="implementation-map">
          <article class="implementation-step"><span>01</span><h3>Modele a entrada</h3><p>Comece por <code>${escapeHtml(system.methods[0][0])}</code>. Defina tipos, limites, permissões e erros esperados antes de alterar estado.</p></article>
          <article class="implementation-step"><span>02</span><h3>Calcule sem mutar</h3><p>${system.flow[0][1]} Sempre que possível, produza um resultado de preview que possa ser testado isoladamente.</p></article>
          <article class="implementation-step"><span>03</span><h3>Proteja a transação</h3><p>${system.truth} Escreva o rollback junto do primeiro débito, remoção ou concessão.</p></article>
          <article class="implementation-step"><span>04</span><h3>Prove o contrato</h3><p>Teste sucesso, entrada inválida, repetição e falha parcial. A primeira prova prática é: ${system.tests[0]}</p></article>
        </div>
      </section>

      ${system.course ? renderCourseLesson(system) : ""}

      <section class="content-section" id="api">
        <div class="section-heading"><div><div class="eyebrow">Contrato</div><h2>API principal</h2></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Método</th><th>Responsabilidade</th><th>Retorno</th></tr></thead>
            <tbody>
              ${system.methods.map(([name, purpose, returns]) => `<tr><td><code>${escapeHtml(name)}</code></td><td>${purpose}</td><td>${returns}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="content-section" id="invariants">
        <div class="section-heading"><div><div class="eyebrow">Segurança lógica</div><h2>Invariantes</h2></div><p>Condições que devem permanecer verdadeiras em sucesso, erro e retry.</p></div>
        <div class="principle-grid">
          ${system.invariants.map((item, index) => `
            <article class="principle-card">
              <div class="principle-icon">${icon(index % 2 === 0 ? "lock-keyhole" : "check-check")}</div>
              <div><h3>Regra ${index + 1}</h3><p>${item}</p></div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="content-section" id="example">
        <div class="section-heading"><div><div class="eyebrow">Uso</div><h2>Exemplo em Luau</h2></div><a class="button" href="${system.source}">${icon("file-code-2")} Abrir ModuleScript</a></div>
        <div class="code-panel">
          <div class="code-toolbar"><span>${system.name}.luau</span><button class="icon-button copy-code" type="button" aria-label="Copiar exemplo" title="Copiar exemplo" data-copy-code="${system.id}">${icon("copy")}</button></div>
          <pre><code>${escapeHtml(system.example)}</code></pre>
        </div>
      </section>

      <section class="content-section" id="risks">
        <div class="section-heading"><div><div class="eyebrow">Revisão</div><h2>Erros comuns</h2></div></div>
        <div class="risk-grid">
          ${system.mistakes.map(([title, description]) => `<article class="risk-card"><h3>${icon("triangle-alert")} ${title}</h3><p>${description}</p></article>`).join("")}
        </div>
      </section>

      <section class="content-section" id="tests">
        <div class="section-heading"><div><div class="eyebrow">Verificação</div><h2>Checklist de testes</h2></div></div>
        <div class="test-grid">
          ${system.tests.map((description, index) => `<article class="test-card"><h3>${icon("flask-conical")} Cenário ${String(index + 1).padStart(2, "0")}</h3><p>${description}</p></article>`).join("")}
        </div>
      </section>

      ${renderKnowledgeCheck(system)}

      <section class="content-section system-notes" id="notes">
        <div class="section-heading"><div><div class="eyebrow">Caderno pessoal</div><h2>Notas desta aula</h2></div><span>Salvo automaticamente</span></div>
        <textarea data-system-note="${system.id}" rows="7" placeholder="Registre decisões, dúvidas, adaptações para o seu jogo e pontos que quer revisar...">${escapeHtml(progress.systemNotes[system.id] || "")}</textarea>
      </section>

      ${renderRelatedLearning(system)}

      <footer class="detail-footer">
        ${previous ? `<button class="button" type="button" data-route="system/${previous.id}">${icon("arrow-left")} <span>${previous.label}</span></button>` : '<button class="button" type="button" data-route="overview">' + icon("arrow-left") + '<span>Visão geral</span></button>'}
        ${next ? `<button class="button primary" type="button" data-route="system/${next.id}"><span>${next.label}</span> ${icon("arrow-right")}</button>` : '<button class="button primary" type="button" data-route="roadmap"><span>Revisar a ordem</span>' + icon("route") + '</button>'}
      </footer>
    `;
  }

  function renderKnowledgeCheck(system) {
    const correct = system.methods[0][0];
    const distractors = systems.filter((candidate) => candidate !== system).slice(0, 2).map((candidate) => candidate.methods[0][0]);
    const choices = [correct, ...distractors].sort((left, right) => left.localeCompare(right));
    const selected = progress.quizAnswers[system.id];
    return `<section class="content-section knowledge-check"><div class="section-heading"><div><div class="eyebrow">Exercício interativo</div><h2>Verificação rápida</h2></div><span>${selected === correct ? "Resposta correta" : "Escolha uma opção"}</span></div><fieldset><legend>Qual método inicia o contrato principal de <strong>${system.label}</strong>?</legend>${choices.map((choice) => `<label class="quiz-choice ${selected === choice ? (choice === correct ? "correct" : "incorrect") : ""}"><input type="radio" name="quiz-${system.id}" value="${escapeHtml(choice)}" data-quiz-system="${system.id}" ${selected === choice ? "checked" : ""}><span><code>${escapeHtml(choice)}</code>${selected === choice ? `<small>${choice === correct ? system.methods[0][1] : "Esse método pertence a outro sistema. Compare responsabilidades."}</small>` : ""}</span></label>`).join("")}</fieldset></section>`;
  }

  function getRecommendedSystem() {
    const unfinishedTrackSystem = learningTracks
      .flatMap((track) => track.systems)
      .map(getSystem)
      .find((system) => system && !progress.systems[system.id]);
    return unfinishedTrackSystem || systems.find((system) => !progress.systems[system.id]) || systems[0];
  }

  function renderContinuePanel() {
    const lastSystemId = progress.lastRoute.startsWith("system/") ? progress.lastRoute.split("/")[1] : "";
    const target = getSystem(lastSystemId) || getRecommendedSystem();
    if (!target) return "";
    const completedSteps = target.stages.filter((_stage, index) => progress.steps[`${target.id}:${index}`]).length;
    const percentage = Math.round((completedSteps / Math.max(target.stages.length, 1)) * 100);
    return `
      <section class="continue-panel">
        <div class="continue-icon">${icon("play")}</div>
        <div><span>${lastSystemId ? "Continuar de onde parou" : "Próxima aula recomendada"}</span><strong>${target.label}</strong><p>${completedSteps}/${target.stages.length} etapas concluídas</p></div>
        <div class="continue-progress" aria-label="${percentage}% concluído"><i style="width:${percentage}%"></i></div>
        <button class="button primary" type="button" data-route="system/${target.id}">Continuar ${icon("arrow-right")}</button>
      </section>`;
  }

  function renderJourney() {
    const completed = systems.filter((system) => progress.systems[system.id]).length;
    const favorites = systems.filter((system) => progress.favorites[system.id]);
    const recents = progress.recents.map(getSystem).filter(Boolean);
    const statusCopy = {
      synced: ["cloud-check", "Sincronizado com sua conta"],
      saving: ["refresh-cw", "Salvando alterações"],
      offline: ["cloud-off", "Offline: alterações guardadas neste dispositivo"],
      error: ["cloud-alert", "Nuvem indisponível: cópia local preservada"],
      unavailable: ["hard-drive", "Salvo neste dispositivo"],
      local: ["hard-drive", "Preparando seu perfil"]
    }[syncStatus] || ["hard-drive", "Salvo neste dispositivo"];

    content.innerHTML = `
      <header class="page-header"><div><div class="eyebrow">${icon("compass")} Área do aluno</div><h1>Minha Jornada</h1><p class="lead">Retome o estudo, organize referências e transforme leitura em prática.</p></div></header>
      <div class="sync-banner sync-${syncStatus}">${icon(statusCopy[0])}<div><strong>${statusCopy[1]}</strong><span>${completed}/${systems.length} sistemas estudados</span></div></div>
      ${renderContinuePanel()}
      <section class="journey-stats">
        <article><span>Conclusão</span><strong>${Math.round((completed / systems.length) * 100)}%</strong><div class="xp-track"><i style="width:${Math.round((completed / systems.length) * 100)}%"></i></div></article>
        <article><span>Favoritos</span><strong>${favorites.length}</strong><small>Referências rápidas</small></article>
        <article><span>Notas</span><strong>${Object.values(progress.systemNotes).filter((note) => note.trim()).length}</strong><small>Decisões registradas</small></article>
        <article><span>XP de prática</span><strong>${getWorkspaceXP().total.toLocaleString("pt-BR")}</strong><small>Nível ${getWorkspaceXP().level}</small></article>
      </section>
      <section class="content-section"><div class="section-heading"><div><div class="eyebrow">Acesso rápido</div><h2>Favoritos</h2></div><p>Marque a estrela de qualquer sistema para montar sua biblioteca.</p></div>
        <div class="journey-list">${favorites.length ? favorites.map((system) => `<button type="button" data-route="system/${system.id}">${icon(system.icon)}<span><strong>${system.label}</strong><small>${system.role}</small></span>${icon("arrow-right")}</button>`).join("") : '<div class="empty-state">Nenhum favorito ainda. Abra um sistema e marque a estrela.</div>'}</div>
      </section>
      <section class="content-section"><div class="section-heading"><div><div class="eyebrow">Histórico</div><h2>Vistos recentemente</h2></div></div>
        <div class="journey-list compact">${recents.length ? recents.map((system) => `<button type="button" data-route="system/${system.id}">${icon("history")}<span><strong>${system.label}</strong><small>Fase ${system.phase} · ${system.tier || system.category}</small></span>${icon("arrow-right")}</button>`).join("") : '<div class="empty-state">Seu histórico aparecerá ao abrir uma aula.</div>'}</div>
      </section>`;
  }

  function renderTracks() {
    content.innerHTML = `
      <header class="page-header"><div><div class="eyebrow">${icon("milestone")} Currículo guiado</div><h1>Trilhas de aprendizado</h1><p class="lead">Sequências menores, com objetivo e ordem clara, para você não estudar cento e setenta sistemas ao mesmo tempo.</p></div></header>
      <div class="track-grid">${learningTracks.map((track) => {
        const trackSystems = track.systems.map(getSystem).filter(Boolean);
        const done = trackSystems.filter((system) => progress.systems[system.id]).length;
        const next = trackSystems.find((system) => !progress.systems[system.id]) || trackSystems.at(-1);
        const percentage = Math.round((done / Math.max(trackSystems.length, 1)) * 100);
        return `<article class="track-card"><header><span class="track-icon">${icon(track.icon)}</span><span class="tier-badge">${track.level}</span></header><h2>${track.title}</h2><p>${track.description}</p><div class="track-progress"><span>${done}/${trackSystems.length} aulas</span><strong>${percentage}%</strong><i><b style="width:${percentage}%"></b></i></div><ol>${trackSystems.map((system) => `<li class="${progress.systems[system.id] ? "done" : ""}"><button type="button" data-route="system/${system.id}">${progress.systems[system.id] ? icon("circle-check-big") : icon("circle")}<span>${system.label}</span></button></li>`).join("")}</ol>${next ? `<button class="button primary" type="button" data-route="system/${next.id}">${done === trackSystems.length ? "Revisar trilha" : "Continuar trilha"} ${icon("arrow-right")}</button>` : ""}</article>`;
      }).join("")}</div>`;
  }

  function createLabStarter(system) {
    const methodName = system?.methods?.[0]?.[0]?.split("(")[0] || "Execute";
    return `-- Laboratório: ${system?.name || "Service"}\nlocal ${system?.name || "Service"} = {}\n${system?.name || "Service"}.__index = ${system?.name || "Service"}\n\nfunction ${system?.name || "Service"}:${methodName}(player, payload)\n    -- 1. Valide payload e permissão no servidor\n    -- 2. Calcule antes de alterar o estado\n    -- 3. Retorne um resultado explícito\nend\n\nreturn ${system?.name || "Service"}`;
  }

  function renderLab(systemId) {
    const system = getSystem(systemId) || getRecommendedSystem();
    const draft = progress.labDrafts[system.id] || createLabStarter(system);
    content.innerHTML = `
      <header class="page-header"><div><div class="eyebrow">${icon("square-terminal")} Prática orientada</div><h1>Laboratório Luau</h1><p class="lead">Escreva o contrato do módulo, faça uma revisão estrutural e compare suas decisões com a aula.</p></div></header>
      <section class="lab-workbench">
        <div class="lab-toolbar"><label for="lab-system">Sistema</label><select id="lab-system" data-lab-system>${systems.map((item) => `<option value="${item.id}" ${item.id === system.id ? "selected" : ""}>${item.label}</option>`).join("")}</select><span>Rascunho salvo automaticamente</span></div>
        <div class="lab-challenge"><div><span>Básico</span><strong>Declare módulo e método público</strong></div><div><span>Intermediário</span><strong>Valide entrada sem confiar no cliente</strong></div><div><span>Avançado</span><strong>Planeje falha parcial e rollback</strong></div></div>
        <textarea class="luau-editor" data-lab-draft="${system.id}" spellcheck="false" aria-label="Editor Luau">${escapeHtml(draft)}</textarea>
        <footer class="lab-actions"><div class="lab-feedback" aria-live="polite">${labFeedback || "A validação procura estrutura, não executa o motor do Roblox."}</div><button class="button" type="button" data-lab-reset="${system.id}">${icon("rotate-ccw")} Reiniciar</button><button class="button" type="button" data-copy-lab="${system.id}">${icon("copy")} Copiar</button><button class="button primary" type="button" data-lab-check="${system.id}">${icon("scan-search")} Revisar estrutura</button></footer>
      </section>
      <section class="content-section"><div class="section-heading"><div><div class="eyebrow">Contrato de referência</div><h2>${system.name}</h2></div><button class="text-button" type="button" data-route="system/${system.id}">Abrir aula completa ${icon("arrow-right")}</button></div><div class="principle-grid">${system.invariants.slice(0, 4).map((rule, index) => `<article class="principle-card"><div class="principle-icon">${icon("shield-check")}</div><div><h3>Invariante ${index + 1}</h3><p>${rule}</p></div></article>`).join("")}</div></section>`;
  }

  function tutorReply(question) {
    const normalized = question.toLocaleLowerCase("pt-BR");
    const matched = systems.find((system) => [system.name, system.label, ...system.methods.map((method) => method[0])].some((term) => normalized.includes(term.toLocaleLowerCase("pt-BR"))))
      || getSystem(progress.lastRoute.split("/")[1])
      || getRecommendedSystem();
    if (!matched) return "Abra uma aula para eu usar o contexto técnico dela.";
    if (/erro|risco|falha|segur/.test(normalized)) return `${matched.label}: ${matched.mistakes[0][0]}. ${matched.mistakes[0][1]} Invariante principal: ${matched.invariants[0]}`;
    if (/m[eé]todo|api|fun[cç][aã]o|c[oó]digo/.test(normalized)) return `Comece por ${matched.methods[0][0]}: ${matched.methods[0][1]} O retorno esperado é ${matched.methods[0][2]}. Depois teste: ${matched.tests[0]}`;
    if (/ordem|etapa|come[cç]ar|implementar/.test(normalized)) return `Para ${matched.label}, siga esta ordem: ${matched.stages.slice(0, 4).join(" Depois, ")}`;
    return `${matched.label} existe para ${matched.role.toLocaleLowerCase("pt-BR")} Pense primeiro nesta pergunta: ${matched.question}`;
  }

  function renderTutorMessage(message) {
    const role = message.role === "user" ? "user" : "assistant";
    const audioId = typeof message.audioId === "string" ? message.audioId : "";
    const audio = audioId ? `<div class="tutor-audio" data-audio-container="${escapeHtml(audioId)}"><button class="button audio-load-button" type="button" data-load-audio="${escapeHtml(audioId)}">${icon("play")} Ouvir áudio</button><button class="icon-button danger-button" type="button" data-delete-audio="${escapeHtml(audioId)}" aria-label="Excluir áudio" title="Excluir áudio">${icon("trash-2")}</button><small>${Math.max(1, Math.round((Number(message.durationMs) || 0) / 1000))}s</small></div>` : "";
    const copy = message.text ? `<p>${escapeHtml(message.text)}</p>` : "";
    const speak = role === "assistant" && message.text ? `<button class="icon-button" type="button" data-speak="${escapeHtml(message.text)}" aria-label="Ouvir resposta" title="Ouvir resposta">${icon("volume-2")}</button>` : "";
    return `<article class="${role}"><span>${role === "user" ? "Você" : "Tutor"}</span>${copy}${audio}${speak}</article>`;
  }

  function renderTutor() {
    const context = getSystem(progress.lastRoute.split("/")[1]) || getRecommendedSystem();
    const messages = Array.isArray(progress.tutorMessages) ? progress.tutorMessages.slice(commerceAccount.plusActive ? -20 : -8) : [];
    content.innerHTML = `
      <header class="page-header"><div><div class="eyebrow">${icon("messages-square")} Tutor contextual</div><h1>Converse com a Academy</h1><p class="lead">Pergunte sobre arquitetura, métodos, etapas e riscos usando o conteúdo técnico desta biblioteca.</p></div></header>
      <section class="tutor-shell"><aside><span>Contexto atual</span><strong>${context?.label || "Visão geral"}</strong><p>${context?.role || "Escolha uma aula para aprofundar a conversa."}</p><div class="tutor-suggestions">${["Como começar?", "Qual o maior risco?", "Explique a API", "Como testar?"].map((text) => `<button type="button" data-tutor-suggestion="${text}">${text}</button>`).join("")}</div></aside><div class="tutor-chat"><div class="tutor-messages" aria-live="polite">${messages.length ? messages.map(renderTutorMessage).join("") : `<article class="assistant"><span>Tutor</span><p>Estou usando ${context?.label || "a biblioteca"} como contexto. O que você quer entender primeiro?</p></article>`}</div><form class="tutor-form" data-tutor-form><button class="icon-button" type="button" data-voice-input aria-label="Ditado por voz" title="Converter voz em texto">${icon("mic")}</button><button class="icon-button audio-record-button" type="button" data-audio-record aria-label="Gravar mensagem de áudio" title="Gravar mensagem de áudio" ${tutorAudioConfig.available ? "" : "disabled"}>${icon("audio-lines")}</button><label class="sr-only" for="tutor-question">Pergunta</label><input id="tutor-question" name="question" placeholder="Pergunte como pensar, implementar ou testar..." autocomplete="off" required><button class="button primary" type="submit">Enviar ${icon("send")}</button></form><small id="tutor-audio-status">${tutorAudioConfig.available ? `Áudios ficam no bucket privado por ${tutorAudioConfig.retentionDays} dias. Textos e metadados sincronizam pelo PostgreSQL.` : "Gravação em nuvem ficará disponível após configurar PostgreSQL e Cloudflare R2."}</small></div></section>`;
  }

  function academyAreas() {
    const used = new Set(learningTracks.flatMap((track) => track.systems));
    const areas = learningTracks.map((track, index) => ({
      ...track,
      minimumLevel: index * 2 + 1,
      systems: track.systems.map(getSystem).filter(Boolean),
    }));
    const remaining = systems.filter((system) => !used.has(system.id));
    const specializationNames = ["Arquitetura", "Produção", "Escala", "Operações", "Maestria"];
    for (let index = 0; index < remaining.length; index += 7) {
      const sequence = index / 7;
      areas.push({
        id: `specializations-${sequence + 1}`,
        title: `Especialização: ${specializationNames[sequence] || `Nível ${sequence + 1}`}`,
        icon: "orbit",
        level: "Mestre",
        description: "Sistemas complementares para consolidar uma arquitetura completa.",
        minimumLevel: areas.length * 2 + 1,
        systems: remaining.slice(index, index + 7),
      });
    }
    return areas;
  }

  function sessionKey(areaId, systemId) {
    return `${areaId}:${systemId}`;
  }

  function isSessionUnlocked(area, index) {
    if (getGameLevel() < area.minimumLevel) return false;
    if (index === 0) return true;
    return Boolean(progress.game.completedSessions[sessionKey(area.id, area.systems[index - 1].id)]);
  }

  function makeQuestionOptions(correct, distractors, seed) {
    const options = [correct, ...distractors.filter((value) => value && value !== correct)].filter((value, index, array) => array.indexOf(value) === index).slice(0, 4);
    const rotation = seed % options.length;
    return [...options.slice(rotation), ...options.slice(0, rotation)];
  }

  function makeSessionQuestions(system) {
    const otherSystems = systems.filter((candidate) => candidate !== system);
    const distract = (selector, offset) => otherSystems.slice(offset, offset + 5).map(selector).filter(Boolean);
    const definitions = [
      {
        prompt: `Qual é a responsabilidade principal de ${system.name}?`,
        correct: system.role,
        distractors: distract((candidate) => candidate.role, 0),
        explanation: `${system.name} existe para ${system.role.toLocaleLowerCase("pt-BR")}`,
      },
      {
        prompt: `Onde está a fonte de verdade de ${system.label}?`,
        correct: system.truth,
        distractors: distract((candidate) => candidate.truth, 4),
        explanation: `A fonte canônica evita duas cópias concorrentes: ${system.truth}`,
      },
      {
        prompt: `Qual método pertence ao contrato de ${system.name}?`,
        correct: system.methods[0][0],
        distractors: distract((candidate) => candidate.methods?.[0]?.[0], 9),
        explanation: `${system.methods[0][0]}: ${system.methods[0][1]} Retorno: ${system.methods[0][2]}.`,
      },
      {
        prompt: `Qual regra precisa permanecer verdadeira em ${system.label}?`,
        correct: system.invariants[0],
        distractors: distract((candidate) => candidate.invariants?.[0], 14),
        explanation: `Essa é uma invariante do sistema: ${system.invariants[0]}`,
      },
      {
        prompt: `Qual cenário prova melhor o comportamento inicial de ${system.name}?`,
        correct: system.tests[0],
        distractors: distract((candidate) => candidate.tests?.[0], 19),
        explanation: `O primeiro teste de confiança é: ${system.tests[0]}`,
      },
    ];
    return definitions.map((question, index) => ({
      ...question,
      options: makeQuestionOptions(question.correct, question.distractors, system.id.length + index),
    }));
  }

  function beginAreaSession(areaId, systemId) {
    const area = academyAreas().find((candidate) => candidate.id === areaId);
    const system = area?.systems.find((candidate) => candidate.id === systemId);
    const index = area?.systems.indexOf(system);
    if (!area || !system || index < 0 || !isSessionUnlocked(area, index)) return false;
    if (!commerceAccount.plusActive && getTotalEnergy() <= 0) {
      routeTo("store");
      showToast("Você precisa de energia para iniciar uma sessão.");
      return false;
    }
    activeQuiz = { areaId, systemId, index: 0, correct: 0, answered: false, selected: "", earnedXp: 0, finished: false };
    return true;
  }

  function renderAreas() {
    const level = getGameLevel();
    const levelProgress = getLevelProgress();
    const completedCount = Object.keys(progress.game.completedSessions).length;
    content.innerHTML = `
      <header class="page-header"><div><div class="eyebrow">${icon("map")} Caminho prático</div><h1>Áreas de domínio</h1><p class="lead">Avance sistema por sistema, prove o entendimento e desbloqueie áreas mais exigentes.</p></div><div class="header-actions"><button class="button" type="button" data-route="settings">${icon("sliders-horizontal")} Efeitos</button></div></header>
      <section class="game-profile-bar"><div class="game-level-orb"><span>LV</span><strong>${level}</strong></div><div class="game-level-copy"><span>${progress.game.xp.toLocaleString("pt-BR")} XP · Renascimento ${progress.game.prestige}</span><div class="xp-track large"><i style="width:${levelProgress.percentage}%"></i></div><small>${levelProgress.current}/${levelProgress.required} XP para o próximo nível</small></div><div class="game-resource"><i data-lucide="box"></i><span>Cubic Energy</span><strong>${commerceAccount.plusActive ? "Infinita" : getTotalEnergy()}</strong></div>${level >= 10 && progress.game.prestige < 3 ? `<button class="button rebirth-button" type="button" data-rebirth-open>${icon("rotate-ccw")} Renascer</button>` : ""}</section>
      <div class="area-map">${academyAreas().map((area, areaIndex) => {
        const levelLocked = level < area.minimumLevel;
        const done = area.systems.filter((system) => progress.game.completedSessions[sessionKey(area.id, system.id)]).length;
        return `<section class="area-zone ${levelLocked ? "area-locked" : ""}" style="--area-index:${areaIndex}"><header><div class="area-number">${String(areaIndex + 1).padStart(2, "0")}</div><div><span>${area.level} · Nível ${area.minimumLevel}</span><h2>${area.title}</h2><p>${area.description}</p></div><strong>${done}/${area.systems.length}</strong></header><div class="area-path">${area.systems.map((system, index) => {
          const unlocked = isSessionUnlocked(area, index);
          const completed = progress.game.completedSessions[sessionKey(area.id, system.id)];
          const best = progress.game.bestScores[sessionKey(area.id, system.id)] || 0;
          return `<button class="area-session ${completed ? "completed" : ""} ${unlocked ? "" : "locked"}" type="button" ${unlocked ? `data-start-session="${area.id}:${system.id}"` : `data-locked-session="${levelLocked ? `Nível ${area.minimumLevel} necessário` : "Conclua a sessão anterior"}"`} aria-label="${system.label}${unlocked ? "" : ", bloqueado"}"><span>${completed ? icon("check") : unlocked ? icon(system.icon) : icon("lock-keyhole")}</span><strong>${system.label}</strong><small>${completed ? `Melhor resultado ${best}/5` : unlocked ? "Iniciar sessão" : levelLocked ? `Nível ${area.minimumLevel}` : "Bloqueado"}</small></button>`;
        }).join("")}</div></section>`;
      }).join("")}</div>
      <section class="prestige-note"><div>${icon("sparkles")}<div><strong>Renascimento multiplica recompensas</strong><p>Disponível a partir do nível 10. Cada renascimento dobra XP e energia gratuita recebidos, até 8x.</p></div></div><span>${completedCount} sessões concluídas</span></section>`;
  }

  function renderAreaSession(areaId, systemId) {
    const area = academyAreas().find((candidate) => candidate.id === areaId);
    const system = area?.systems.find((candidate) => candidate.id === systemId);
    if (!area || !system) {
      routeTo("areas");
      return;
    }
    if (!activeQuiz || activeQuiz.areaId !== areaId || activeQuiz.systemId !== systemId) {
      if (!beginAreaSession(areaId, systemId)) return;
    }
    if (activeQuiz.finished) {
      renderAreaResult(area, system);
      return;
    }
    const questions = makeSessionQuestions(system);
    const question = questions[activeQuiz.index];
    const percentage = Math.round((activeQuiz.index / questions.length) * 100);
    content.innerHTML = `
      <section class="quiz-shell"><header class="quiz-topbar"><button class="icon-button" type="button" data-quit-session aria-label="Sair da sessão" title="Sair da sessão">${icon("x")}</button><div><i style="width:${percentage}%"></i></div><span>${activeQuiz.index + 1}/${questions.length}</span><strong>${commerceAccount.plusActive ? "∞" : getTotalEnergy()} ${icon("box")}</strong></header><div class="quiz-context"><span>${area.title}</span><strong>${system.name}</strong></div><main><div class="quiz-question-number">Pergunta ${String(activeQuiz.index + 1).padStart(2, "0")}</div><h1>${question.prompt}</h1><div class="quiz-options">${question.options.map((option, index) => {
        const isSelected = activeQuiz.selected === option;
        const isCorrect = option === question.correct;
        const state = activeQuiz.answered ? (isCorrect ? "correct" : isSelected ? "wrong" : "muted") : "";
        return `<button type="button" class="quiz-option ${state}" data-answer-index="${index}" ${activeQuiz.answered ? "disabled" : ""}><span>${String.fromCharCode(65 + index)}</span><p>${escapeHtml(option)}</p>${activeQuiz.answered && isCorrect ? icon("check-circle-2") : activeQuiz.answered && isSelected ? icon("x-circle") : ""}</button>`;
      }).join("")}</div>${activeQuiz.answered ? `<section class="answer-feedback ${activeQuiz.selected === question.correct ? "success" : "error"}"><div>${icon(activeQuiz.selected === question.correct ? "sparkles" : "book-open-check")}<div><strong>${activeQuiz.selected === question.correct ? "Resposta correta" : "Resposta correta revelada"}</strong><p>${question.explanation}</p></div></div><button class="button primary" type="button" data-next-question>${activeQuiz.index === questions.length - 1 ? "Ver resultado" : "Continuar"} ${icon("arrow-right")}</button></section>` : ""}</main></section>`;
  }

  function renderAreaResult(area, system) {
    const passed = activeQuiz.correct >= 4;
    content.innerHTML = `<section class="quiz-result ${passed ? "passed" : "retry"}"><div class="result-emblem">${icon(passed ? "trophy" : "refresh-cw")}</div><span>${area.title}</span><h1>${passed ? "Sessão concluída" : "Quase lá"}</h1><p>${passed ? `Você demonstrou domínio inicial de ${system.label}.` : "Revise a explicação das respostas e tente novamente para desbloquear a próxima sessão."}</p><div class="result-stats"><article><span>Acertos</span><strong>${activeQuiz.correct}/5</strong></article><article><span>XP recebido</span><strong>+${activeQuiz.earnedXp}</strong></article><article><span>Multiplicador</span><strong>${getRewardMultiplier()}x</strong></article></div><div><button class="button" type="button" data-route="areas">${icon("map")} Voltar às Áreas</button><button class="button primary" type="button" data-retry-session="${area.id}:${system.id}">${passed ? "Praticar novamente" : "Tentar novamente"} ${icon("arrow-right")}</button></div></section>`;
  }

  async function consumePurchasedEnergy() {
    try {
      const response = await fetch("/api/commerce/energy/consume", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "wrong_quiz_answer" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) return false;
      commerceAccount.purchasedEnergy = payload.purchasedEnergy;
      return true;
    } catch (_error) {
      commerceAccount.purchasedEnergy = 0;
      return false;
    }
  }

  async function answerAreaQuestion(optionIndex, target) {
    if (!activeQuiz || activeQuiz.answered) return;
    const area = academyAreas().find((candidate) => candidate.id === activeQuiz.areaId);
    const system = area?.systems.find((candidate) => candidate.id === activeQuiz.systemId);
    const question = system ? makeSessionQuestions(system)[activeQuiz.index] : null;
    const selected = question?.options[optionIndex];
    if (!question || selected === undefined) return;

    const correct = selected === question.correct;
    const previousLevel = getGameLevel();
    activeQuiz.answered = true;
    activeQuiz.selected = selected;
    if (correct) {
      const reward = 10 * getRewardMultiplier();
      activeQuiz.correct += 1;
      activeQuiz.earnedXp += reward;
      progress.game.xp += reward;
      progress.game.correctAnswers += 1;
      progress.game.streak += 1;
      if (progress.game.streak % 3 === 0 && !commerceAccount.plusActive) {
        progress.game.earnedEnergy += getRewardMultiplier();
      }
      window.NeonEffects?.burst(target, "correct");
    } else {
      progress.game.wrongAnswers += 1;
      progress.game.streak = 0;
      if (!commerceAccount.plusActive) {
        if (progress.game.earnedEnergy > 0) {
          progress.game.earnedEnergy -= 1;
        } else if (commerceAccount.purchasedEnergy > 0) {
          const consumed = await consumePurchasedEnergy();
          if (!consumed) showToast("Não foi possível atualizar a energia comprada.");
        }
      }
      window.NeonEffects?.burst(target, "wrong");
    }
    saveProgress();
    renderAreaSession(activeQuiz.areaId, activeQuiz.systemId);
    if (getGameLevel() > previousLevel) {
      window.NeonEffects?.burst(document.querySelector(".quiz-context"), "level");
      showToast(`Você chegou ao nível ${getGameLevel()}!`);
    }
  }

  function finishAreaSession() {
    if (!activeQuiz) return;
    const area = academyAreas().find((candidate) => candidate.id === activeQuiz.areaId);
    const system = area?.systems.find((candidate) => candidate.id === activeQuiz.systemId);
    if (!area || !system) return;
    const key = sessionKey(area.id, system.id);
    const passed = activeQuiz.correct >= 4;
    progress.game.bestScores[key] = Math.max(progress.game.bestScores[key] || 0, activeQuiz.correct);
    if (passed) {
      const firstCompletion = !progress.game.completedSessions[key];
      progress.game.completedSessions[key] = true;
      progress.systems[system.id] = true;
      if (firstCompletion) {
        const bonus = 25 * getRewardMultiplier();
        progress.game.xp += bonus;
        activeQuiz.earnedXp += bonus;
      }
    }
    activeQuiz.finished = true;
    saveProgress();
    renderAreaResult(area, system);
    if (passed) window.NeonEffects?.burst(document.querySelector(".result-emblem"), "level");
  }

  function formatBRL(cents) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  }

  function renderStore(success = false) {
    const plus = commerceCatalog.find((product) => product.type === "subscription");
    const energyProducts = commerceCatalog.filter((product) => product.type === "energy");
    const recentStripeCredit = commerceLedger.find((entry) => entry.source === "stripe_checkout" && Date.now() - new Date(entry.createdAt).getTime() < 30 * 60 * 1000);
    const sourceLabels = { stripe_checkout: "Compra Stripe", "charge.refunded": "Reembolso", "charge.dispute.created": "Contestação" };
    content.innerHTML = `
      <header class="page-header"><div><div class="eyebrow">${icon("gem")} Neon Academy</div><h1>Plus e Cubic Energy</h1><p class="lead">Expanda sua rotina de estudo sem misturar compras com o progresso pedagógico.</p></div></header>
      ${success ? `<div class="purchase-return ${checkoutReturn.confirmed ? "confirmed" : "pending"}">${icon(checkoutReturn.confirmed ? "badge-check" : "loader-circle")}<div><strong>${checkoutReturn.confirmed ? "Pagamento confirmado pelo Stripe" : "Aguardando confirmação assinada"}</strong><span>${checkoutReturn.confirmed ? "A compra é válida. O benefício será refletido assim que o webhook terminar o processamento." : "Não feche esta página. A validação pode levar alguns segundos."}</span></div></div>` : ""}
      ${!checkoutAvailable ? `<section class="store-availability">${icon("construction")}<div><strong>Loja em configuração</strong><p>Compras permanecem bloqueadas até banco, Price IDs e webhook Stripe estarem validados no servidor.</p></div></section>` : ""}
      <section class="plus-offer"><div class="plus-mark">${icon("infinity")}</div><div><span>Assinatura mensal</span><h2>Neon Academy Plus</h2><p>Energia infinita, histórico maior do tutor e personalização completa da Academy.</p><ul><li>${icon("check")} Energia infinita nas Áreas</li><li>${icon("check")} Conversas maiores com o tutor</li><li>${icon("palette")} Temas Plus, fundos locais e busca Pexels quando configurada</li></ul></div><div class="plus-price"><span>${commerceAccount.plusActive ? "Plano ativo" : "Por mês"}</span><strong>${plus ? formatBRL(plus.amountCents) : "R$ 99,90"}</strong><button class="button primary" type="button" data-buy-product="plus-monthly" ${!checkoutAvailable || commerceAccount.plusActive ? "disabled" : ""}>${commerceAccount.plusActive ? "Plus ativo" : checkoutAvailable ? "Assinar Plus" : "Checkout em configuração"}</button></div></section>
      <section class="content-section"><div class="section-heading"><div><div class="eyebrow">Pacotes avulsos</div><h2>Cubic Energy</h2></div><p>Energia comprada nunca é removida por Renascimento.</p></div><div class="energy-store-grid">${energyProducts.length ? energyProducts.map((product) => `<article class="energy-product"><div>${icon("box")}<span>${product.energy}</span></div><h3>Cubic Energy</h3>${product.compareAtCents ? `<del>${formatBRL(product.compareAtCents)}</del>` : ""}<strong>${formatBRL(product.amountCents)}</strong><button class="button" type="button" data-buy-product="${product.id}" ${checkoutAvailable ? "" : "disabled"}>${checkoutAvailable ? "Comprar" : "Indisponível"}</button></article>`).join("") : '<div class="empty-state">Carregando catálogo seguro...</div>'}</div></section>
      <section class="content-section commerce-history"><div class="section-heading"><div><div class="eyebrow">Transparência</div><h2>Extrato de Cubic Energy</h2></div><p>Créditos e débitos confirmados pelo servidor.</p></div><div class="ledger-list">${commerceLedger.length ? commerceLedger.map((entry) => `<article><span class="ledger-delta ${entry.delta >= 0 ? "positive" : "negative"}">${entry.delta >= 0 ? "+" : ""}${Number(entry.delta).toLocaleString("pt-BR")}</span><div><strong>${escapeHtml(sourceLabels[entry.source] || entry.source.replace(/^admin_adjustment:.*/, "Ajuste administrativo"))}</strong><small>${new Date(entry.createdAt).toLocaleString("pt-BR")}</small></div></article>`).join("") : '<div class="empty-state">Nenhuma movimentação de energia comprada.</div>'}</div></section>
      <section class="store-disclosure">${icon("shield-check")}<p>Preços e saldo são validados no servidor. Nenhum crédito é concedido antes do webhook. ${promotionVerified ? "Os preços anteriores foram marcados como verificados pelo operador." : "Preços riscados permanecem ocultos até existir comprovação da oferta."} Ao continuar, você aceita os <a href="/terms" target="_blank" rel="noopener">Termos de Uso</a> e a <a href="/privacy" target="_blank" rel="noopener">Política de Privacidade</a>.</p></section>`;
    if (commerceAccount.plusActive) {
      const plusAction = content.querySelector('[data-buy-product="plus-monthly"]');
      plusAction.disabled = false;
      plusAction.removeAttribute("data-buy-product");
      plusAction.dataset.manageBilling = "";
      plusAction.textContent = "Gerenciar assinatura";
    }
  }

  function renderSettings() {
    const settings = [
      ["mouseTrail", "Rastro RGB", "Rastro verde iluminado que acompanha o ponteiro."],
      ["clickEffects", "Toques ao clicar", "Ondas visuais discretas no clique esquerdo."],
      ["sounds", "Efeitos sonoros", "Sons de acerto, erro e subida de nível."],
      ["particles", "Partículas", "Celebrações visuais nas respostas corretas."],
      ["scene3d", "Cubos 3D", "Cena procedural que reage à rolagem."],
      ["spoilerMode", "Proteção de código", "Scripts começam desfocados para compartilhamento de tela."],
    ];
    content.innerHTML = `<header class="page-header"><div><div class="eyebrow">${icon("settings")} Preferências</div><h1>Configurações da Academy</h1><p class="lead">Controle movimento, som e privacidade visual sem alterar seu progresso.</p></div></header><section class="settings-list">${settings.map(([key, title, description]) => `<label><span class="settings-icon">${icon(key === "sounds" ? "volume-2" : key === "scene3d" ? "box" : key === "spoilerMode" ? "eye-off" : "sparkles")}</span><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" role="switch" data-setting="${key}" ${progress.settings[key] ? "checked" : ""}></label>`).join("")}</section><section class="account-services content-section"><div class="section-heading"><div><div class="eyebrow">Serviços da conta</div><h2>Estado da nuvem</h2></div></div><div class="service-status-grid"><article class="${syncStatus === "synced" ? "ready" : "pending"}">${icon("cloud")}<div><strong>Progresso</strong><span>${syncStatus === "synced" ? "Sincronizado no PostgreSQL" : "Armazenamento local ativo"}</span></div></article><article class="${tutorAudioConfig.available ? "ready" : "pending"}">${icon("audio-lines")}<div><strong>Áudio do tutor</strong><span>${tutorAudioConfig.available ? `R2 privado · ${tutorAudioConfig.retentionDays} dias` : "Aguardando PostgreSQL + R2"}</span></div></article><article class="${checkoutAvailable ? "ready" : "pending"}">${icon("credit-card")}<div><strong>Pagamentos</strong><span>${checkoutAvailable ? "Stripe Checkout disponível" : "Compras bloqueadas com segurança"}</span></div></article></div></section>`;
  }

  function extensionContext() {
    return {
      plusActive: commerceAccount.plusActive === true,
      icon,
      escapeHtml,
      refreshIcons,
      showToast,
      rerender: render,
    };
  }

  function renderThemeStudio() {
    content.innerHTML = window.NeonThemeStudio.render(extensionContext());
  }

  function renderUiVisualizer() {
    content.innerHTML = window.NeonRobloxUI.render(extensionContext());
  }

  function renderCompiler() {
    const services = window.NeonRobloxUI?.ROBLOX_SERVICES || [];
    content.innerHTML = `<header class="page-header"><div><div class="eyebrow">${icon("binary")} Luau oficial no domínio Neon</div><h1>Luau Studio</h1><p class="lead">Crie múltiplos arquivos, use <code>--!strict</code>, receba diagnósticos, execute e inspecione bytecode em WebAssembly.</p></div><div class="header-actions"><button class="button primary" type="button" data-compiler-fullscreen>${icon("maximize")} Tela cheia</button></div></header>
      <section class="compiler-shell" id="compiler-shell"><div class="compiler-toolbar"><span>${icon("shield-check")} Motor oficial luau-lang/playground · execução local no navegador</span><span>MIT · versão hospedada pela Academy</span></div><iframe src="/luau/index.html?embed=true&theme=dark" title="Luau Playground oficial hospedado pela Neon Academy" loading="lazy" allow="clipboard-read; clipboard-write"></iframe></section>
      <section class="compiler-runtime-notice"><div>${icon("server-cog")}</div><div><strong>Linguagem Luau não é o runtime Roblox</strong><p>O compilador reconhece sintaxe, tipos, módulos e <code>--!strict</code>. Serviços como <code>DataStoreService</code> só executam de verdade dentro do Roblox Studio ou de um servidor Roblox.</p></div></section>
      <section class="content-section"><div class="section-heading"><div><div class="eyebrow">Índice Roblox</div><h2>Serviços reconhecidos no projeto</h2></div><p>Use estes nomes para autocomplete conceitual e leve o código validado ao Studio.</p></div><div class="compiler-service-index">${services.map((service) => `<code>${escapeHtml(service)}</code>`).join("")}</div></section>
      <p class="compiler-note">Código e arquivos permanecem no estado local do playground. A Academy não envia seus scripts ao backend para compilar.</p>`;
  }

  function renderCommunity() {
    content.innerHTML = `<header class="page-header"><div><div class="eyebrow">${icon("users-round")} Comunidade Neon</div><h1>Aprender com segurança</h1><p class="lead">Amizades, grupos e vídeo estão arquitetados como recursos moderados, não como um chat aberto.</p></div></header><section class="community-gate"><div>${icon("shield-alert")}<div><strong>Controles de segurança em construção</strong><p>O lançamento depende de idade, consentimento quando aplicável, denúncia, bloqueio, moderação, retenção mínima e resposta a incidentes.</p></div></div><span>Não disponível</span></section><div class="community-capabilities">${[["user-round-plus","Amizades","Pedidos mútuos, bloqueio e privacidade por padrão."],["users","Grupos seguros","Papéis, convites, logs de moderação e denúncia."],["image","Imagens","Análise de conteúdo, limites e remoção auditável."],["video","Vídeo-chamadas","WebRTC com sala consentida e controles imediatos."],["radio-tower","Transmissões","Moderação, atraso, denúncia e encerramento administrativo."],["gift","Presentes","Ledger auditável; nunca transferir energia sem confirmação."]].map(([iconName,title,description]) => `<article class="locked-capability">${icon(iconName)}<h2>${title}</h2><p>${description}</p><span>${icon("lock-keyhole")} Bloqueado por segurança</span></article>`).join("")}</div>`;
  }

  function setupSpoilers() {
    if (!progress.settings.spoilerMode) return;
    content.querySelectorAll(".code-panel pre").forEach((codeBlock) => {
      codeBlock.classList.add("spoiler-code");
      codeBlock.dataset.spoilerCode = "";
      codeBlock.tabIndex = 0;
      codeBlock.setAttribute("role", "button");
      codeBlock.setAttribute("aria-label", "Código protegido. Clique para revelar ou ocultar.");
    });
  }

  async function loadCommerceState() {
    if (window.location.protocol === "file:") return;
    try {
      const checkoutSessionId = new URLSearchParams(window.location.search).get("session_id") || "";
      const [catalogResponse, accountResponse, ledgerResponse, audioResponse, checkoutResponse] = await Promise.all([
        fetch("/api/commerce/catalog", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/commerce/account", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/commerce/ledger", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/tutor/audio/config", { credentials: "same-origin", cache: "no-store" }),
        checkoutSessionId
          ? fetch(`/api/commerce/session?sessionId=${encodeURIComponent(checkoutSessionId)}`, { credentials: "same-origin", cache: "no-store" })
          : Promise.resolve(null),
      ]);
      if (catalogResponse.ok) {
        const catalogPayload = await catalogResponse.json();
        commerceCatalog = catalogPayload.products || [];
        checkoutAvailable = catalogPayload.checkoutAvailable === true;
        promotionVerified = catalogPayload.promotionVerified === true;
      }
      if (ledgerResponse.ok) {
        const ledgerPayload = await ledgerResponse.json();
        commerceLedger = Array.isArray(ledgerPayload.entries) ? ledgerPayload.entries : [];
      }
      if (accountResponse.ok) {
        const accountPayload = await accountResponse.json();
        commerceAccount = {
          available: accountPayload.available === true,
          purchasedEnergy: Number(accountPayload.purchasedEnergy) || 0,
          plusActive: accountPayload.plusActive === true,
        };
      }
      if (audioResponse.ok) {
        const audioPayload = await audioResponse.json();
        tutorAudioConfig = {
          available: audioPayload.available === true,
          maxBytes: Number(audioPayload.maxBytes) || 0,
          maxDurationMs: Number(audioPayload.maxDurationMs) || 0,
          maxDaily: Number(audioPayload.maxDaily) || 0,
          retentionDays: Number(audioPayload.retentionDays) || 0,
        };
      }
      if (checkoutResponse) {
        checkoutReturn.checked = true;
        if (checkoutResponse.ok) {
          const checkoutPayload = await checkoutResponse.json();
          checkoutReturn = {
            checked: true,
            confirmed: checkoutPayload.confirmed === true,
            paymentStatus: checkoutPayload.paymentStatus || "",
            productId: checkoutPayload.productId || "",
          };
        }
      }
      updateProgressUI();
      window.NeonThemeStudio?.enforceEntitlement(commerceAccount.plusActive);
      if (currentRoute().startsWith("store")) render();
      if (currentRoute() === "tutor") render();
      if (currentRoute() === "themes") render();
      if (currentRoute() === "store/success" && purchaseRefreshAttempts < 8) {
        purchaseRefreshAttempts += 1;
        setTimeout(() => loadCommerceState(), 2500);
      }
    } catch (_error) {
      commerceAccount = { available: false, purchasedEnergy: 0, plusActive: false };
      commerceLedger = [];
      tutorAudioConfig.available = false;
      window.NeonThemeStudio?.enforceEntitlement(false);
    }
  }

  async function loadAdminState(force = false) {
    if (!currentUser?.isAdmin || (adminState.status === "loading" && !force)) return;
    adminState.status = "loading";
    let readiness = adminState.readiness;
    try {
      const readinessResponse = await fetch("/api/admin/readiness", { credentials: "same-origin", cache: "no-store" });
      if (readinessResponse.ok) readiness = (await readinessResponse.json()).report || null;
      const usersResponse = await fetch(`/api/admin/users?query=${encodeURIComponent(adminState.query)}`, { credentials: "same-origin", cache: "no-store" });
      const usersPayload = await usersResponse.json();
      if (!usersResponse.ok) throw new Error(usersPayload.error || "AdministrationUnavailable");
      let events = [];
      if (usersPayload.permissions?.["audit.read"]) {
        const auditResponse = await fetch("/api/admin/audit", { credentials: "same-origin", cache: "no-store" });
        if (auditResponse.ok) events = (await auditResponse.json()).events || [];
      }
      adminState = {
        ...adminState,
        status: "ready",
        users: usersPayload.users || [],
        total: Number(usersPayload.total) || 0,
        permissions: usersPayload.permissions || {},
        role: usersPayload.role || currentUser.role || "administrator",
        events,
        readiness,
        error: "",
      };
    } catch (error) {
      adminState = { ...adminState, status: "error", readiness, error: error.message, users: [], events: [] };
    }
    if (currentRoute() === "admin") render();
  }

  function adminDate(value) {
    if (!value) return "Nunca";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data inválida" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function renderAdminUserRows() {
    const rank = { user: 0, support: 1, moderator: 2, administrator: 3, owner: 4 };
    return adminState.users.map((user) => {
      const banned = user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now();
      const manageable = (rank[adminState.role] || 0) > (rank[user.role] || 0);
      const target = escapeHtml(user.sub);
      return `<tr>
        <td><strong>${escapeHtml(user.name || user.email)}</strong><small>${escapeHtml(user.email)}</small></td>
        <td><span class="admin-role role-${escapeHtml(user.role)}">${escapeHtml(user.role)}</span></td>
        <td><strong>${Number(user.purchasedEnergy || 0).toLocaleString("pt-BR")}</strong><small>${user.plusActive ? "Plus ativo" : "Plano comum"}</small></td>
        <td><span class="admin-status ${banned ? "banned" : "active"}">${banned ? "Banido" : "Ativo"}</span><small>${banned ? `até ${adminDate(user.bannedUntil)}` : adminDate(user.lastLoginAt)}</small></td>
        <td><details class="admin-user-actions"><summary class="icon-button" title="Ações do usuário" aria-label="Ações do usuário">${icon("ellipsis")}</summary><div>
          ${adminState.permissions["users.revoke"] && manageable ? `<button class="button" type="button" data-admin-quick-action="revoke_sessions" data-admin-target="${target}">${icon("log-out")} Expulsar sessões</button>` : ""}
          ${adminState.permissions["users.ban"] && manageable ? (banned ? `<button class="button" type="button" data-admin-quick-action="unban" data-admin-target="${target}">${icon("shield-check")} Remover ban</button>` : `<form data-admin-user-form="ban" data-admin-target="${target}"><label>Motivo<input name="reason" minlength="3" maxlength="300" required></label><label>Horas<input name="durationHours" type="number" min="1" max="87600" value="24" required></label><button class="button danger-button" type="submit">${icon("ban")} Banir</button></form>`) : ""}
          ${adminState.permissions["energy.adjust"] ? `<form data-admin-user-form="adjust_energy" data-admin-target="${target}"><label>Ajuste de energia<input name="delta" type="number" min="-1000000" max="1000000" step="1" placeholder="50 ou -20" required></label><button class="button" type="submit">${icon("box")} Aplicar no ledger</button></form>` : ""}
          ${adminState.permissions["roles.manage"] && manageable ? `<form data-admin-user-form="set_role" data-admin-target="${target}"><label>Cargo<select name="role">${["user","support","moderator","administrator","owner"].map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>`).join("")}</select></label><button class="button" type="submit">${icon("shield-ellipsis")} Alterar cargo</button></form>` : ""}
          ${manageable ? "" : "<p>Hierarquia protegida: esta conta não pode ser manipulada pelo seu cargo.</p>"}
        </div></details></td>
      </tr>`;
    }).join("");
  }

  function renderReadinessReport() {
    const report = adminState.readiness;
    if (!report) return "";
    return `<section class="content-section readiness-panel"><div class="section-heading"><div><div class="eyebrow">Pré-lançamento</div><h2>Prontidão da Academy</h2></div><span class="readiness-score ${report.launchReady ? "ready" : "blocked"}">${report.automaticReady}/${report.automaticTotal} automáticos</span></div><div class="readiness-sections">${report.sections.map((section) => `<article><header><span>${icon(section.ready ? "circle-check-big" : "circle-dashed")}</span><div><strong>${escapeHtml(section.label)}</strong><small>${section.ready ? "Configuração automática completa" : "Ainda existem bloqueios"}</small></div></header><ul>${section.checks.map((item) => `<li class="${item.ready ? "ready" : item.kind === "manual" ? "manual" : "blocked"}">${icon(item.ready ? "check" : item.kind === "manual" ? "clipboard-check" : "x")}<div><strong>${escapeHtml(item.label)}</strong><span>${item.ready ? "Confirmado pelo servidor" : escapeHtml(item.action)}</span></div></li>`).join("")}</ul></article>`).join("")}</div></section>`;
  }

  function renderAdmin() {
    if (!currentUser?.isAdmin) {
      content.innerHTML = `<section class="access-denied">${icon("shield-x")}<h1>Acesso administrativo restrito</h1><p>Sua sessão não possui um cargo administrativo válido.</p><button class="button" type="button" data-route="overview">Voltar</button></section>`;
      return;
    }
    if (adminState.status === "idle") queueMicrotask(() => loadAdminState());
    const completed = systems.filter((system) => progress.systems[system.id]).length;
    const ready = adminState.status === "ready";
    content.innerHTML = `
      <header class="page-header"><div><div class="eyebrow">${icon("shield-ellipsis")} Operação privada</div><h1>Administração</h1><p class="lead">Usuários, sessões, cargos, energia e eventos auditáveis validados no servidor.</p></div><div class="header-actions"><span class="admin-role role-${escapeHtml(adminState.role || currentUser.role || "administrator")}">${escapeHtml(adminState.role || currentUser.role || "administrator")}</span><button class="button" type="button" data-admin-refresh>${icon("refresh-cw")} Atualizar</button></div></header>
      <section class="admin-grid"><article><span>Usuários registrados</span><strong>${ready ? adminState.total : "..."}</strong><p>Contas conhecidas pelo login</p></article><article><span>Conta administrativa</span><strong>${escapeHtml(currentUser.email)}</strong><p>Sessão assinada e cargo verificado ao vivo</p></article><article><span>Persistência</span><strong>${syncStatus === "synced" || ready ? "PostgreSQL ativo" : "Verificando"}</strong><p>${completed} aulas concluídas nesta conta</p></article></section>
      ${renderReadinessReport()}
      ${adminState.status === "error" ? `<section class="admin-error">${icon("database-zap")}<div><strong>Painel indisponível</strong><p>Configure <code>DATABASE_URL</code> para habilitar usuários, auditoria e ações administrativas.</p></div></section>` : `<section class="admin-console content-section"><div class="section-heading"><div><div class="eyebrow">Diretório</div><h2>Usuários do servidor</h2></div><form data-admin-search><input name="query" type="search" maxlength="80" value="${escapeHtml(adminState.query)}" placeholder="Buscar nome ou e-mail"><button class="icon-button" aria-label="Buscar" title="Buscar">${icon("search")}</button></form></div><div class="admin-table-wrap"><table class="admin-users-table"><thead><tr><th>Usuário</th><th>Cargo</th><th>Energia</th><th>Status</th><th>Ações</th></tr></thead><tbody>${ready ? renderAdminUserRows() : `<tr><td colspan="5"><div class="admin-loading">Carregando diretório seguro...</div></td></tr>`}</tbody></table></div></section>`}
      ${adminState.permissions["audit.read"] ? `<section class="admin-audit content-section"><div class="section-heading"><div><div class="eyebrow">Auditoria</div><h2>Últimas operações</h2></div><p>Ações administrativas não aparecem para usuários comuns.</p></div><div class="admin-audit-list">${adminState.events.length ? adminState.events.map((event) => `<article><span>${icon(event.action === "ban" ? "ban" : event.action === "adjust_energy" ? "box" : "shield-check")}</span><div><strong>${escapeHtml(event.action)}</strong><small>${escapeHtml(event.actorEmail)} · alvo ${escapeHtml(event.targetSub || "sistema")}</small></div><time>${adminDate(event.createdAt)}</time></article>`).join("") : '<div class="empty-state">Nenhuma operação administrativa registrada.</div>'}</div></section>` : ""}
      <section class="content-section"><div class="section-heading"><div><div class="eyebrow">Portabilidade pessoal</div><h2>Backup do seu perfil</h2></div></div><div class="admin-actions"><button class="button primary" type="button" data-export-profile>${icon("download")} Exportar backup</button><button class="button" type="button" data-import-profile>${icon("upload")} Importar backup</button><button class="button" type="button" data-sync-now>${icon("cloud-upload")} Sincronizar agora</button></div></section>`;
  }

  function render() {
    const route = currentRoute();
    if (route !== "store/success") purchaseRefreshAttempts = 0;
    if (route !== "tutor" && tutorAudioRecorder?.state === "recording") {
      stopTutorAudioRecording(true);
    }
    if (route === "overview") {
      renderOverview();
    } else if (route === "journey") {
      renderJourney();
    } else if (route === "areas") {
      renderAreas();
    } else if (route.startsWith("areas/session/")) {
      const [, , areaId, systemId] = route.split("/");
      renderAreaSession(areaId, systemId);
    } else if (route === "tracks") {
      renderTracks();
    } else if (route === "lab" || route.startsWith("lab/")) {
      renderLab(route.split("/")[1]);
    } else if (route === "tutor") {
      renderTutor();
    } else if (route === "compiler") {
      renderCompiler();
    } else if (route === "themes") {
      renderThemeStudio();
    } else if (route === "ui-visualizer") {
      renderUiVisualizer();
    } else if (route === "store" || route.startsWith("store/")) {
      renderStore(route === "store/success");
    } else if (route === "community") {
      renderCommunity();
    } else if (route === "settings") {
      renderSettings();
    } else if (route === "admin") {
      renderAdmin();
    } else if (route === "roadmap") {
      renderRoadmap();
    } else if (route === "methods" || route.startsWith("methods/")) {
      renderMethodsLibrary(route.split("/")[1]);
    } else if (route === "workspace" || route.startsWith("workspace/")) {
      renderWorkspace(route.split("/")[1]);
    } else if (conceptGuides[route]) {
      renderConceptGuide(conceptGuides[route]);
    } else if (route.startsWith("system/")) {
      const system = getSystem(route.split("/")[1]);
      if (system) {
        renderSystemDetail(system);
      } else {
        routeTo("overview");
        return;
      }
    } else {
      routeTo("overview");
      return;
    }

    updateActiveNav();
    refreshIcons();
    window.scrollTo({ top: 0, behavior: "auto" });
    setupScrollReveals();
    setupAdvancedAnimations();
    setupSpoilers();
    closeSidebar();

    if (route.startsWith("system/")) {
      const systemId = route.split("/")[1];
      progress.lastRoute = route;
      progress.recents = [systemId, ...progress.recents.filter((id) => id !== systemId)].slice(0, 8);
      persistProgressLocally();
    }
  }

  function searchableText(system) {
    return [
      system.name,
      system.label,
      system.role,
      system.question,
      system.truth,
      ...system.dependencies,
      ...system.dependents,
      ...system.configKeys,
      ...system.methods.flat(),
      ...system.mentalModel,
      ...system.invariants,
      ...system.tests,
      ...(system.course ? [
        system.course.what,
        system.course.why,
        system.course.diagram,
        ...system.course.internals,
        system.course.boundary,
        system.course.exercise,
        ...system.course.questions,
        ...system.course.summary
      ] : [])
    ].join(" ").toLocaleLowerCase("pt-BR");
  }

  function searchableConceptText(guide) {
    const lab = practicalLabs[guide.route];
    return [
      guide.title,
      guide.subtitle,
      guide.eyebrow,
      guide.callout,
      ...guide.metrics.flat(),
      ...guide.mentalModel.flat(),
      ...guide.learningSteps.flat(),
      ...guide.apiRows.flat(),
      ...guide.examples.map((example) => `${example.title} ${example.code}`),
      ...(guide.aiLayers ? guide.aiLayers.flat() : []),
      ...(guide.aiPatterns ? guide.aiPatterns.flat() : []),
      ...(guide.enemyBlueprints ? guide.enemyBlueprints.flat() : []),
      ...(guide.classConcepts ? guide.classConcepts.flatMap((concept) => Object.values(concept)) : []),
      ...guide.mistakes.flat(),
      ...guide.systems.flat(),
      ...(lab ? [lab.title, lab.goal, ...lab.architecture, ...lab.steps.flat(), lab.code, lab.test] : [])
    ].join(" ").toLocaleLowerCase("pt-BR");
  }

  function searchableMethodText(method) {
    return [method.name, method.category, method.signature, method.definition, method.use, method.avoid, method.returns, method.example, ...method.related].join(" ").toLocaleLowerCase("pt-BR");
  }

  function updateSearch() {
    const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
    searchClear.hidden = query.length === 0;
    if (!query) {
      searchResults.hidden = true;
      return;
    }

    const filters = {};
    const textQuery = query.replace(/(risco|nivel|nível|fase|tipo):([^\s]+)/g, (_match, key, value) => {
      filters[key.normalize("NFD").replace(/[\u0300-\u036f]/g, "")] = value;
      return "";
    }).trim();
    const systemMatches = systems.filter((system) => {
      if (filters.risco && system.risk.toLocaleLowerCase("pt-BR") !== filters.risco) return false;
      if (filters.nivel && (system.tier || "").toLocaleLowerCase("pt-BR") !== filters.nivel) return false;
      if (filters.fase && String(system.phase) !== filters.fase) return false;
      if (filters.tipo && system.category.toLocaleLowerCase("pt-BR").replaceAll(" ", "-") !== filters.tipo.replaceAll(" ", "-")) return false;
      return !textQuery || searchableText(system).includes(textQuery);
    }).slice(0, 24);
    const conceptMatches = textQuery ? Object.values(conceptGuides).filter((guide) => searchableConceptText(guide).includes(textQuery)) : [];
    const methodMatches = textQuery ? methodCatalog.filter((method) => searchableMethodText(method).includes(textQuery)).slice(0, 12) : [];
    const snippetMatches = textQuery ? workState.snippets.filter((snippet) => [snippet.title, snippet.code, ...snippet.tags].join(" ").toLocaleLowerCase("pt-BR").includes(textQuery)).slice(0, 6) : [];

    searchResults.innerHTML = systemMatches.length || conceptMatches.length || methodMatches.length || snippetMatches.length ? `
      ${conceptMatches.map((guide) => `
        <button class="search-result" type="button" data-route="${guide.route}">
          <span class="search-result-icon">${icon(guide.icon)}</span>
          <span><strong>${guide.title}</strong><span>${guide.subtitle}</span></span>
        </button>
      `).join("")}
      ${methodMatches.map((method) => `
        <button class="search-result" type="button" data-route="methods/${method.id}">
          <span class="search-result-icon">${icon("braces")}</span>
          <span><strong>${method.name}</strong><span>${method.signature}</span></span>
        </button>
      `).join("")}
      ${snippetMatches.map((snippet) => `
        <button class="search-result" type="button" data-route="workspace/snippets">
          <span class="search-result-icon">${icon("code-2")}</span>
          <span><strong>${escapeHtml(snippet.title)}</strong><span>Snippet local · ${snippet.tags.map(escapeHtml).join(", ")}</span></span>
        </button>
      `).join("")}
      ${systemMatches.map((system) => `
      <button class="search-result" type="button" data-route="system/${system.id}">
        <span class="search-result-icon">${icon(system.icon)}</span>
        <span><strong>${system.name}</strong><span>${system.role}</span></span>
      </button>
      `).join("")}
    ` : '<div class="empty-search">Nenhum conteúdo encontrado.</div>';
    searchResults.hidden = false;
    refreshIcons();
  }

  function copyCode(systemId) {
    const system = getSystem(systemId);
    if (!system) return;

    const fallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = system.example;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("Exemplo copiado.");
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(system.example).then(() => showToast("Exemplo copiado.")).catch(fallback);
    } else {
      fallback();
    }
  }

  function getSnippet(snippetId) {
    const [route, type, value] = snippetId.split(":");
    const guide = conceptGuides[route];
    const lab = practicalLabs[route];
    if (type === "example" && guide) return guide.examples[Number(value)]?.code;
    if (type === "class" && guide) return guide.classConcepts?.[Number(value)]?.code;
    if (type === "lab" && lab) return lab[value];
    return null;
  }

  function copyText(value) {
    if (!value) return;
    const fallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("Código copiado.");
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(() => showToast("Código copiado.")).catch(fallback);
    } else {
      fallback();
    }
  }

  function readAuthHandoff() {
    try {
      const handoff = JSON.parse(sessionStorage.getItem(AUTH_HANDOFF_KEY) || "null");
      if (!handoff?.user || Date.now() - Number(handoff.createdAt || 0) > 60_000) {
        sessionStorage.removeItem(AUTH_HANDOFF_KEY);
        return null;
      }
      return handoff.user;
    } catch {
      try {
        sessionStorage.removeItem(AUTH_HANDOFF_KEY);
      } catch {
        // Private browsing can block session storage entirely.
      }
      return null;
    }
  }

  function clearAuthHandoff() {
    try {
      sessionStorage.removeItem(AUTH_HANDOFF_KEY);
    } catch {
      // The session cookie still controls authentication.
    }
  }

  function activateUserAccount(user) {
    if (!user?.sub || activeAccountId === user.sub) return false;
    activeAccountId = user.sub;
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, activeAccountId);
    progress = loadProgress();
    workState = loadWorkState();
    return true;
  }

  function displayAuthUser(user, trusted = false) {
    if (!user) return;
    const authUser = document.getElementById("auth-user");
    const avatar = document.getElementById("auth-user-avatar");
    const avatarFallback = document.getElementById("auth-user-avatar-fallback");
    document.getElementById("auth-user-name").textContent = user.name || user.email;
    document.getElementById("auth-user-email").textContent = user.email || "";

    if (user.picture) {
      avatar.src = user.picture;
      avatar.hidden = false;
      avatarFallback.hidden = true;
    } else {
      avatar.removeAttribute("src");
      avatar.hidden = true;
      avatarFallback.hidden = false;
    }

    authUser.hidden = false;
    document.getElementById("admin-nav").hidden = !(trusted && user.isAdmin);
    refreshIcons();
  }

  async function fetchAuthSession() {
    let lastResponse = null;
    let lastError = null;
    for (const delayMs of [0, 400, 1200]) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        lastResponse = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store"
        });
        if (lastResponse.status < 500) return lastResponse;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastResponse) return lastResponse;
    throw lastError || new Error("Authentication session request failed.");
  }

  async function initializeAuthControls() {
    if (window.location.protocol === "file:") return true;

    const handoffUser = readAuthHandoff();
    if (handoffUser) {
      activateUserAccount(handoffUser);
      displayAuthUser(handoffUser, false);
    }

    try {
      const response = await fetchAuthSession();
      if (response.status === 401) {
        clearAuthHandoff();
        localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
        window.location.replace("/login");
        return false;
      }
      if (!response.ok) {
        if (!handoffUser) document.getElementById("auth-user").hidden = true;
        return true;
      }

      const payload = await response.json();
      const user = payload.user;
      if (!user) return true;
      currentUser = user;
      clearAuthHandoff();
      activateUserAccount(user);
      displayAuthUser(user, true);
      return true;
    } catch (_error) {
      if (!handoffUser) document.getElementById("auth-user").hidden = true;
      return true;
    }
  }

  function startAmbientPointer() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let targetX = window.innerWidth * 0.68;
    let targetY = window.innerHeight * 0.28;
    let currentX = targetX;
    let currentY = targetY;

    window.addEventListener("pointermove", (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
    }, { passive: true });

    const tick = () => {
      currentX += (targetX - currentX) * 0.075;
      currentY += (targetY - currentY) * 0.075;
      document.documentElement.style.setProperty("--pointer-x", `${currentX}px`);
      document.documentElement.style.setProperty("--pointer-y", `${currentY}px`);
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  function setupScrollReveals() {
    if (scrollRevealObserver) {
      scrollRevealObserver.disconnect();
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealTargets = [...content.querySelectorAll([
      ".section-heading",
      ".thinking-callout",
      ".fact-panel",
      ".metric-card",
      ".system-card",
      ".concept-card",
      ".lesson-card",
      ".principle-card",
      ".risk-card",
      ".test-card",
      ".course-block",
      ".course-subsection",
      ".runtime-lanes article",
      ".state-snapshot",
      ".decision-panel",
      ".roadmap-phase",
      ".implementation-step",
      ".pipeline-node",
      ".method-reference",
      ".work-panel",
      ".work-record",
      ".snippet-record",
      ".idea-list article",
      ".ai-layer-card",
      ".class-concept",
      ".related-learning-grid button",
      ".next-step-panel"
    ].join(","))];

    const framedSections = [...content.querySelectorAll(".content-section")]
      .filter((_, index) => index % 3 === 1);

    framedSections.forEach((section, index) => {
      section.classList.add("has-3d-frame", index % 2 === 0 ? "frame-right" : "frame-left");
      const frame = document.createElement("div");
      frame.className = "scroll-frame-3d";
      frame.setAttribute("aria-hidden", "true");
      frame.innerHTML = "<span></span><span></span><span></span>";
      section.prepend(frame);
    });

    revealTargets.forEach((element, index) => {
      element.classList.add("scroll-reveal");
      element.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 55}ms`);
      if (reducedMotion) element.classList.add("is-visible");
    });

    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealTargets.forEach((element) => element.classList.add("is-visible"));
      framedSections.forEach((section) => section.classList.add("is-visible"));
      return;
    }

    scrollRevealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0,
      rootMargin: "0px 0px -8% 0px"
    });

    revealTargets.forEach((element) => scrollRevealObserver.observe(element));
    framedSections.forEach((section) => scrollRevealObserver.observe(section));
  }

  // Prepara apenas os elementos recriados a cada troca de rota.
  function setupAdvancedAnimations() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (!reducedMotion) {
      content.querySelectorAll("h1").forEach((heading) => {
        const text = heading.textContent.trim();
        heading.classList.add("word-reveal");
        heading.setAttribute("aria-label", text);
        heading.innerHTML = text.split(/\s+/).map((word, index) =>
          `<span aria-hidden="true" style="--word-index:${index}">${escapeHtml(word)}</span>`
        ).join(" ");
      });
    }

    if (finePointer && !reducedMotion) {
      content.querySelectorAll([
        ".metric-card",
        ".system-card",
        ".concept-card",
        ".lesson-card",
        ".risk-card",
        ".test-card"
      ].join(",")).forEach((card) => card.classList.add("tilt-card"));
    }

    scheduleScrollEffects();
  }

  // Atualiza progresso e parallax uma vez por frame, mesmo durante scroll rápido.
  function scheduleScrollEffects() {
    if (scrollAnimationFrame) return;
    scrollAnimationFrame = requestAnimationFrame(() => {
      scrollAnimationFrame = null;
      const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progressValue = Math.min(Math.max(window.scrollY / scrollable, 0), 1);
      document.documentElement.style.setProperty("--scroll-progress", progressValue);

      const banner = content.querySelector(".visual-banner img");
      if (banner && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const rect = banner.getBoundingClientRect();
        if (rect.bottom > -120 && rect.top < window.innerHeight + 120) {
          const centerOffset = rect.top + rect.height / 2 - window.innerHeight / 2;
          const parallaxY = Math.max(-8, Math.min(8, centerOffset * -0.02));
          banner.style.setProperty("--parallax-y", `${parallaxY}px`);
        }
      }
    });
  }

  // Glow de cursor e tilt usam variáveis CSS para manter a renderização na GPU.
  function updatePointerEffects(event) {
    latestPointerEvent = event;
    if (pointerAnimationFrame) return;

    pointerAnimationFrame = requestAnimationFrame(() => {
      pointerAnimationFrame = null;
      applyPointerEffects(latestPointerEvent);
    });
  }

  function applyPointerEffects(event) {
    if (!(event?.target instanceof Element)) return;
    const interactive = event.target.closest(".button, .icon-button, .nav-item, .text-button, .architecture-node");
    if (interactive) {
      const rect = interactive.getBoundingClientRect();
      interactive.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
      interactive.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
    }

    const card = event.target.closest(".tilt-card");
    if (!card || !card.classList.contains("is-visible")) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty("--tilt-x", `${y * -5}deg`);
    card.style.setProperty("--tilt-y", `${x * 6}deg`);
  }

  function resetPointerTilt(event) {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest(".tilt-card");
    if (!card || card.contains(event.relatedTarget)) return;
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
  }

  // Ripple é criado somente no elemento acionado e removido após a animação.
  function createRipple(event) {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest(".button, .icon-button, .nav-item, .text-button, .architecture-node");
    if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    target.querySelector(":scope > .interaction-ripple")?.remove();
    const ripple = document.createElement("span");
    ripple.className = "interaction-ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    const cleanupTimer = window.setTimeout(() => ripple.remove(), 700);
    ripple.addEventListener("animationend", () => {
      window.clearTimeout(cleanupTimer);
      ripple.remove();
    }, { once: true });
    target.appendChild(ripple);
  }

  function handleWorkspaceForm(form) {
    const data = new FormData(form);
    const formType = form.dataset.workForm;

    if (formType === "task") {
      workState.tasks.push({ id: createLocalId("task"), title: String(data.get("title") || "").trim(), done: false });
    } else if (formType === "plan") {
      workState.plans.unshift({
        id: createLocalId("plan"),
        name: String(data.get("name") || "").trim(),
        objective: String(data.get("objective") || "").trim(),
        responsibilities: String(data.get("responsibilities") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        dependencies: String(data.get("dependencies") || "").split(",").map((item) => item.trim()).filter(Boolean)
      });
    } else if (formType === "snippet") {
      workState.snippets.unshift({
        id: createLocalId("snippet"),
        title: String(data.get("title") || "").trim(),
        tags: String(data.get("tags") || "").split(",").map((item) => item.trim()).filter(Boolean),
        code: String(data.get("code") || "").trim()
      });
    } else if (formType === "bug") {
      workState.bugs.unshift({
        id: createLocalId("bug"),
        problem: String(data.get("problem") || "").trim(),
        cause: String(data.get("cause") || "").trim(),
        attempt: String(data.get("attempt") || "").trim(),
        solution: String(data.get("solution") || "").trim()
      });
    } else if (formType === "idea") {
      workState.ideas.unshift({
        id: createLocalId("idea"),
        category: String(data.get("category") || "Sistema"),
        text: String(data.get("text") || "").trim()
      });
    } else {
      return;
    }

    saveWorkState(true);
    showToast("Local de Trabalho atualizado.");
  }

  function removeWorkRecord(collectionName, recordId) {
    workState[collectionName] = workState[collectionName].filter((item) => item.id !== recordId);
    saveWorkState(true);
    showToast("Registro removido.");
  }

  function setTutorAudioStatus(message) {
    const status = document.getElementById("tutor-audio-status");
    if (status) status.textContent = message;
  }

  function stopTutorAudioTracks() {
    tutorAudioStream?.getTracks().forEach((track) => track.stop());
    tutorAudioStream = null;
  }

  async function uploadTutorAudio(blob, durationMs) {
    let pendingAudioId = "";
    try {
      if (blob.size > tutorAudioConfig.maxBytes) throw new Error("AudioTooLarge");
      setTutorAudioStatus("Preparando envio seguro...");
      const requestResponse = await fetch("/api/tutor/audio/upload-url", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: blob.type, sizeBytes: blob.size, durationMs }),
      });
      const requestPayload = await requestResponse.json();
      if (!requestResponse.ok || !requestPayload.uploadUrl) {
        if (requestResponse.status === 429) throw new Error("DailyAudioLimit");
        if (requestResponse.status === 413) throw new Error("AudioTooLarge");
        throw new Error(requestPayload.error || "UploadUrlUnavailable");
      }
      pendingAudioId = requestPayload.audioId;
      setTutorAudioStatus("Enviando áudio por conexão segura para o bucket privado...");
      const uploadResponse = await fetch(requestPayload.uploadUrl, {
        method: "PUT",
        mode: "cors",
        headers: { "Content-Type": requestPayload.contentType },
        body: blob,
      });
      if (!uploadResponse.ok) throw new Error("R2UploadRejected");
      const finalizeResponse = await fetch("/api/tutor/audio/finalize", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioId: pendingAudioId }),
      });
      const finalizePayload = await finalizeResponse.json();
      if (!finalizeResponse.ok || !finalizePayload.audio) throw new Error(finalizePayload.error || "AudioFinalizeRejected");
      progress.tutorMessages.push(
        { role: "user", text: "", audioId: pendingAudioId, durationMs },
        { role: "assistant", text: "Áudio armazenado com segurança. A transcrição automática ainda não está conectada." }
      );
      progress.tutorMessages = progress.tutorMessages.slice(commerceAccount.plusActive ? -40 : -16);
      saveProgress();
      render();
      showToast("Mensagem de áudio enviada.");
    } catch (error) {
      if (pendingAudioId) {
        fetch(`/api/tutor/audio/${encodeURIComponent(pendingAudioId)}`, {
          method: "DELETE",
          credentials: "same-origin",
        }).catch(() => {});
      }
      const messages = {
        AudioTooLarge: "O áudio ultrapassou o limite desta conta.",
        DailyAudioLimit: "Você atingiu o limite diário de mensagens de áudio.",
        R2UploadRejected: "O bucket recusou o envio. Confira o CORS do R2.",
      };
      setTutorAudioStatus(messages[error.message] || "Não foi possível armazenar este áudio.");
      showToast(messages[error.message] || "Falha ao enviar áudio.");
    }
  }

  function stopTutorAudioRecording(discard = false) {
    if (!tutorAudioRecorder || tutorAudioRecorder.state === "inactive") return;
    discardTutorAudio = discard;
    tutorAudioRecorder.stop();
  }

  async function startTutorAudioRecording(button) {
    if (tutorAudioRecorder?.state === "recording") {
      stopTutorAudioRecording(false);
      return;
    }
    if (!tutorAudioConfig.available || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showToast("Gravação de áudio não está disponível neste navegador.");
      return;
    }
    try {
      tutorAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
      tutorAudioRecorder = mimeType
        ? new MediaRecorder(tutorAudioStream, { mimeType, audioBitsPerSecond: 32_000 })
        : new MediaRecorder(tutorAudioStream, { audioBitsPerSecond: 32_000 });
      tutorAudioChunks = [];
      tutorAudioStartedAt = performance.now();
      discardTutorAudio = false;
      tutorAudioRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) tutorAudioChunks.push(event.data);
      });
      tutorAudioRecorder.addEventListener("stop", () => {
        const durationMs = Math.min(tutorAudioConfig.maxDurationMs, Math.max(250, Math.round(performance.now() - tutorAudioStartedAt)));
        const recordedType = tutorAudioRecorder?.mimeType || mimeType || "audio/webm";
        const chunks = tutorAudioChunks;
        const discarded = discardTutorAudio;
        clearTimeout(tutorAudioStopTimer);
        tutorAudioStopTimer = null;
        tutorAudioRecorder = null;
        tutorAudioChunks = [];
        stopTutorAudioTracks();
        if (discarded || chunks.length === 0) return;
        uploadTutorAudio(new Blob(chunks, { type: recordedType }), durationMs);
      }, { once: true });
      tutorAudioRecorder.start(250);
      button.classList.add("recording");
      button.innerHTML = icon("square");
      button.setAttribute("aria-label", "Parar gravação");
      button.title = "Parar gravação";
      setTutorAudioStatus(`Gravando. Limite de ${Math.round(tutorAudioConfig.maxDurationMs / 1000)} segundos.`);
      tutorAudioStopTimer = setTimeout(() => stopTutorAudioRecording(false), tutorAudioConfig.maxDurationMs);
      refreshIcons();
    } catch (_error) {
      stopTutorAudioTracks();
      showToast("Permita o acesso ao microfone para gravar.");
      setTutorAudioStatus("O navegador não liberou o microfone.");
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const themeButton = document.getElementById("theme-button");
    themeButton.innerHTML = icon(theme === "dark" ? "sun" : "moon");
    themeButton.setAttribute("aria-label", theme === "dark" ? "Usar tema claro" : "Usar tema escuro");
    themeButton.title = themeButton.getAttribute("aria-label");
    refreshIcons();
  }

  async function runAdminAction(targetSub, action, fields = {}) {
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(targetSub)}/actions`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...fields }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AdminActionRejected");
      showToast("Operação administrativa registrada na auditoria.");
      await loadAdminState(true);
    } catch (error) {
      const messages = {
        Forbidden: "Seu cargo não pode executar esta operação.",
        BanReasonRequired: "Informe um motivo de banimento.",
        insufficient_energy: "A conta não possui energia suficiente para esse débito.",
        AdministrationUnavailable: "Configure DATABASE_URL para habilitar a administração.",
      };
      showToast(messages[error.message] || "A operação administrativa foi recusada.");
    }
  }

  document.addEventListener("click", (event) => {
    const routeTarget = event.target.closest("[data-route]");
    if (routeTarget) {
      routeTo(routeTarget.dataset.route);
      searchInput.value = "";
      updateSearch();
      return;
    }

    if (event.target.closest("[data-apply-academy-theme], [data-theme-clear-media], [data-use-pexels]")) {
      window.NeonThemeStudio.handleClick(event, extensionContext());
      return;
    }

    if (event.target.closest("[data-ui-load-sample], [data-ui-export]")) {
      window.NeonRobloxUI.handleClick(event, extensionContext());
      return;
    }

    if (event.target.closest("[data-admin-refresh]")) {
      loadAdminState(true);
      return;
    }

    if (event.target.closest("[data-compiler-fullscreen]")) {
      const shell = document.getElementById("compiler-shell");
      if (!document.fullscreenElement) shell?.requestFullscreen?.().catch(() => showToast("Este navegador recusou a tela cheia."));
      else document.exitFullscreen?.();
      return;
    }

    const adminQuickAction = event.target.closest("[data-admin-quick-action]");
    if (adminQuickAction) {
      adminQuickAction.disabled = true;
      runAdminAction(adminQuickAction.dataset.adminTarget, adminQuickAction.dataset.adminQuickAction);
      return;
    }

    const startSessionTarget = event.target.closest("[data-start-session]");
    if (startSessionTarget) {
      const [areaId, systemId] = startSessionTarget.dataset.startSession.split(":");
      if (beginAreaSession(areaId, systemId)) routeTo(`areas/session/${areaId}/${systemId}`);
      return;
    }

    const lockedSessionTarget = event.target.closest("[data-locked-session]");
    if (lockedSessionTarget) {
      showToast(lockedSessionTarget.dataset.lockedSession);
      return;
    }

    const answerTarget = event.target.closest("[data-answer-index]");
    if (answerTarget) {
      answerAreaQuestion(Number(answerTarget.dataset.answerIndex), answerTarget);
      return;
    }

    if (event.target.closest("[data-next-question]")) {
      if (!activeQuiz) return;
      if (activeQuiz.index >= 4) {
        finishAreaSession();
      } else {
        activeQuiz.index += 1;
        activeQuiz.answered = false;
        activeQuiz.selected = "";
        renderAreaSession(activeQuiz.areaId, activeQuiz.systemId);
      }
      return;
    }

    if (event.target.closest("[data-quit-session]")) {
      activeQuiz = null;
      routeTo("areas");
      return;
    }

    const retryTarget = event.target.closest("[data-retry-session]");
    if (retryTarget) {
      const [areaId, systemId] = retryTarget.dataset.retrySession.split(":");
      beginAreaSession(areaId, systemId);
      renderAreaSession(areaId, systemId);
      return;
    }

    const spoilerTarget = event.target.closest("[data-spoiler-code]");
    if (spoilerTarget) {
      spoilerTarget.classList.toggle("revealed");
      spoilerTarget.setAttribute("aria-pressed", String(spoilerTarget.classList.contains("revealed")));
      return;
    }

    const buyTarget = event.target.closest("[data-buy-product]");
    if (buyTarget) {
      buyTarget.disabled = true;
      buyTarget.textContent = "Abrindo checkout...";
      fetch("/api/commerce/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: buyTarget.dataset.buyProduct,
          requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        }),
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || "CheckoutUnavailable");
        window.location.assign(payload.checkoutUrl);
      }).catch((error) => {
        const messages = {
          StripePriceMismatch: "O preço no Stripe não corresponde ao catálogo da Academy.",
          CheckoutRateLimit: "Muitas tentativas de checkout. Aguarde alguns minutos.",
          CheckoutUnavailable: "Checkout ainda não está configurado no servidor.",
        };
        showToast(messages[error.message] || "Não foi possível abrir o checkout agora.");
        render();
      });
      return;
    }

    const billingTarget = event.target.closest("[data-manage-billing]");
    if (billingTarget) {
      billingTarget.disabled = true;
      fetch("/api/commerce/portal", { method: "POST", credentials: "same-origin" })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !payload.portalUrl) throw new Error(payload.error || "BillingPortalUnavailable");
          window.location.assign(payload.portalUrl);
        })
        .catch(() => {
          showToast("O portal de assinatura ainda não está disponível.");
          render();
        });
      return;
    }

    if (event.target.closest("[data-rebirth-open]")) {
      const dialog = document.getElementById("rebirth-dialog");
      document.getElementById("rebirth-understood").checked = false;
      document.getElementById("rebirth-confirm").disabled = true;
      dialog.showModal();
      refreshIcons();
      return;
    }

    if (event.target.closest("#rebirth-confirm")) {
      const completedKeys = Object.keys(progress.game.completedSessions).sort();
      const removedKeys = completedKeys.filter((_key, index) => index % 2 === 1);
      for (const key of removedKeys) {
        delete progress.game.completedSessions[key];
        const systemId = key.split(":")[1];
        if (systemId) progress.systems[systemId] = false;
      }
      progress.game.xp = Math.floor(progress.game.xp * 0.5);
      progress.game.prestige = Math.min(3, progress.game.prestige + 1);
      progress.game.earnedEnergy += 20 * getRewardMultiplier();
      saveProgress();
      render();
      window.NeonEffects?.burst(document.querySelector(".game-level-orb"), "level");
      showToast(`Renascimento ${progress.game.prestige}: recompensas agora valem ${getRewardMultiplier()}x.`);
      return;
    }

    const favoriteTarget = event.target.closest("[data-favorite]");
    if (favoriteTarget) {
      const systemId = favoriteTarget.dataset.favorite;
      progress.favorites[systemId] = !progress.favorites[systemId];
      saveProgress();
      render();
      showToast(progress.favorites[systemId] ? "Adicionado aos favoritos." : "Removido dos favoritos.");
      return;
    }

    if (event.target.closest("[data-export-profile]")) {
      const blob = new Blob([JSON.stringify(buildLearningProfile(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `neon-academy-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Backup exportado.");
      return;
    }

    if (event.target.closest("[data-import-profile]")) {
      document.getElementById("profile-import").click();
      return;
    }

    if (event.target.closest("[data-sync-now]")) {
      syncStatus = syncStatus === "unavailable" ? "unavailable" : "saving";
      pushLearningProfile().then(() => {
        render();
        showToast(syncStatus === "synced" ? "Perfil sincronizado." : "Cópia local preservada.");
      });
      return;
    }

    const labResetTarget = event.target.closest("[data-lab-reset]");
    if (labResetTarget) {
      const system = getSystem(labResetTarget.dataset.labReset);
      progress.labDrafts[system.id] = createLabStarter(system);
      labFeedback = "Rascunho reiniciado.";
      saveProgress();
      render();
      return;
    }

    const labCopyTarget = event.target.closest("[data-copy-lab]");
    if (labCopyTarget) {
      const system = getSystem(labCopyTarget.dataset.copyLab);
      copyText(progress.labDrafts[system.id] || createLabStarter(system));
      return;
    }

    const labCheckTarget = event.target.closest("[data-lab-check]");
    if (labCheckTarget) {
      const system = getSystem(labCheckTarget.dataset.labCheck);
      const draft = progress.labDrafts[system.id] || "";
      const checks = [
        [draft.includes("function"), "função declarada"],
        [draft.includes("player"), "contexto do jogador"],
        [/return\s+[A-Za-z_]/.test(draft), "retorno do módulo"],
        [/valid|assert|type\s*\(/i.test(draft), "validação explícita"]
      ];
      const passed = checks.filter(([ok]) => ok).length;
      labFeedback = `${passed}/4 sinais encontrados: ${checks.filter(([ok]) => ok).map(([, label]) => label).join(", ") || "nenhum ainda"}.`;
      render();
      return;
    }

    const tutorSuggestion = event.target.closest("[data-tutor-suggestion]");
    if (tutorSuggestion) {
      const input = document.getElementById("tutor-question");
      input.value = tutorSuggestion.dataset.tutorSuggestion;
      input.focus();
      return;
    }

    const speakTarget = event.target.closest("[data-speak]");
    if (speakTarget && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speakTarget.dataset.speak);
      utterance.lang = "pt-BR";
      window.speechSynthesis.speak(utterance);
      return;
    }

    const voiceTarget = event.target.closest("[data-voice-input]");
    if (voiceTarget) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        showToast("Reconhecimento de voz não está disponível neste navegador.");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.interimResults = false;
      recognition.onresult = (voiceEvent) => {
        const input = document.getElementById("tutor-question");
        input.value = voiceEvent.results[0][0].transcript;
        input.focus();
      };
      recognition.onerror = () => showToast("Não consegui ouvir. Confira a permissão do microfone.");
      recognition.start();
      showToast("Ouvindo sua pergunta...");
      return;
    }

    const audioRecordTarget = event.target.closest("[data-audio-record]");
    if (audioRecordTarget) {
      startTutorAudioRecording(audioRecordTarget);
      return;
    }

    const audioLoadTarget = event.target.closest("[data-load-audio]");
    if (audioLoadTarget) {
      const audioId = audioLoadTarget.dataset.loadAudio;
      audioLoadTarget.disabled = true;
      audioLoadTarget.textContent = "Carregando...";
      fetch(`/api/tutor/audio/${encodeURIComponent(audioId)}/url`, {
        credentials: "same-origin",
        cache: "no-store",
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.audioUrl) throw new Error("AudioUnavailable");
        const container = audioLoadTarget.closest("[data-audio-container]");
        const player = document.createElement("audio");
        player.controls = true;
        player.preload = "metadata";
        player.src = payload.audioUrl;
        container.replaceChildren(player);
        await player.play().catch(() => {});
      }).catch(() => {
        showToast("Este áudio expirou ou não está disponível.");
        audioLoadTarget.disabled = false;
        audioLoadTarget.innerHTML = `${icon("play")} Tentar novamente`;
        refreshIcons();
      });
      return;
    }

    const audioDeleteTarget = event.target.closest("[data-delete-audio]");
    if (audioDeleteTarget) {
      const audioId = audioDeleteTarget.dataset.deleteAudio;
      audioDeleteTarget.disabled = true;
      fetch(`/api/tutor/audio/${encodeURIComponent(audioId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      }).then(async (response) => {
        if (!response.ok) throw new Error("AudioDeleteRejected");
        progress.tutorMessages = progress.tutorMessages.filter((message) => message.audioId !== audioId);
        saveProgress();
        render();
        showToast("Áudio excluído.");
      }).catch(() => {
        audioDeleteTarget.disabled = false;
        showToast("Não foi possível excluir este áudio.");
      });
      return;
    }

    const copyTarget = event.target.closest("[data-copy-code]");
    if (copyTarget) {
      copyCode(copyTarget.dataset.copyCode);
    }

    const snippetTarget = event.target.closest("[data-copy-snippet]");
    if (snippetTarget) {
      copyText(getSnippet(snippetTarget.dataset.copySnippet));
    }

    const methodTarget = event.target.closest("[data-copy-method]");
    if (methodTarget) {
      const method = methodCatalog.find((item) => item.id === methodTarget.dataset.copyMethod);
      copyText(method?.example);
    }

    const workSnippetTarget = event.target.closest("[data-copy-work-snippet]");
    if (workSnippetTarget) {
      const snippet = workState.snippets.find((item) => item.id === workSnippetTarget.dataset.copyWorkSnippet);
      copyText(snippet?.code);
    }

    const deletionRules = [
      ["[data-delete-task]", "tasks", "deleteTask"],
      ["[data-delete-plan]", "plans", "deletePlan"],
      ["[data-delete-snippet]", "snippets", "deleteSnippet"],
      ["[data-delete-bug]", "bugs", "deleteBug"],
      ["[data-delete-idea]", "ideas", "deleteIdea"]
    ];
    for (const [selector, collectionName, datasetKey] of deletionRules) {
      const target = event.target.closest(selector);
      if (target) {
        removeWorkRecord(collectionName, target.dataset[datasetKey]);
        return;
      }
    }

    if (!event.target.closest(".search-wrap")) {
      searchResults.hidden = true;
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-theme-setting], [data-theme-local-media]")) {
      window.NeonThemeStudio.handleChange(event, extensionContext());
      return;
    }

    if (event.target.matches("[data-ui-mode]")) {
      window.NeonRobloxUI.handleChange(event, extensionContext());
      return;
    }

    const settingKey = event.target.dataset.setting;
    if (settingKey && Object.hasOwn(progress.settings, settingKey)) {
      progress.settings[settingKey] = event.target.checked;
      saveProgress();
      applyVisualSettings();
      return;
    }

    if (event.target.id === "rebirth-understood") {
      document.getElementById("rebirth-confirm").disabled = !event.target.checked;
      return;
    }

    const systemId = event.target.dataset.systemComplete;
    if (systemId) {
      progress.systems[systemId] = event.target.checked;
      saveProgress();
      showToast(event.target.checked ? "Sistema marcado como estudado." : "Sistema removido do progresso.");
      return;
    }

    const stepKey = event.target.dataset.step;
    if (stepKey) {
      progress.steps[stepKey] = event.target.checked;
      saveProgress();
      return;
    }

    const quizSystemId = event.target.dataset.quizSystem;
    if (quizSystemId) {
      progress.quizAnswers[quizSystemId] = event.target.value;
      saveProgress();
      render();
      return;
    }

    if (event.target.matches("[data-lab-system]")) {
      labFeedback = "";
      routeTo(`lab/${event.target.value}`);
      return;
    }

    const taskId = event.target.dataset.workTask;
    if (taskId) {
      const taskItem = workState.tasks.find((item) => item.id === taskId);
      if (taskItem) taskItem.done = event.target.checked;
      saveWorkState(true);
      return;
    }

    const projectSystemId = event.target.dataset.workProjectSystem;
    if (projectSystemId) {
      const projectSystem = workState.project.systems.find((item) => item.id === projectSystemId);
      if (projectSystem) projectSystem.done = event.target.checked;
      saveWorkState(true);
      return;
    }

    if (event.target.matches("[data-work-project-name]")) {
      workState.project.name = event.target.value.trim() || "Projeto sem nome";
      saveWorkState(true);
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "ui-visualizer-code") {
      window.NeonRobloxUI.handleInput(event, extensionContext());
    } else if (event.target.matches("[data-work-notes]")) {
      workState.notes = event.target.value;
      saveWorkState(false);
    } else if (event.target.matches("[data-work-project-name]")) {
      workState.project.name = event.target.value;
      saveWorkState(false);
    } else if (event.target.matches("[data-system-note]")) {
      progress.systemNotes[event.target.dataset.systemNote] = event.target.value;
      saveProgress();
    } else if (event.target.matches("[data-lab-draft]")) {
      progress.labDrafts[event.target.dataset.labDraft] = event.target.value;
      saveProgress();
    }
  });

  document.getElementById("profile-import").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || imported.version !== 2 || !imported.progress || !imported.workspace) {
        throw new Error("Formato incompatível.");
      }
      localStorage.setItem(`${STORAGE_KEY}:${activeAccountId}`, JSON.stringify(imported.progress));
      localStorage.setItem(`${WORKSPACE_KEY}:${activeAccountId}`, JSON.stringify(imported.workspace));
      progress = loadProgress();
      workState = loadWorkState();
      progress.updatedAt = Date.now();
      saveProgress();
      renderSystemNav();
      render();
      showToast("Backup importado com sucesso.");
    } catch (_error) {
      showToast("Não foi possível importar este backup.");
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.matches("[data-pexels-search]")) {
      window.NeonThemeStudio.handleSubmit(event, extensionContext());
      return;
    }
    const adminSearch = event.target.closest("[data-admin-search]");
    if (adminSearch) {
      event.preventDefault();
      adminState.query = String(new FormData(adminSearch).get("query") || "").trim();
      loadAdminState(true);
      return;
    }
    const adminForm = event.target.closest("[data-admin-user-form]");
    if (adminForm) {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(adminForm));
      adminForm.querySelector("button[type='submit']").disabled = true;
      runAdminAction(adminForm.dataset.adminTarget, adminForm.dataset.adminUserForm, fields);
      return;
    }
    const tutorForm = event.target.closest("[data-tutor-form]");
    if (tutorForm) {
      event.preventDefault();
      const formData = new FormData(tutorForm);
      const question = String(formData.get("question") || "").trim();
      if (!question) return;
      progress.tutorMessages.push({ role: "user", text: question }, { role: "assistant", text: tutorReply(question) });
      progress.tutorMessages = progress.tutorMessages.slice(commerceAccount.plusActive ? -40 : -16);
      saveProgress();
      render();
      return;
    }
    const form = event.target.closest("[data-work-form]");
    if (!form) return;
    event.preventDefault();
    handleWorkspaceForm(form);
  });

  document.getElementById("menu-button").addEventListener("click", () => {
    sidebar.classList.add("open");
    sidebarScrim.hidden = false;
  });
  document.getElementById("sidebar-close").addEventListener("click", closeSidebar);
  sidebarScrim.addEventListener("click", closeSidebar);
  document.getElementById("print-button").addEventListener("click", () => window.print());
  document.getElementById("theme-button").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  document.getElementById("logout-button").addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } finally {
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      window.location.replace("/login");
    }
  });

  searchInput.addEventListener("input", updateSearch);
  searchInput.addEventListener("focus", updateSearch);
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    updateSearch();
    searchInput.focus();
  });

  document.addEventListener("keydown", (event) => {
    const spoilerTarget = event.target.closest?.("[data-spoiler-code]");
    if (spoilerTarget && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      spoilerTarget.classList.toggle("revealed");
      spoilerTarget.setAttribute("aria-pressed", String(spoilerTarget.classList.contains("revealed")));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.getElementById("install-button").hidden = false;
  });
  document.getElementById("install-button").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("install-button").hidden = true;
  });

  if ("serviceWorker" in navigator && (window.location.protocol === "https:" || window.location.hostname === "localhost")) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  window.addEventListener("online", () => {
    syncStatus = syncStatus === "unavailable" ? "unavailable" : "saving";
    scheduleCloudSync();
  });
  window.addEventListener("offline", () => { syncStatus = "offline"; });

  window.addEventListener("hashchange", render);
  window.addEventListener("scroll", scheduleScrollEffects, { passive: true });
  window.addEventListener("resize", scheduleScrollEffects, { passive: true });
  document.addEventListener("pointermove", updatePointerEffects, { passive: true });
  document.addEventListener("pointerout", resetPointerTilt, { passive: true });
  document.addEventListener("pointerdown", createRipple, { passive: true });

  const storedTheme = localStorage.getItem(THEME_KEY);
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(storedTheme || preferredTheme);
  applyVisualSettings();
  startAmbientPointer();
  async function bootstrapAcademy() {
    const authInitialization = initializeAuthControls();
    renderSystemNav();
    render();
    const canContinue = await authInitialization;
    if (!canContinue) return;
    renderSystemNav();
    render();
    if (window.location.protocol !== "file:") {
      await Promise.all([hydrateLearningProfile(), loadCommerceState()]);
    }
  }
  void bootstrapAcademy();
})();
