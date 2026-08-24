/* Biblioteca única de métodos Roblox/Luau usada pela busca e pela aula de referência. */
window.ROBLOX_METHOD_CATALOG = [
  {
    "id": "instances-findfirstchild",
    "category": "Instances",
    "name": "FindFirstChild",
    "signature": "instance:FindFirstChild(name, recursive?)",
    "definition": "Procura um filho existente e retorna imediatamente.",
    "use": "Quando o objeto pode ou não existir naquele instante.",
    "avoid": "Quando a replicação ainda não terminou e o objeto é obrigatório; nesse caso use WaitForChild.",
    "returns": "Instance?",
    "example": "local humanoid = character:FindFirstChild(\"Humanoid\")",
    "related": [
      "WaitForChild",
      "GetChildren",
      "IsA"
    ]
  },
  {
    "id": "instances-waitforchild",
    "category": "Instances",
    "name": "WaitForChild",
    "signature": "instance:WaitForChild(name, timeout?)",
    "definition": "Suspende a thread atual até o filho existir ou o timeout terminar.",
    "use": "Para dependências obrigatórias que chegam por replicação ou criação assíncrona.",
    "avoid": "Em loops ou para objetos opcionais; esperar indefinidamente pode esconder erro de nome.",
    "returns": "Instance?",
    "example": "local root = character:WaitForChild(\"HumanoidRootPart\", 5)",
    "related": [
      "FindFirstChild",
      "Replicação",
      "Timeout"
    ]
  },
  {
    "id": "instances-findclass",
    "category": "Instances",
    "name": "FindFirstChildOfClass",
    "signature": "instance:FindFirstChildOfClass(className)",
    "definition": "Procura um filho cuja ClassName seja exatamente a classe informada.",
    "use": "Quando o nome pode mudar, mas a classe direta identifica o papel.",
    "avoid": "Quando subclasses também devem ser aceitas; use FindFirstChildWhichIsA.",
    "returns": "Instance?",
    "example": "local humanoid = character:FindFirstChildOfClass(\"Humanoid\")",
    "related": [
      "FindFirstChildWhichIsA",
      "IsA"
    ]
  },
  {
    "id": "instances-findwhichisa",
    "category": "Instances",
    "name": "FindFirstChildWhichIsA",
    "signature": "instance:FindFirstChildWhichIsA(className, recursive?)",
    "definition": "Procura um filho que passe em IsA, incluindo subclasses.",
    "use": "Para localizar BasePart, GuiObject ou ValueBase sem exigir classe exata.",
    "avoid": "Quando vários filhos da mesma família existem e você precisa de um ID mais estável.",
    "returns": "Instance?",
    "example": "local part = model:FindFirstChildWhichIsA(\"BasePart\", true)",
    "related": [
      "FindFirstChildOfClass",
      "IsA",
      "GetDescendants"
    ]
  },
  {
    "id": "instances-children",
    "category": "Instances",
    "name": "GetChildren",
    "signature": "instance:GetChildren()",
    "definition": "Cria uma nova tabela contendo apenas filhos diretos.",
    "use": "Para iterar o primeiro nível conhecido de uma hierarquia.",
    "avoid": "Quando objetos em subpastas também importam; use GetDescendants.",
    "returns": "{ Instance }",
    "example": "for _, child in folder:GetChildren() do\n    print(child.Name)\nend",
    "related": [
      "GetDescendants",
      "ipairs"
    ]
  },
  {
    "id": "instances-descendants",
    "category": "Instances",
    "name": "GetDescendants",
    "signature": "instance:GetDescendants()",
    "definition": "Cria uma tabela com todos os descendentes da árvore.",
    "use": "Para auditoria, limpeza ou configuração profunda feita ocasionalmente.",
    "avoid": "Todo frame em árvores grandes; a alocação e a travessia se repetiriam sem necessidade.",
    "returns": "{ Instance }",
    "example": "for _, object in model:GetDescendants() do\n    if object:IsA(\"BasePart\") then object.CanCollide = false end\nend",
    "related": [
      "GetChildren",
      "IsA",
      "CollectionService"
    ]
  },
  {
    "id": "instances-isa",
    "category": "Instances",
    "name": "IsA",
    "signature": "instance:IsA(className)",
    "definition": "Verifica se a Instance pertence à classe ou herda dela.",
    "use": "Antes de usar propriedades específicas durante uma iteração heterogênea.",
    "avoid": "Como substituto de uma regra de domínio; classe não informa ownership ou permissão.",
    "returns": "boolean",
    "example": "if object:IsA(\"BasePart\") then\n    object.Anchored = true\nend",
    "related": [
      "ClassName",
      "FindFirstChildWhichIsA"
    ]
  },
  {
    "id": "instances-clone",
    "category": "Instances",
    "name": "Clone",
    "signature": "instance:Clone()",
    "definition": "Cria uma nova árvore copiando propriedades e descendentes clonáveis.",
    "use": "Para instanciar templates guardados no ServerStorage.",
    "avoid": "Para duplicar estado persistente; a cópia continua sendo runtime e precisa receber Parent.",
    "returns": "Instance",
    "example": "local machine = ServerStorage.Machines.BasicLoom:Clone()\nmachine.Parent = workspace",
    "related": [
      "Archivable",
      "Parent",
      "PivotTo"
    ]
  },
  {
    "id": "instances-destroy",
    "category": "Instances",
    "name": "Destroy",
    "signature": "instance:Destroy()",
    "definition": "Desconecta a Instance da hierarquia, bloqueia Parent e encerra conexões associadas.",
    "use": "Quando o objeto terminou seu ciclo de vida e não será reutilizado.",
    "avoid": "Em objetos frequentes que podem ser reciclados por Object Pool.",
    "returns": "void",
    "example": "effect:Destroy()",
    "related": [
      "Object Pool",
      "Debris",
      "Janitor"
    ]
  },
  {
    "id": "instances-getattribute",
    "category": "Instances",
    "name": "GetAttribute",
    "signature": "instance:GetAttribute(name)",
    "definition": "Lê um valor serializável armazenado no mapa de Attributes da Instance.",
    "use": "Para flags e snapshots leves replicados durante a sessão.",
    "avoid": "Como fonte de verdade persistente sem importar e exportar para o perfil.",
    "returns": "Variant",
    "example": "local level = machine:GetAttribute(\"Level\") or 1",
    "related": [
      "SetAttribute",
      "GetAttributes",
      "PlayerDataService"
    ]
  },
  {
    "id": "instances-setattribute",
    "category": "Instances",
    "name": "SetAttribute",
    "signature": "instance:SetAttribute(name, value)",
    "definition": "Escreve ou remove um Attribute e replica a mudança conforme a Instance.",
    "use": "Para sincronizar estado leve que UI e scripts precisam observar.",
    "avoid": "Para tabelas ou Instances; Attributes aceitam apenas tipos suportados.",
    "returns": "void",
    "example": "player:SetAttribute(\"Cash\", newBalance)",
    "related": [
      "GetAttribute",
      "GetAttributeChangedSignal"
    ]
  },
  {
    "id": "instances-getattributes",
    "category": "Instances",
    "name": "GetAttributes",
    "signature": "instance:GetAttributes()",
    "definition": "Retorna uma nova tabela com todos os Attributes atuais.",
    "use": "Para snapshots, debug e serialização controlada.",
    "avoid": "Como tabela viva; alterar o retorno não muda a Instance.",
    "returns": "table",
    "example": "local snapshot = machine:GetAttributes()",
    "related": [
      "GetAttribute",
      "table.clone"
    ]
  },
  {
    "id": "instances-propertysignal",
    "category": "Instances",
    "name": "GetPropertyChangedSignal",
    "signature": "instance:GetPropertyChangedSignal(property)",
    "definition": "Retorna um RBXScriptSignal específico para uma propriedade.",
    "use": "Quando você precisa reagir somente à mudança daquela propriedade.",
    "avoid": "Sem guardar e desconectar a conexão durante o ciclo de vida.",
    "returns": "RBXScriptSignal",
    "example": "local connection = humanoid:GetPropertyChangedSignal(\"Health\"):Connect(updateBar)",
    "related": [
      "Changed",
      "Connect",
      "Disconnect"
    ]
  },
  {
    "id": "players-fromcharacter",
    "category": "Players",
    "name": "GetPlayerFromCharacter",
    "signature": "Players:GetPlayerFromCharacter(character)",
    "definition": "Procura qual Player possui aquele Character.",
    "use": "Para transformar um Model encontrado por toque ou hitbox em identidade de jogador.",
    "avoid": "Para NPCs; o retorno será nil e isso precisa ser tratado.",
    "returns": "Player?",
    "example": "local player = Players:GetPlayerFromCharacter(character)",
    "related": [
      "CharacterAdded",
      "Humanoid"
    ]
  },
  {
    "id": "players-getplayers",
    "category": "Players",
    "name": "GetPlayers",
    "signature": "Players:GetPlayers()",
    "definition": "Retorna uma nova tabela com jogadores conectados naquele servidor.",
    "use": "Para broadcast de regra, shutdown e snapshots ocasionais.",
    "avoid": "Como cache permanente; jogadores entram e saem após a chamada.",
    "returns": "{ Player }",
    "example": "for _, player in Players:GetPlayers() do\n    savePlayer(player)\nend",
    "related": [
      "PlayerAdded",
      "PlayerRemoving"
    ]
  },
  {
    "id": "players-byuserid",
    "category": "Players",
    "name": "GetPlayerByUserId",
    "signature": "Players:GetPlayerByUserId(userId)",
    "definition": "Procura um Player conectado neste servidor pelo UserId.",
    "use": "Quando você possui ID persistente e precisa da sessão local correspondente.",
    "avoid": "Para encontrar usuário offline ou em outro servidor.",
    "returns": "Player?",
    "example": "local target = Players:GetPlayerByUserId(ownerUserId)",
    "related": [
      "GetPlayers",
      "MemoryStore"
    ]
  },
  {
    "id": "players-idfromname",
    "category": "Players",
    "name": "GetUserIdFromNameAsync",
    "signature": "Players:GetUserIdFromNameAsync(username)",
    "definition": "Consulta o UserId canônico de um nome usando uma chamada assíncrona.",
    "use": "Em ferramenta administrativa que recebe username e pode tratar falha.",
    "avoid": "No caminho frequente de gameplay ou sem pcall; a consulta pode falhar.",
    "returns": "number",
    "example": "local ok, userId = pcall(Players.GetUserIdFromNameAsync, Players, username)",
    "related": [
      "pcall",
      "GetNameFromUserIdAsync"
    ]
  },
  {
    "id": "players-namefromid",
    "category": "Players",
    "name": "GetNameFromUserIdAsync",
    "signature": "Players:GetNameFromUserIdAsync(userId)",
    "definition": "Consulta o username atual correspondente a um UserId.",
    "use": "Para exibição administrativa quando só o ID persistido está disponível.",
    "avoid": "Como chave de save; nomes mudam, UserId não.",
    "returns": "string",
    "example": "local ok, username = pcall(Players.GetNameFromUserIdAsync, Players, userId)",
    "related": [
      "UserId",
      "pcall"
    ]
  },
  {
    "id": "collections-addtag",
    "category": "CollectionService",
    "name": "AddTag",
    "signature": "CollectionService:AddTag(instance, tag)",
    "definition": "Associa uma tag de runtime a uma Instance.",
    "use": "Para componentes descobrirem máquinas, coletores e NPCs sem depender de pasta fixa.",
    "avoid": "Para guardar progresso permanente sem reconstruir a tag ao carregar.",
    "returns": "void",
    "example": "CollectionService:AddTag(machine, \"ProductionMachine\")",
    "related": [
      "GetTagged",
      "Component Pattern"
    ]
  },
  {
    "id": "collections-removetag",
    "category": "CollectionService",
    "name": "RemoveTag",
    "signature": "CollectionService:RemoveTag(instance, tag)",
    "definition": "Remove uma classificação previamente aplicada.",
    "use": "Quando o objeto deixa de cumprir o papel representado pela tag.",
    "avoid": "Como substituto de Destroy; a Instance continua existindo.",
    "returns": "void",
    "example": "CollectionService:RemoveTag(machine, \"ProductionMachine\")",
    "related": [
      "AddTag",
      "GetInstanceRemovedSignal"
    ]
  },
  {
    "id": "collections-hastag",
    "category": "CollectionService",
    "name": "HasTag",
    "signature": "CollectionService:HasTag(instance, tag)",
    "definition": "Verifica se a Instance possui a tag informada.",
    "use": "Para uma checagem pontual antes de executar comportamento.",
    "avoid": "Antes de toda chamada quando o componente já controla seu próprio ciclo.",
    "returns": "boolean",
    "example": "if CollectionService:HasTag(part, \"DamageZone\") then",
    "related": [
      "GetTagged",
      "IsA"
    ]
  },
  {
    "id": "collections-gettagged",
    "category": "CollectionService",
    "name": "GetTagged",
    "signature": "CollectionService:GetTagged(tag)",
    "definition": "Retorna uma nova tabela com Instances atualmente marcadas.",
    "use": "Na inicialização de um sistema que precisa alcançar objetos já existentes.",
    "avoid": "Como única escuta; novos objetos exigem GetInstanceAddedSignal.",
    "returns": "{ Instance }",
    "example": "for _, machine in CollectionService:GetTagged(\"ProductionMachine\") do\n    attachMachine(machine)\nend",
    "related": [
      "GetInstanceAddedSignal",
      "GetInstanceRemovedSignal"
    ]
  },
  {
    "id": "collections-added",
    "category": "CollectionService",
    "name": "GetInstanceAddedSignal",
    "signature": "CollectionService:GetInstanceAddedSignal(tag)",
    "definition": "Retorna um sinal disparado quando uma Instance recebe a tag.",
    "use": "Para inicializar componentes adicionados depois do Start.",
    "avoid": "Sem processar GetTagged primeiro; objetos antigos seriam ignorados.",
    "returns": "RBXScriptSignal",
    "example": "CollectionService:GetInstanceAddedSignal(\"ProductionMachine\"):Connect(attachMachine)",
    "related": [
      "GetTagged",
      "Connect"
    ]
  },
  {
    "id": "collections-removed",
    "category": "CollectionService",
    "name": "GetInstanceRemovedSignal",
    "signature": "CollectionService:GetInstanceRemovedSignal(tag)",
    "definition": "Retorna um sinal quando a Instance perde a tag ou sai do DataModel.",
    "use": "Para limpar conexões, cache e estado do componente.",
    "avoid": "Sem uma função de cleanup idempotente; remoção pode coincidir com Destroy.",
    "returns": "RBXScriptSignal",
    "example": "CollectionService:GetInstanceRemovedSignal(\"ProductionMachine\"):Connect(detachMachine)",
    "related": [
      "RemoveTag",
      "Janitor"
    ]
  },
  {
    "id": "events-connect",
    "category": "Eventos",
    "name": "Connect",
    "signature": "signal:Connect(callback)",
    "definition": "Registra uma função para chamadas futuras do sinal.",
    "use": "Quando o evento pode acontecer várias vezes durante o ciclo de vida.",
    "avoid": "Sem guardar a conexão quando o dono pode ser destruído.",
    "returns": "RBXScriptConnection",
    "example": "local connection = button.Activated:Connect(onActivated)",
    "related": [
      "Disconnect",
      "Once",
      "Janitor"
    ]
  },
  {
    "id": "events-once",
    "category": "Eventos",
    "name": "Once",
    "signature": "signal:Once(callback)",
    "definition": "Registra callback que se desconecta depois do primeiro disparo.",
    "use": "Para confirmação única, primeira resposta ou transição que ocorre uma vez.",
    "avoid": "Quando eventos seguintes ainda precisam ser observados.",
    "returns": "RBXScriptConnection",
    "example": "humanoid.Died:Once(onDeath)",
    "related": [
      "Connect",
      "Disconnect"
    ]
  },
  {
    "id": "events-wait",
    "category": "Eventos",
    "name": "Wait",
    "signature": "signal:Wait()",
    "definition": "Suspende a thread atual até o próximo disparo e retorna argumentos.",
    "use": "Em uma sequência linear controlada que realmente deve aguardar.",
    "avoid": "Em callbacks principais sem timeout; a thread pode permanecer suspensa para sempre.",
    "returns": "...any",
    "example": "local reached = humanoid.MoveToFinished:Wait()",
    "related": [
      "Promise",
      "Timeout",
      "Once"
    ]
  },
  {
    "id": "events-disconnect",
    "category": "Eventos",
    "name": "Disconnect",
    "signature": "connection:Disconnect()",
    "definition": "Remove o callback registrado daquele sinal.",
    "use": "Quando o objeto consumidor termina ou muda de estado.",
    "avoid": "Somente depois do Destroy sem manter referência; conexões externas podem sobreviver.",
    "returns": "void",
    "example": "if connection.Connected then connection:Disconnect() end",
    "related": [
      "Connect",
      "Janitor",
      "Maid"
    ]
  },
  {
    "id": "tables-insert",
    "category": "Tabelas",
    "name": "table.insert",
    "signature": "table.insert(array, position?, value)",
    "definition": "Insere valor em uma sequência e desloca índices quando necessário.",
    "use": "Para arrays ordenados pequenos e filas simples locais.",
    "avoid": "No início de arrays enormes a cada frame; deslocar todos os índices custa trabalho.",
    "returns": "void",
    "example": "table.insert(queue, job)",
    "related": [
      "table.remove",
      "Queue"
    ]
  },
  {
    "id": "tables-remove",
    "category": "Tabelas",
    "name": "table.remove",
    "signature": "table.remove(array, position?)",
    "definition": "Remove e retorna um item, deslocando elementos seguintes.",
    "use": "Para pilhas e filas locais pequenas.",
    "avoid": "Em coleções grandes quando um dicionário por ID resolveria sem deslocamento.",
    "returns": "any",
    "example": "local first = table.remove(queue, 1)",
    "related": [
      "table.insert",
      "Deque"
    ]
  },
  {
    "id": "tables-find",
    "category": "Tabelas",
    "name": "table.find",
    "signature": "table.find(array, value, init?)",
    "definition": "Procura igualdade em uma sequência e retorna o índice.",
    "use": "Para arrays curtos onde a ordem importa.",
    "avoid": "Para consultas frequentes em listas grandes; use Set com chaves.",
    "returns": "number?",
    "example": "local index = table.find(unlockedIds, titleId)",
    "related": [
      "Set",
      "Dicionário"
    ]
  },
  {
    "id": "tables-sort",
    "category": "Tabelas",
    "name": "table.sort",
    "signature": "table.sort(array, comparator?)",
    "definition": "Reordena a própria tabela usando comparação opcional.",
    "use": "Para ranking local e apresentação de snapshots.",
    "avoid": "Na fonte de verdade quando a ordem original precisa ser preservada; clone antes.",
    "returns": "void",
    "example": "local sorted = table.clone(items)\ntable.sort(sorted, function(a, b) return a.Price < b.Price end)",
    "related": [
      "table.clone",
      "Comparator"
    ]
  },
  {
    "id": "tables-clone",
    "category": "Tabelas",
    "name": "table.clone",
    "signature": "table.clone(source)",
    "definition": "Cria uma cópia rasa da tabela: o primeiro nível muda, tabelas internas continuam compartilhadas.",
    "use": "Para copiar configuração plana ou array antes de ordenar.",
    "avoid": "Quando é necessária independência profunda de subtabelas.",
    "returns": "table",
    "example": "local copy = table.clone(config)",
    "related": [
      "Referências",
      "Deep Copy",
      "table.freeze"
    ]
  },
  {
    "id": "tables-clear",
    "category": "Tabelas",
    "name": "table.clear",
    "signature": "table.clear(target)",
    "definition": "Remove todas as chaves mantendo a mesma referência de tabela.",
    "use": "Quando consumidores ainda apontam para a tabela e precisam vê-la vazia.",
    "avoid": "Quando você quer invalidar referências antigas; atribuir uma nova tabela tem efeito diferente.",
    "returns": "void",
    "example": "table.clear(cache)",
    "related": [
      "Referências",
      "Garbage Collector"
    ]
  },
  {
    "id": "tables-freeze",
    "category": "Tabelas",
    "name": "table.freeze",
    "signature": "table.freeze(target)",
    "definition": "Impede novas escritas diretas na tabela congelada.",
    "use": "Para configurações e constantes que não devem mudar em runtime.",
    "avoid": "Como cópia profunda; subtabelas precisam ser congeladas separadamente.",
    "returns": "table",
    "example": "local CURRENCIES = table.freeze({ \"Cash\", \"Gems\" })",
    "related": [
      "table.isfrozen",
      "Config",
      "Imutabilidade"
    ]
  }
];

