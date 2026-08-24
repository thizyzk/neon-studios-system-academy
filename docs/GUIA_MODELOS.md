# Guia de Modelos do Cotton Fabric Tycoon

Este projeto foi ajustado para voce construir os modelos no Roblox Studio. O codigo cuida da logica: donos dos plots, plantio, colheita, esteira, maquinas, upgrades e venda. Os visuais podem ficar todos por sua conta.

## 1. Crie a pasta de templates

No Roblox Studio, crie esta estrutura em `ServerStorage`:

```text
ServerStorage
  CottonFabricTycoonTemplates
    Plots
    Floors
    Slots
    Pads
    Machines
    Conveyors
    Upgraders
    NPCs
    Plants
    Cottons
```

Tambem funciona se a pasta raiz se chamar `ModelTemplates`, mas `CottonFabricTycoonTemplates` e o nome recomendado.

## 2. Regra principal de cada modelo

Cada template deve ser um `Model` com `PrimaryPart` definido, ou deve ter uma peca chamada `Root`, `Base`, `Body` ou `PromptPart`. O script usa essa peca para posicionar o modelo.

Modele tudo em studs. Os tamanhos, posicoes, offsets, alturas, raios e distancias
do mundo 3D no codigo tambem sao tratados como studs. Se voce criar uma esteira
de 40 no eixo X, por exemplo, ela deve ocupar 40 studs no Studio.

Para combinar com os placeholders do jogo, use superficies/padroes alinhados em
studs no Studio. Chao, slots, pads e esteiras ficam melhor quando a textura
repete em medidas simples como 1, 2 ou 4 studs.

Os NPCs placeholder usam visual de bloquinho com pinos/studs fisicos em cima do
corpo e da cabeca. Se voce modelar seus proprios NPCs, mantenha esses detalhes
em medidas de studs para combinar com o resto do mundo.

Use estas pecas opcionais quando quiser mais controle:

- `PromptPart`: peca onde o `ProximityPrompt` sera colocado.
- `StateColorPart`: peca que muda de cor quando uma planta cresce ou uma maquina liga.
- `CottonBoll`, `GlowPart` ou `Boll`: peca que recebe o brilho da raridade no algodao.

Deixe as pecas principais `Anchored = true`. O script tambem ancora os modelos clonados por seguranca.

## 3. Templates aceitos

Crie so o que quiser substituir. O resto continua com placeholder automatico.

```text
CottonFabricTycoonTemplates
  Plots
    PlotTemplate
    Plot_1
    Plot_2
  Floors
    Floor
    Floor_1
    Floor_2
    Floor_3
    Floor_4
  Slots
    Slot
    Slot_1
    Floor_1
      Slot_1
      Slot_2
  Pads
    UnlockFloor
    Unlock_Floor_2
    SellPad
    MachineUpgradePad
    CleanerUpgradePad
    SpinnerUpgradePad
    LoomUpgradePad
  Machines
    Machine
    Cleaner
    Spinner
    Loom
  Conveyors
    MainConveyor
  Upgraders
    Upgrader
    fiber_cleaner
    soft_press
  NPCs
    Npc
    FarmHelper
    FactoryMentor
  Plants
    Default
    basic_cotton
      Planted
      Sprout
      Growing
      Ready
  Cottons
    CottonBale
```

Ordem de prioridade: o jogo procura primeiro o nome mais especifico, depois cai para o nome generico. Exemplo: para a maquina `Cleaner`, ele tenta `Machines/Cleaner`; se nao existir, usa `Machines/Machine`; se nao existir, gera o placeholder.

## 4. Construa na ordem mais facil

1. Modele `Floors/Floor` primeiro. Ele vira a plataforma de cada andar.
2. Modele `Slots/Slot` com uma peca `PromptPart` ou `Base` no centro do canteiro.
3. Modele `Machines/Cleaner`, `Machines/Spinner` e `Machines/Loom`.
4. Modele `Pads/SellPad`, `Pads/MachineUpgradePad` e `Pads/UnlockFloor`.
5. Modele `Conveyors/MainConveyor` e os upgraders `fiber_cleaner` e `soft_press`.
6. Modele os NPCs em `NPCs/FarmHelper` e `NPCs/FactoryMentor`, com `PromptPart`, `Body` ou `Root`.
7. Modele as plantas em `Plants/Default/Planted`, `Sprout`, `Growing` e `Ready`.
8. Modele `Cottons/CottonBale` como `Part` ou `MeshPart`, porque ele se move pela esteira.

## 5. Teste no Studio

1. Rode `rojo serve` na raiz do projeto.
2. Abra o Roblox Studio e conecte o plugin do Rojo.
3. Crie os templates em `ServerStorage/CottonFabricTycoonTemplates`.
4. Aperte Play.
5. Verifique se aparecem prompts em slots, maquinas e pads.
6. Plante algodao, espere crescer, colha, rode as maquinas e venda os produtos.

Se algo aparecer como bloco simples, o jogo nao encontrou o template com o nome esperado ou o template nao tinha nenhuma `BasePart`.

## 6. Importante sobre salvar

Os modelos criados diretamente no Studio nao sao gravados automaticamente como arquivos Luau. Salve o place no Studio para manter os modelos, ou exporte modelos importantes como `.rbxm` se quiser guardar/copiar para outro projeto.
