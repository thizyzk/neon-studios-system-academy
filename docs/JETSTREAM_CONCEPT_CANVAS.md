# Canvas Jetstream e Conceito do Cotton Fabric Tycoon

Este canvas organiza como usar o Jetstream dentro do conceito do Cotton Fabric
Tycoon: um tycoon Roblox sobre plantar algodao, transformar em fio/tecido,
e vender produtos melhores enquanto a fabrica cresce.

## 1. Visao Central

| Bloco | Decisao |
| --- | --- |
| Promessa do jogo | Fazer o jogador sentir que esta construindo uma mini fabrica viva, do campo de algodao ate o tecido premium. |
| Papel do Jetstream | Trazer videos curtos estilo reels para ensinar, ambientar, divulgar recompensas e criar momentos sociais dentro do jogo. |
| Fantasia principal | "Minha fazenda vira uma fabrica de tecido cada vez mais eficiente e bonita." |
| Ritmo ideal | Plantar -> colher -> limpar -> fiar -> tecer -> vender -> melhorar -> desbloquear novo andar. |
| Diferencial | Mistura de tycoon industrial com comunicacao visual moderna: telas de fabrica, reels, dicas rapidas e conteudo compartilhavel. |

## 2. Como o Jetstream Entra no Jogo

Jetstream nao e TikTok ao vivo. Ele transforma um video em varios frames de
imagem, envia os frames como assets Roblox e gera um modulo Luau com os IDs.
No jogo, `JetstreamFramePlayer` toca esses frames dentro de um `ImageLabel`.

Uso recomendado no Cotton Fabric Tycoon:

| Lugar no jogo | Uso do Jetstream | Objetivo |
| --- | --- | --- |
| HUD de Reels | Player abre "Video Reels" e assiste conteudo vertical. | Testar o sistema e dar personalidade ao jogo. |
| Tela 3D na fabrica | `SurfaceGui` com videos de producao, tutorial ou propaganda interna. | Fazer a fabrica parecer viva. |
| Tutorial dos NPCs | Farm Helper e Factory Mentor indicam reels curtos de ajuda. | Ensinar sem texto longo. |
| Desbloqueio de andar | Pequeno video celebrando novo piso ou nova etapa industrial. | Reforcar progresso. |
| Eventos e updates | Reels de novidades, codigos, bonus e cosmeticos. | Retencao e comunicacao com jogadores. |

## 3. Jornada do Jogador

```text
Entrada no plot
  -> Farm Helper explica plantio
  -> Jogador planta Basic Cotton
  -> Colhe Raw Cotton
  -> Usa Cotton Cleaner
  -> Usa Thread Spinner
  -> Usa Fabric Loom
  -> Vende Cotton Fabric
  -> Compra upgrades e skills
  -> Desbloqueia novos andares
  -> Encontra reels mais avancados e conteudos de evento
```

## 4. Pipeline Pratico do Jetstream

| Etapa | Acao | Arquivo/Comando |
| --- | --- | --- |
| 1 | Criar video curto permitido/licenciado. | Exportar MP4 vertical 9:16. |
| 2 | Colocar o video no projeto. | `assets\jetstream-input\meu-video.mp4` |
| 3 | Configurar Open Cloud uma vez. | `.\scripts\jetstream-configure.ps1 -ApiKey "SUA_KEY" -UploaderId "SEU_ID" -Test` |
| 4 | Converter, enviar e importar. | `.\scripts\jetstream-convert-and-import.ps1 -Name "FarmIntro01" -Input ".\assets\jetstream-input\farm-intro-01.mp4" -Fps 12 -Big $true` |
| 5 | Conferir modulo gerado. | `src\ReplicatedStorage\Shared\Modules\JetstreamVideos\FarmIntro01.luau` |
| 6 | Conferir catalogo. | `src\ReplicatedStorage\Shared\Modules\JetstreamReelsCatalog.luau` |
| 7 | Testar no jogo. | Abrir o botao `Video Reels`. |

Recomendacao tecnica inicial:

| Configuracao | Valor |
| --- | --- |
| Duracao | 5 a 10 segundos |
| Formato | Vertical 9:16 |
| FPS | 10 a 12 |
| Resolucao | 360p a 540p de largura |
| Loop | Sim para videos ambientais, nao para cenas de recompensa |

## 5. Pilares de Conteudo

| Pilar | Exemplos de reels | Momento ideal |
| --- | --- | --- |
| Tutorial rapido | "Como plantar", "Como colher", "Como vender", "Como usar maquinas". | Primeiros 5 minutos. |
| Fabrica viva | Close de algodao indo para maquina, fio girando, tecido saindo do tear. | Sempre visivel em telas 3D. |
| Progresso | Novo andar, algodao raro, maquina melhorada, venda grande. | Depois de upgrades. |
| Economia | "Fabric vale mais", "Nao deixe o storage lotar", "Upgrade o Loom". | Quando o jogador trava. |
| Social | Convide amigos, mostre sua fabrica, eventos semanais. | Menu de reels ou tela central. |
| Premium/cosmetico | Skins de maquina, telas tematicas, efeitos de tecido. | Loja/eventos, sem atrapalhar o tycoon. |

## 6. Conteudos MVP

Primeiro pacote de videos recomendado:

| Nome do modulo | Conteudo | Uso |
| --- | --- | --- |
| `FarmIntro01` | Plantio e colheita de algodao basico. | Tutorial do Farm Helper. |
| `CleanerDemo01` | Algodao cru entrando no Cotton Cleaner. | Dica perto da primeira maquina. |
| `SpinnerDemo01` | Clean Cotton virando Cotton Thread. | Dica de progressao. |
| `LoomDemo01` | Cotton Thread virando Cotton Fabric. | Dica de valor e venda. |
| `FactoryProgress01` | Fabrica subindo de andar e ficando mais movimentada. | Recompensa de unlock. |

## 7. Sistema Atual do Projeto

| Area | O que ja existe |
| --- | --- |
| Algodao | `Basic Cotton`, `Silky Cotton`, `Golden Cotton`, raridades e qualidade. |
| Itens | `RawCotton`, `CleanCotton`, `CottonThread`, `CottonFabric`. |
| Maquinas | `Cotton Cleaner`, `Thread Spinner`, `Fabric Loom`. |
| Andares | Ground Floor, Fiber Floor, Weaving Floor, Dye Floor. |
| NPCs | `Farm Helper` e `Factory Mentor`. |
| Skills | Yield, cleaner speed, spinner speed, loom speed, storage e venda. |
| Jetstream | Player de frames, GUI de reels e script de importacao ja existem. |
| Pendente | Catalogo Jetstream esta vazio ate importar os primeiros videos. |

## 8. Fluxo de Integracao no Conceito

```text
Video MP4
  -> Jetstream CLI
  -> Roblox Open Cloud assets
  -> Modulo Luau em JetstreamVideos
  -> Catalogo JetstreamReelsCatalog
  -> JetstreamReelsController
  -> HUD ou tela 3D no mundo
  -> Jogador entende, se encanta ou compartilha
```

## 9. Regras de Design para os Reels

| Regra | Motivo |
| --- | --- |
| Videos curtos e diretos. | Cada frame vira asset, entao videos longos ficam pesados. |
| Visual claro mesmo pequeno. | O jogador pode assistir em uma tela 3D ou painel compacto. |
| Evitar texto demais dentro do video. | A UI do Roblox pode sobrepor titulo/status. |
| Usar identidade do jogo. | Algodao, maquinas, tecido, dinheiro e andares devem aparecer. |
| Repetir cores por etapa. | Verde para campo, azul para fibra, roxo para tecelagem, dourado para venda. |
| Criar loops ambientais. | Telas de fabrica ficam melhores com videos que loopam sem corte brusco. |

## 10. Backlog Priorizado

| Prioridade | Item | Resultado esperado |
| --- | --- | --- |
| P0 | Importar `FarmIntro01` com Jetstream. | Validar pipeline completo. |
| P0 | Preencher `JetstreamReelsCatalog` via script. | Botao `Video Reels` deixa de mostrar lista vazia. |
| P1 | Criar tela 3D da fabrica com `SurfaceGui`. | Jetstream deixa de ser apenas HUD e entra no mundo. |
| P1 | Conectar NPCs a reels especificos. | Tutorial fica mais guiado. |
| P2 | Criar reels para cada maquina. | Educacao visual da cadeia produtiva. |
| P2 | Criar reels de unlock dos andares. | Mais impacto no progresso. |
| P3 | Adicionar filtros/categorias no catalogo. | Reels por tutorial, evento, maquina e social. |

## 11. Checklist de Uso

- [ ] Criar chave Roblox Open Cloud com Assets Read/Write.
- [ ] Rodar `jetstream-configure.ps1` uma vez.
- [ ] Colocar MP4 em `assets\jetstream-input\`.
- [ ] Rodar `jetstream-convert-and-import.ps1`.
- [ ] Confirmar modulo em `JetstreamVideos`.
- [ ] Confirmar entrada no `JetstreamReelsCatalog`.
- [ ] Testar no Roblox Studio.
- [ ] Decidir se o video aparece no HUD, numa tela 3D ou em ambos.

## 12. Frase Guia do Conceito

Cotton Fabric Tycoon usa Jetstream como uma camada de comunicacao visual:
videos curtos transformam a fabrica em um lugar mais vivo, explicam o ciclo de
producao sem interromper o jogador e celebram cada salto de progresso.
