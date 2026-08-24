# RobloxCube / Cube 3D

Instalacao local configurada em `.robloxcube/` usando o repositorio oficial `Roblox/cube` e pesos `Roblox/cube3d-v0.5`.

## Gerar um modelo

Na raiz do projeto:

```powershell
.\scripts\robloxcube-generate.ps1 -Prompt "low poly cotton bale wrapped with fabric bands" -Name cotton-bale -BoundingBoxXyz 1.4,0.8,1.0
```

O arquivo sai em:

```text
generated-models/<nome>/output.obj
```

Use `-ResolutionBase 4.0` para rodar melhor na RTX 3060 12 GB. Valores maiores geram malha mais detalhada, mas usam mais VRAM e tempo.

## Importar no Roblox Studio

1. Abra o Roblox Studio.
2. Use o importador 3D para importar `generated-models/<nome>/output.obj`.
3. Transforme o resultado no template esperado pelo projeto, seguindo `docs/GUIA_MODELOS.md`.
4. Coloque o modelo em `ServerStorage/CottonFabricTycoonTemplates`.

## Modelos polidos

Tambem ha um gerador Blender para criar modelos mais bonitos que os OBJs crus do Cube:

```powershell
.\scripts\create-polished-roblox-assets.ps1
```

Ele exporta assets em:

```text
generated-models/polished/
  cotton_boll_polished/
  cotton_bale_polished/
  cotton_machine_polished/
```

Use o `.fbx` no Roblox Studio primeiro, porque ele preserva melhor objetos separados e materiais simples. O `.blend` fica como arquivo editavel, e o `.obj` fica como fallback.

## Interface Java

Para usar sem terminal, abra este arquivo com dois cliques:

```text
RobloxCubeGUI.vbs
```

A janela permite:

- gerar os modelos polidos;
- gerar um modelo novo por prompt usando o RobloxCube;
- escolher presets de prompt e tamanho;
- montar uma queue/playlist de prompts;
- gerar um modelo por vez automaticamente, indo para o proximo ao terminar;
- acompanhar media/estimativa de tempo por modelo;
- aplicar presets de material e visualizar em 3D local a 30 FPS;
- abrir direto as pastas de saida.

Na primeira abertura, o launcher compila automaticamente a interface Java em `tools/robloxcube-gui/build/`.

### Abas da interface

- `1. Mesh / Queue`: cria prompts, adiciona na fila, adiciona playlist pronta e gera cada mesh em sequencia.
- `2. Textura / Preview 3D`: escolhe o modelo de preview, troca materiais e cria presets `.mtl` simples em `generated-models/texture-presets/`.

### Otimizacao da interface

A interface foi ajustada para ficar mais leve:

- cursor customizado estatico, sem timer continuo;
- fundo animado em baixa frequencia;
- preview 3D em 30 FPS somente quando a aba `Textura / Preview 3D` esta aberta;
- launcher reutiliza o build Java mais recente em vez de recompilar sempre;
- builds antigos sao limpos automaticamente quando nao estao abertos por outra janela.

## Texturas

O Cube 3D aberto atualmente gera geometria `.obj`. No README oficial do `Roblox/cube`, geracao de textura ainda aparece como recurso futuro. Para assets finais com textura, o caminho recomendado por enquanto e:

1. gerar a malha com Cube;
2. importar no Roblox Studio;
3. usar o Texture Generator do Studio em `Window > 3D > Texture Generator`, ou aplicar material/textura manual;
4. importar o asset final no Studio.

O Assistant/GenerationService do Roblox Studio tambem possui geracao de malhas texturizadas via ferramentas/API do Studio. Isso depende da sessao logada e dos recursos beta/Studio, diferente desta instalacao local offline do `Roblox/cube`.

## Ambiente

- Python isolado: `.robloxcube/.venv`
- Codigo do Cube: `.robloxcube/cube`
- Pesos do modelo: `.robloxcube/cube/model_weights`
- GPU testada: NVIDIA GeForce RTX 3060 12 GB
