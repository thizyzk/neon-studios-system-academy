(function () {
  "use strict";

  const PROJECT_KEY = "neon-academy-ui-visualizer-v1";
  const PARSE_CACHE_LIMIT = 24;
  const parseCache = new Map();
  let lastModel = null;

  const CLASS_SCHEMA = new Map(Object.entries({
    ScreenGui: { container: true, icon: "monitor", properties: ["Name", "Enabled", "DisplayOrder", "IgnoreGuiInset", "ResetOnSpawn"] },
    Frame: { container: true, icon: "square", properties: ["Name", "Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "BorderSizePixel", "Rotation", "Visible", "ZIndex"] },
    TextLabel: { container: true, text: true, icon: "type", properties: ["Name", "Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "Text", "TextColor3", "TextSize", "TextScaled", "TextWrapped", "TextXAlignment", "TextYAlignment", "Font", "Rotation", "Visible", "ZIndex"] },
    TextButton: { container: true, text: true, button: true, icon: "mouse-pointer-click", properties: ["Name", "Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "Text", "TextColor3", "TextSize", "TextScaled", "TextWrapped", "Font", "AutoButtonColor", "Rotation", "Visible", "ZIndex"] },
    ImageLabel: { container: true, image: true, icon: "image", properties: ["Name", "Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "Image", "ImageColor3", "ImageTransparency", "ScaleType", "Rotation", "Visible", "ZIndex"] },
    ImageButton: { container: true, image: true, button: true, icon: "image-up", properties: ["Name", "Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "Image", "ImageColor3", "ImageTransparency", "ScaleType", "AutoButtonColor", "Rotation", "Visible", "ZIndex"] },
    ScrollingFrame: { container: true, icon: "panel-top", properties: ["Name", "Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "CanvasSize", "AutomaticCanvasSize", "ScrollBarThickness", "ScrollingDirection", "Rotation", "Visible", "ZIndex"] },
    UICorner: { modifier: true, icon: "square-round-corner", properties: ["Name", "CornerRadius"] },
    UIStroke: { modifier: true, icon: "scan", properties: ["Name", "Color", "Thickness", "Transparency", "ApplyStrokeMode"] },
    UIGradient: { modifier: true, icon: "blend", properties: ["Name", "Color", "Rotation", "Transparency", "Enabled"] },
    UIPadding: { modifier: true, icon: "panel-top-dashed", properties: ["Name", "PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft"] },
    UIListLayout: { modifier: true, icon: "rows-3", properties: ["Name", "Padding", "FillDirection", "HorizontalAlignment", "VerticalAlignment", "SortOrder"] },
    UIGridLayout: { modifier: true, icon: "grid-3x3", properties: ["Name", "CellSize", "CellPadding", "FillDirection", "HorizontalAlignment", "VerticalAlignment", "SortOrder"] },
    UIScale: { modifier: true, icon: "maximize", properties: ["Name", "Scale"] },
    UIAspectRatioConstraint: { modifier: true, icon: "ratio", properties: ["Name", "AspectRatio", "AspectType", "DominantAxis"] },
  }));

  const PROPERTY_INDEX = new Map();
  for (const [className, definition] of CLASS_SCHEMA) {
    PROPERTY_INDEX.set(className, new Set(definition.properties));
  }

  const ROBLOX_SERVICES = Object.freeze([
    "Players", "ReplicatedStorage", "ServerStorage", "ServerScriptService", "StarterGui", "StarterPlayer",
    "TweenService", "RunService", "UserInputService", "ContextActionService", "GuiService", "TextService",
    "LocalizationService", "CollectionService", "HttpService", "DataStoreService", "MemoryStoreService",
    "MessagingService", "MarketplaceService", "TeleportService", "PathfindingService", "PhysicsService",
    "Lighting", "SoundService", "Teams", "Workspace",
  ]);

  const SAMPLE = `--!strict
local mainGui = Instance.new("ScreenGui")
mainGui.Name = "MainGui"
mainGui.IgnoreGuiInset = true

local panel = Instance.new("Frame")
panel.Name = "AcademyPanel"
panel.Size = UDim2.fromScale(0.58, 0.54)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.BackgroundColor3 = Color3.fromRGB(20, 43, 39)
panel.Parent = mainGui

local corner = Instance.new("UICorner", panel)
corner.CornerRadius = UDim.new(0, 8)

local title = Instance.new("TextLabel", panel)
title.Name = "Title"
title.Size = UDim2.new(1, -48, 0, 68)
title.Position = UDim2.new(0, 24, 0, 22)
title.BackgroundTransparency = 1
title.Text = "Neon Interface"
title.TextColor3 = Color3.fromRGB(111, 236, 207)
title.TextSize = 28
title.TextXAlignment = Enum.TextXAlignment.Left

local action = Instance.new("TextButton", panel)
action.Name = "ContinueButton"
action.Size = UDim2.new(0, 190, 0, 48)
action.Position = UDim2.new(0, 24, 1, -72)
action.BackgroundColor3 = Color3.fromRGB(54, 197, 132)
action.Text = "Continuar"
action.TextColor3 = Color3.fromRGB(5, 24, 19)
action.TextSize = 18

local actionCorner = Instance.new("UICorner", action)
actionCorner.CornerRadius = UDim.new(0, 7)`;

  function readProject() {
    try {
      const stored = JSON.parse(localStorage.getItem(PROJECT_KEY) || "{}");
      return { code: typeof stored.code === "string" ? stored.code : SAMPLE, guiMode: stored.guiMode !== false };
    } catch {
      return { code: SAMPLE, guiMode: true };
    }
  }

  function saveProject(project) {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  }

  function splitArguments(source) {
    const args = [];
    let current = "";
    let depth = 0;
    let quote = "";
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        current += character;
        if (character === quote && source[index - 1] !== "\\") quote = "";
      } else if (character === "\"" || character === "'") {
        quote = character;
        current += character;
      } else if (character === "(") {
        depth += 1;
        current += character;
      } else if (character === ")") {
        depth -= 1;
        current += character;
      } else if (character === "," && depth === 0) {
        args.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseValue(raw) {
    const value = raw.trim().replace(/;$/, "");
    if (/^"(?:[^"\\]|\\.)*"$/.test(value)) {
      try { return { type: "string", value: JSON.parse(value) }; } catch { return null; }
    }
    if (/^'(?:[^'\\]|\\.)*'$/.test(value)) return { type: "string", value: value.slice(1, -1).replaceAll("\\'", "'") };
    if (value === "true" || value === "false") return { type: "boolean", value: value === "true" };
    if (finiteNumber(value) !== null) return { type: "number", value: finiteNumber(value) };
    const enumMatch = value.match(/^Enum\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/);
    if (enumMatch) return { type: "enum", enumType: enumMatch[1], value: enumMatch[2] };
    const constructor = value.match(/^(UDim2|UDim|Vector2|Color3)\.(new|fromScale|fromOffset|fromRGB)\((.*)\)$/);
    if (constructor) {
      const values = splitArguments(constructor[3]).map(finiteNumber);
      if (values.some((item) => item === null)) return null;
      const [type, method] = [constructor[1], constructor[2]];
      if (type === "UDim2") {
        if (method === "fromScale" && values.length === 2) return { type, xs: values[0], xo: 0, ys: values[1], yo: 0 };
        if (method === "fromOffset" && values.length === 2) return { type, xs: 0, xo: values[0], ys: 0, yo: values[1] };
        if (method === "new" && values.length === 4) return { type, xs: values[0], xo: values[1], ys: values[2], yo: values[3] };
      }
      if (type === "UDim" && method === "new" && values.length === 2) return { type, scale: values[0], offset: values[1] };
      if (type === "Vector2" && method === "new" && values.length === 2) return { type, x: values[0], y: values[1] };
      if (type === "Color3" && values.length === 3) {
        const divisor = method === "fromRGB" ? 255 : 1;
        return { type, r: values[0] / divisor, g: values[1] / divisor, b: values[2] / divisor };
      }
    }
    return null;
  }

  function parse(code) {
    if (parseCache.has(code)) return parseCache.get(code);
    const nodes = new Map();
    const warnings = [];
    const strict = /^\s*--!strict\b/m.test(code);
    const lines = code.split(/\r?\n/);

    lines.forEach((rawLine, index) => {
      const lineNumber = index + 1;
      const line = rawLine.trim();
      if (!line || line.startsWith("--")) return;
      const createMatch = line.match(/^(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Instance\.new\(\s*["']([A-Za-z0-9_]+)["']\s*(?:,\s*([A-Za-z_][A-Za-z0-9_]*))?\s*\)\s*;?$/);
      if (createMatch) {
        let className = createMatch[2];
        if (className === "MainGui") {
          className = "ScreenGui";
          warnings.push({ line: lineNumber, level: "info", message: 'MainGui não é uma classe Roblox; convertido para ScreenGui com Name "MainGui".' });
        }
        if (!CLASS_SCHEMA.has(className)) {
          warnings.push({ line: lineNumber, level: "error", message: `Classe ${className} ainda não está no catálogo seguro de UI.` });
          return;
        }
        const variable = createMatch[1];
        if (nodes.has(variable)) {
          warnings.push({ line: lineNumber, level: "error", message: `Variável ${variable} já foi criada.` });
          return;
        }
        nodes.set(variable, { variable, className, parentVariable: createMatch[3] || "", properties: className === "ScreenGui" && createMatch[2] === "MainGui" ? { Name: { type: "string", value: "MainGui" } } : {}, children: [], line: lineNumber });
        return;
      }
      const propertyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if (!propertyMatch) {
        warnings.push({ line: lineNumber, level: "warning", message: "Linha ignorada pelo modo visual; nenhuma execução foi realizada." });
        return;
      }
      const [, variable, propertyName, rawValue] = propertyMatch;
      const node = nodes.get(variable);
      if (!node) {
        warnings.push({ line: lineNumber, level: "error", message: `A instância ${variable} ainda não foi criada.` });
        return;
      }
      if (propertyName === "Parent") {
        const parentMatch = rawValue.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*;?$/);
        if (!parentMatch) warnings.push({ line: lineNumber, level: "error", message: "Parent precisa apontar para uma variável criada no arquivo." });
        else node.parentVariable = parentMatch[1];
        return;
      }
      if (!PROPERTY_INDEX.get(node.className).has(propertyName)) {
        warnings.push({ line: lineNumber, level: "warning", message: `${propertyName} não está indexada para ${node.className}.` });
        return;
      }
      const parsedValue = parseValue(rawValue);
      if (!parsedValue) {
        warnings.push({ line: lineNumber, level: "error", message: `Valor de ${propertyName} não pertence ao subconjunto visual seguro.` });
        return;
      }
      node.properties[propertyName] = parsedValue;
    });

    const roots = [];
    for (const node of nodes.values()) {
      const parent = nodes.get(node.parentVariable);
      if (parent) parent.children.push(node);
      else {
        roots.push(node);
        if (node.parentVariable) warnings.push({ line: node.line, level: "warning", message: `Parent ${node.parentVariable} não foi encontrado; instância exibida na raiz.` });
      }
    }
    if (!strict) warnings.unshift({ line: 1, level: "info", message: "Adicione --!strict para manter tipagem estrita no projeto exportado." });
    const model = { nodes, roots, warnings, strict, lineCount: lines.length };
    parseCache.set(code, model);
    if (parseCache.size > PARSE_CACHE_LIMIT) parseCache.delete(parseCache.keys().next().value);
    return model;
  }

  function numberValue(properties, name, fallback) {
    return properties[name]?.type === "number" ? properties[name].value : fallback;
  }

  function colorCss(value, fallback = "transparent", alpha = 1) {
    if (value?.type !== "Color3") return fallback;
    const channels = [value.r, value.g, value.b].map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255));
    return `rgb(${channels.join(" ")} / ${Math.min(1, Math.max(0, alpha))})`;
  }

  function udimCss(value, axis, fallback) {
    if (value?.type !== "UDim2") return fallback;
    return `calc(${(axis === "x" ? value.xs : value.ys) * 100}% + ${axis === "x" ? value.xo : value.yo}px)`;
  }

  function applyModifiers(element, node) {
    for (const child of node.children) {
      const properties = child.properties;
      if (child.className === "UICorner") {
        const radius = properties.CornerRadius;
        element.style.borderRadius = radius?.type === "UDim" ? `calc(${radius.scale * 50}% + ${radius.offset}px)` : "8px";
      } else if (child.className === "UIStroke") {
        element.style.border = `${Math.max(1, numberValue(properties, "Thickness", 1))}px solid ${colorCss(properties.Color, "rgba(255,255,255,.25)")}`;
      } else if (child.className === "UIPadding") {
        const asCss = (value) => value?.type === "UDim" ? `calc(${value.scale * 100}% + ${value.offset}px)` : "0px";
        element.style.padding = `${asCss(properties.PaddingTop)} ${asCss(properties.PaddingRight)} ${asCss(properties.PaddingBottom)} ${asCss(properties.PaddingLeft)}`;
      } else if (child.className === "UIScale") {
        const scale = numberValue(properties, "Scale", 1);
        element.style.scale = String(Math.min(3, Math.max(0.1, scale)));
      } else if (child.className === "UIAspectRatioConstraint") {
        element.style.aspectRatio = String(Math.max(0.1, numberValue(properties, "AspectRatio", 1)));
      } else if (child.className === "UIListLayout") {
        element.style.display = "flex";
        element.style.flexDirection = properties.FillDirection?.value === "Horizontal" ? "row" : "column";
        const padding = properties.Padding;
        element.style.gap = padding?.type === "UDim" ? `${padding.offset}px` : "0px";
      } else if (child.className === "UIGridLayout") {
        element.style.display = "grid";
        const size = properties.CellSize;
        element.style.gridTemplateColumns = `repeat(auto-fill, minmax(${size?.type === "UDim2" ? Math.max(24, size.xo) : 80}px, 1fr))`;
        const gap = properties.CellPadding;
        element.style.gap = gap?.type === "UDim2" ? `${Math.max(0, gap.yo)}px ${Math.max(0, gap.xo)}px` : "0px";
      }
    }
  }

  function buildPreviewNode(node) {
    const definition = CLASS_SCHEMA.get(node.className);
    if (definition.modifier) return null;
    const properties = node.properties;
    const isRoot = node.className === "ScreenGui";
    const element = document.createElement(definition.button ? "button" : "div");
    element.className = `roblox-preview-instance class-${node.className.toLowerCase()}`;
    element.dataset.instance = node.variable;
    element.title = `${node.className} · ${properties.Name?.value || node.variable}`;
    if (!isRoot) {
      element.style.width = udimCss(properties.Size, "x", definition.text ? "180px" : "160px");
      element.style.height = udimCss(properties.Size, "y", definition.text ? "44px" : "100px");
      element.style.left = udimCss(properties.Position, "x", "0px");
      element.style.top = udimCss(properties.Position, "y", "0px");
      const anchor = properties.AnchorPoint?.type === "Vector2" ? properties.AnchorPoint : { x: 0, y: 0 };
      element.style.transform = `translate(${-anchor.x * 100}%, ${-anchor.y * 100}%) rotate(${numberValue(properties, "Rotation", 0)}deg)`;
      const backgroundAlpha = 1 - Math.min(1, Math.max(0, numberValue(properties, "BackgroundTransparency", 0)));
      element.style.backgroundColor = colorCss(properties.BackgroundColor3, definition.text ? "transparent" : `rgb(40 60 56 / ${backgroundAlpha})`, backgroundAlpha);
      element.style.zIndex = String(Math.max(0, Math.round(numberValue(properties, "ZIndex", 1))));
      element.hidden = properties.Visible?.type === "boolean" && !properties.Visible.value;
      if (definition.text) {
        element.textContent = properties.Text?.value || properties.Name?.value || node.variable;
        element.style.color = colorCss(properties.TextColor3, "white");
        element.style.fontSize = `${Math.max(8, numberValue(properties, "TextSize", 18))}px`;
        element.style.whiteSpace = properties.TextWrapped?.value ? "normal" : "nowrap";
        element.style.justifyContent = properties.TextXAlignment?.value === "Left" ? "flex-start" : properties.TextXAlignment?.value === "Right" ? "flex-end" : "center";
      }
      if (definition.image) {
        element.dataset.image = properties.Image?.value || "";
        element.textContent = properties.Image?.value ? "Imagem Roblox" : "Image";
      }
    }
    applyModifiers(element, node);
    for (const child of node.children) {
      const childElement = buildPreviewNode(child);
      if (childElement) element.append(childElement);
    }
    return element;
  }

  function renderPreview(model) {
    const host = document.getElementById("roblox-ui-preview");
    if (!host) return;
    host.replaceChildren();
    const screen = document.createElement("div");
    screen.className = "roblox-preview-screen";
    for (const root of model.roots) {
      const element = buildPreviewNode(root);
      if (element) screen.append(element);
    }
    if (!screen.children.length) {
      const empty = document.createElement("p");
      empty.className = "roblox-preview-empty";
      empty.textContent = "Crie uma ScreenGui ou Frame para iniciar o preview.";
      screen.append(empty);
    }
    host.append(screen);
  }

  function escapeXml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function serializeProperty(name, value) {
    if (value.type === "string") {
      if (name === "Image") return `<Content name="${name}"><url>${escapeXml(value.value)}</url></Content>`;
      return `<string name="${name}">${escapeXml(value.value)}</string>`;
    }
    if (value.type === "boolean") return `<bool name="${name}">${value.value}</bool>`;
    if (value.type === "number") return `<float name="${name}">${value.value}</float>`;
    if (value.type === "enum") {
      const enumTokens = {
        TextXAlignment: { Left: 0, Right: 1, Center: 2 },
        TextYAlignment: { Top: 0, Center: 1, Bottom: 2 },
        FillDirection: { Horizontal: 0, Vertical: 1 },
        SortOrder: { Name: 0, LayoutOrder: 1, Custom: 2 },
        ScaleType: { Stretch: 0, Slice: 1, Tile: 2, Fit: 3, Crop: 4 },
        ScrollingDirection: { X: 1, Y: 2, XY: 4 },
      };
      const token = enumTokens[value.enumType]?.[value.value];
      return Number.isInteger(token) ? `<token name="${name}">${token}</token>` : "";
    }
    if (value.type === "Color3") return `<Color3 name="${name}"><R>${value.r}</R><G>${value.g}</G><B>${value.b}</B></Color3>`;
    if (value.type === "Vector2") return `<Vector2 name="${name}"><X>${value.x}</X><Y>${value.y}</Y></Vector2>`;
    if (value.type === "UDim") return `<UDim name="${name}"><S>${value.scale}</S><O>${value.offset}</O></UDim>`;
    if (value.type === "UDim2") return `<UDim2 name="${name}"><XS>${value.xs}</XS><XO>${value.xo}</XO><YS>${value.ys}</YS><YO>${value.yo}</YO></UDim2>`;
    return "";
  }

  function serializeNode(node, referents) {
    const referent = referents.get(node.variable);
    const properties = { Name: { type: "string", value: node.properties.Name?.value || node.variable }, ...node.properties };
    const children = node.children.map((child) => serializeNode(child, referents)).join("");
    return `<Item class="${node.className}" referent="${referent}"><Properties>${Object.entries(properties).map(([name, value]) => serializeProperty(name, value)).join("")}</Properties>${children}</Item>`;
  }

  function serializeRbxmx(model) {
    const referents = new Map([...model.nodes.keys()].map((variable, index) => [variable, `RBX${index + 1}`]));
    return `<?xml version="1.0" encoding="utf-8"?><roblox version="4">${model.roots.map((root) => serializeNode(root, referents)).join("")}</roblox>`;
  }

  function exportRbxmx(model) {
    const xml = serializeRbxmx(model);
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "NeonInterface.rbxmx";
    link.click();
    URL.revokeObjectURL(url);
  }

  function diagnosticsHtml(model, escapeHtml) {
    if (!model.warnings.length) return '<div class="visualizer-clean">Nenhum problema encontrado no subconjunto visual.</div>';
    return model.warnings.map((warning) => `<li class="${warning.level}"><span>L${warning.line}</span><p>${escapeHtml(warning.message)}</p></li>`).join("");
  }

  function treeHtml(nodes, icon, escapeHtml) {
    const walk = (node, depth) => `<li style="--tree-depth:${depth}">${icon(CLASS_SCHEMA.get(node.className)?.icon || "box")}<span><strong>${escapeHtml(node.properties.Name?.value || node.variable)}</strong><small>${node.className} · ${node.variable}</small></span></li>${node.children.map((child) => walk(child, depth + 1)).join("")}`;
    return nodes.map((node) => walk(node, 0)).join("");
  }

  function render({ icon, escapeHtml }) {
    const project = readProject();
    lastModel = parse(project.code);
    const markup = `<header class="page-header"><div><div class="eyebrow">${icon("panels-top-left")} Roblox UI Lab</div><h1>Interpretador Visualizador de Interface Gráfica</h1><p class="lead">Converta um subconjunto seguro de Luau em árvore, preview e modelo XML importável no Roblox Studio.</p></div><div class="header-actions"><button class="button" type="button" data-ui-load-sample>${icon("file-code-2")} Exemplo</button><button class="button primary" type="button" data-ui-export ${lastModel.nodes.size ? "" : "disabled"}>${icon("download")} Exportar RBXMX</button></div></header>
      <section class="visualizer-notice">${icon("shield-check")}<p><strong>Preview sem execução.</strong> O interpretador aceita somente classes e propriedades indexadas. <code>Instance.new("MainGui")</code> é corrigido para <code>ScreenGui</code> com nome <code>MainGui</code>.</p></section>
      <section class="visualizer-layout">
        <div class="visualizer-editor-panel"><div class="visualizer-toolbar"><label><input type="checkbox" role="switch" data-ui-mode ${project.guiMode ? "checked" : ""}> Habilitar Modo de Interface Gráfica</label><span>${lastModel.strict ? "--!strict ativo" : "modo não estrito"}</span></div><textarea id="ui-visualizer-code" spellcheck="false" aria-label="Código Luau para visualizar">${escapeHtml(project.code)}</textarea></div>
        <div class="visualizer-preview-panel"><div class="visualizer-panel-title"><span>Preview responsivo</span><small>1600 × 900 virtual</small></div><div id="roblox-ui-preview"></div></div>
        <aside class="visualizer-inspector"><section><h2>Explorer</h2><ul class="instance-tree">${treeHtml(lastModel.roots, icon, escapeHtml)}</ul></section><section><h2>Diagnósticos</h2><ul class="visualizer-diagnostics">${diagnosticsHtml(lastModel, escapeHtml)}</ul></section><section><h2>Índice carregado</h2><p>${CLASS_SCHEMA.size} classes · ${new Set([...PROPERTY_INDEX.values()].flatMap((set) => [...set])).size} propriedades · ${ROBLOX_SERVICES.length} serviços.</p></section></aside>
      </section>
      <section class="visualizer-export-note"><strong>Fluxo recomendado</strong><span>Preview → exportar <code>.rbxmx</code> → importar no Studio → validar propriedades → salvar como <code>.rbxm</code> no Studio.</span></section>`;
    queueMicrotask(() => renderPreview(lastModel));
    return markup;
  }

  function updateFromEditor(context) {
    const editor = document.getElementById("ui-visualizer-code");
    if (!editor) return;
    const project = readProject();
    project.code = editor.value;
    saveProject(project);
    lastModel = parse(project.code);
    context.rerender();
  }

  function handleClick(event, context) {
    if (event.target.closest("[data-ui-load-sample]")) {
      saveProject({ ...readProject(), code: SAMPLE });
      context.rerender();
      return true;
    }
    if (event.target.closest("[data-ui-export]")) {
      if (lastModel?.nodes.size) {
        exportRbxmx(lastModel);
        context.showToast("RBXMX exportado. Valide o modelo no Roblox Studio.");
      }
      return true;
    }
    return false;
  }

  function handleChange(event, context) {
    const mode = event.target.closest("[data-ui-mode]");
    if (!mode) return false;
    const project = readProject();
    project.guiMode = mode.checked;
    saveProject(project);
    context.rerender();
    return true;
  }

  let inputTimer = 0;
  function handleInput(event, context) {
    if (event.target.id !== "ui-visualizer-code") return false;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => updateFromEditor(context), 280);
    return true;
  }

  window.NeonRobloxUI = Object.freeze({ CLASS_SCHEMA, PROPERTY_INDEX, ROBLOX_SERVICES, parse, serializeRbxmx, render, handleClick, handleChange, handleInput });
})();
