# Cotton Fabric Tycoon

Projeto Roblox de tycoon de algodao e tecido.

## Setup

1. Instale o Aftman: https://github.com/LPGhatguy/aftman
2. Rode `aftman install` na raiz do projeto
3. Rode `wally install` para baixar dependencias
4. Rode `rojo serve` e conecte pelo plugin do Roblox Studio

## Como criar seus proprios modelos

O jogo agora procura templates em `ServerStorage/CottonFabricTycoonTemplates`.
Se um template existir, ele usa o seu modelo. Se nao existir, cria uma peca simples
temporaria para o jogo continuar funcionando enquanto voce constroi.

Leia o guia completo em [docs/GUIA_MODELOS.md](docs/GUIA_MODELOS.md).

## Neon Studios System Academy

A plataforma de ensino pode ser servida com login Google, reCAPTCHA e domínio próprio pelo backend em `server/`.
Leia [docs/AUTH_SETUP.md](docs/AUTH_SETUP.md) para configurar credenciais, DNS, HTTPS e restrição opcional por Google Workspace.

A implantacao principal agora usa Cloudflare Workers e Static Assets. O passo a passo esta em [server/CLOUDFLARE_WORKERS_SETUP.md](server/CLOUDFLARE_WORKERS_SETUP.md).

## Unidade do mundo

Toda medida fisica do mundo 3D usa studs: tamanho de pecas, posicoes, offsets,
alturas, raios, distancias de prompt e velocidade de esteira. O modulo
`ReplicatedStorage/Shared/Modules/Studs.luau` existe para deixar essa regra
explicita no codigo.

Os placeholders gerados tambem usam uma superficie visual em studs pelo modulo
`ReplicatedStorage/Shared/Modules/WorldVisualStyle.luau`, com materiais e
padroes leves para deixar o tycoon mais bonitinho sem depender de assets
externos.

UI ainda usa as unidades normais do Roblox (`UDim2`, pixels e escala de tela).

## Estrutura

- `src/ReplicatedStorage/Shared/Framework/` - framework base
- `src/ReplicatedStorage/Shared/Modules/NpcConfig.luau` - posicoes e tamanhos dos NPCs em studs
- `src/ServerScriptService/Services/` - servicos do servidor
- `src/ServerScriptService/Modules/` - utilitarios do servidor
- `src/StarterPlayerScripts/Controllers/` - controladores do cliente
