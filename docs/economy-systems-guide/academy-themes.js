(function () {
  "use strict";

  const SETTINGS_KEY = "neon-academy-theme-studio-v1";
  let activeObjectUrl = "";
  let pexelsResults = [];

  const THEMES = [
    ["neon", "Neon original", "teal", "included"],
    ["purple", "Roxo orbital", "purple", "plus"],
    ["blue", "Azul profundo", "blue", "plus"],
    ["yellow", "Solar amarelo", "yellow", "plus"],
    ["cyan", "Ciano elétrico", "cyan", "plus"],
    ["red", "Vermelho reactor", "red", "plus"],
    ["pink", "Rosa holográfico", "pink", "plus"],
    ["orange", "Laranja forge", "orange", "plus"],
    ["black", "Blackout", "black", "plus"],
    ["monochrome", "Preto e branco", "monochrome", "plus"],
    ["white", "White lab", "white", "plus"],
    ["mythic", "Mythic prism", "mythic", "mythic"],
    ["legendary", "Legendary core", "legendary", "legendary"],
    ["cute", "Cute pixels", "cute", "legendary"],
  ].map(([id, name, swatch, tier]) => ({ id, name, swatch, tier }));

  function defaults() {
    return {
      themeId: "neon",
      gradientText: false,
      cframeDecorations: true,
      flatTexture: true,
      mediaKind: "none",
      mediaUrl: "",
      mediaCredit: null,
      localAssetId: "",
    };
  }

  function readSettings() {
    try {
      return { ...defaults(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch {
      return defaults();
    }
  }

  function writeSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function releaseObjectUrl() {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  }

  function renderBackground(settings) {
    const host = document.getElementById("theme-media-background");
    const credit = document.getElementById("theme-media-credit");
    if (!host) return;
    releaseObjectUrl();
    host.replaceChildren();
    host.hidden = settings.mediaKind === "none";
    if (credit) {
      credit.hidden = !settings.mediaCredit;
      credit.href = settings.mediaCredit?.pexelsUrl || "https://www.pexels.com";
      credit.textContent = settings.mediaCredit ? `Mídia por ${settings.mediaCredit.creatorName} no Pexels` : "";
    }
    if (settings.mediaKind === "none") return;

    const attach = (source, mimeType = "") => {
      const isVideo = settings.mediaKind === "video" || mimeType.startsWith("video/");
      const media = document.createElement(isVideo ? "video" : "img");
      media.src = source;
      media.className = "theme-background-media";
      media.setAttribute("aria-hidden", "true");
      if (isVideo) {
        media.autoplay = true;
        media.loop = true;
        media.muted = true;
        media.playsInline = true;
      } else {
        media.alt = "";
      }
      host.append(media);
    };

    if (settings.localAssetId && window.NeonAssetCache) {
      window.NeonAssetCache.get(settings.localAssetId).then((record) => {
        if (!record?.blob || readSettings().localAssetId !== settings.localAssetId) return;
        activeObjectUrl = URL.createObjectURL(record.blob);
        attach(activeObjectUrl, record.mimeType);
      }).catch(() => {});
    } else if (/^https:\/\//i.test(settings.mediaUrl)) {
      attach(settings.mediaUrl);
    }
  }

  function apply(settings = readSettings()) {
    document.documentElement.dataset.academyTheme = settings.themeId;
    document.body.dataset.gradientText = String(settings.gradientText);
    document.body.dataset.cframeDecorations = String(settings.cframeDecorations);
    document.body.dataset.flatTexture = String(settings.flatTexture);
    renderBackground(settings);
    window.dispatchEvent(new CustomEvent("neon:theme-applied", { detail: settings }));
  }

  function canUse(theme, plusActive) {
    if (theme.tier === "included") return true;
    if (theme.tier === "plus") return plusActive === true;
    return false;
  }

  function enforceEntitlement(plusActive) {
    const settings = readSettings();
    const selectedTheme = THEMES.find((theme) => theme.id === settings.themeId);
    const themeAllowed = selectedTheme && canUse(selectedTheme, plusActive);
    const plusFeaturesAllowed = plusActive || (settings.mediaKind === "none" && !settings.gradientText);
    if (themeAllowed && plusFeaturesAllowed) return false;
    const reset = plusActive
      ? { ...settings, themeId: "neon" }
      : { ...settings, themeId: "neon", gradientText: false, cframeDecorations: true, flatTexture: true, mediaKind: "none", mediaUrl: "", mediaCredit: null, localAssetId: "" };
    writeSettings(reset);
    apply(reset);
    return true;
  }

  function themeCard(theme, selected, plusActive, icon) {
    const locked = !canUse(theme, plusActive);
    const premium = ["mythic", "legendary"].includes(theme.tier);
    const lockMessage = premium ? "Pacote premium aguardando preço e checkout" : "Tema exclusivo Plus";
    return `<article class="theme-card ${selected ? "selected" : ""} ${premium ? "premium" : ""}" data-theme-preview="${theme.id}">
      <div class="theme-swatch theme-swatch-${theme.swatch}"><i></i><b></b><span>${icon(theme.id === "cute" ? "heart" : premium ? "sparkles" : "palette")}</span></div>
      <div><span class="theme-tier">${theme.tier === "included" ? "Padrão" : theme.tier === "plus" ? "Plus" : theme.tier}</span><h3>${theme.name}</h3></div>
      <button class="icon-button" type="button" data-apply-academy-theme="${theme.id}" ${locked ? "disabled" : ""} aria-label="${locked ? lockMessage : "Aplicar tema"}" title="${locked ? lockMessage : "Aplicar tema"}">${icon(locked ? "lock-keyhole" : selected ? "circle-check-big" : "paintbrush")}</button>
    </article>`;
  }

  function render({ plusActive, icon, escapeHtml }) {
    const settings = readSettings();
    const credit = settings.mediaCredit;
    return `<header class="page-header theme-studio-header"><div><div class="eyebrow">${icon("palette")} Personalização Plus</div><h1>Theme Studio</h1><p class="lead">Mude toda a interface, combine movimento e escolha um fundo que continue legível durante o estudo.</p></div><div class="header-actions"><span class="entitlement-badge ${plusActive ? "active" : ""}">${icon(plusActive ? "badge-check" : "lock-keyhole")} ${plusActive ? "Plus ativo" : "Requer Plus"}</span></div></header>
      <section class="theme-grid">${THEMES.map((theme) => themeCard(theme, settings.themeId === theme.id, plusActive, icon)).join("")}</section>
      <section class="theme-controls content-section">
        <div class="section-heading"><div><div class="eyebrow">Composição</div><h2>Movimento e textura</h2></div><p>Cada efeito pode ser desligado separadamente e respeita movimento reduzido.</p></div>
        <div class="settings-list compact">
          ${[["gradientText", "Gradiente nos títulos", "Cores percorrem títulos e destaques."], ["cframeDecorations", "CFrames decorativos", "Cubos rotacionam ao redor dos cabeçalhos."], ["flatTexture", "Textura 2D animada", "Uma malha plana se move atrás da página."]].map(([key, title, description]) => `<label><span class="settings-icon">${icon(key === "gradientText" ? "type" : key === "cframeDecorations" ? "box" : "grid-3x3")}</span><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" role="switch" data-theme-setting="${key}" ${settings[key] ? "checked" : ""} ${plusActive ? "" : "disabled"}></label>`).join("")}
        </div>
      </section>
      <section class="theme-media-workbench content-section">
        <div class="section-heading"><div><div class="eyebrow">Background pessoal</div><h2>Imagem local ou vídeo Pexels</h2></div><p>Arquivos locais ficam no IndexedDB deste navegador. Limite inicial: 60 itens, 25 MB por item.</p></div>
        <div class="theme-media-actions">
          <label class="button ${plusActive ? "" : "disabled"}">${icon("image-up")} Escolher arquivo<input type="file" data-theme-local-media accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" ${plusActive ? "" : "disabled"}></label>
          <button class="button" type="button" data-theme-clear-media ${settings.mediaKind === "none" ? "disabled" : ""}>${icon("eraser")} Remover fundo</button>
        </div>
        <form class="pexels-search" data-pexels-search>
          <label><span>Buscar mídia</span><input name="query" type="search" minlength="2" maxlength="60" placeholder="Ex.: neon technology, coding, space" required ${plusActive ? "" : "disabled"}></label>
          <label><span>Tipo</span><select name="type" ${plusActive ? "" : "disabled"}><option value="video">Vídeo</option><option value="photo">Imagem</option></select></label>
          <button class="button primary" type="submit" ${plusActive ? "" : "disabled"}>${icon("search")} Buscar no Pexels</button>
        </form>
        <div class="pexels-results" id="pexels-results">${pexelsResults.map((item) => `<article><div>${item.type === "video" ? `<video src="${escapeHtml(item.previewUrl)}" muted loop playsinline preload="metadata"></video>` : `<img src="${escapeHtml(item.previewUrl)}" alt="">`}</div><span>${escapeHtml(item.creatorName)}</span><button class="button" type="button" data-use-pexels="${escapeHtml(item.id)}">Usar fundo</button></article>`).join("")}</div>
        ${credit ? `<p class="pexels-credit">Mídia por <a href="${escapeHtml(credit.creatorUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(credit.creatorName)}</a> no <a href="${escapeHtml(credit.pexelsUrl)}" target="_blank" rel="noopener noreferrer">Pexels</a>.</p>` : '<p class="pexels-credit"><a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">Mídia fornecida pelo Pexels</a></p>'}
      </section>`;
  }

  async function handleClick(event, context) {
    const applyTarget = event.target.closest("[data-apply-academy-theme]");
    if (applyTarget) {
      const theme = THEMES.find((candidate) => candidate.id === applyTarget.dataset.applyAcademyTheme);
      if (!theme || !canUse(theme, context.plusActive)) return true;
      const settings = readSettings();
      settings.themeId = applyTarget.dataset.applyAcademyTheme;
      writeSettings(settings);
      apply(settings);
      context.rerender();
      context.showToast("Tema aplicado em toda a Academy.");
      return true;
    }
    const clearTarget = event.target.closest("[data-theme-clear-media]");
    if (clearTarget) {
      const settings = readSettings();
      settings.mediaKind = "none";
      settings.mediaUrl = "";
      settings.mediaCredit = null;
      settings.localAssetId = "";
      writeSettings(settings);
      apply(settings);
      context.rerender();
      return true;
    }
    const pexelsTarget = event.target.closest("[data-use-pexels]");
    if (pexelsTarget) {
      const item = pexelsResults.find((candidate) => candidate.id === pexelsTarget.dataset.usePexels);
      if (!item || !context.plusActive) return true;
      const settings = readSettings();
      settings.mediaKind = item.type === "video" ? "video" : "image";
      settings.mediaUrl = item.mediaUrl;
      settings.mediaCredit = { creatorName: item.creatorName, creatorUrl: item.creatorUrl, pexelsUrl: item.pexelsUrl };
      settings.localAssetId = "";
      writeSettings(settings);
      apply(settings);
      context.rerender();
      context.showToast("Background Pexels aplicado.");
      return true;
    }
    return false;
  }

  async function handleChange(event, context) {
    const settingInput = event.target.closest("[data-theme-setting]");
    if (settingInput) {
      if (!context.plusActive) return true;
      const settings = readSettings();
      settings[settingInput.dataset.themeSetting] = settingInput.checked;
      writeSettings(settings);
      apply(settings);
      return true;
    }
    const fileInput = event.target.closest("[data-theme-local-media]");
    if (fileInput) {
      const file = fileInput.files?.[0];
      if (!file || !context.plusActive) return true;
      try {
        const record = await window.NeonAssetCache.put({
          name: file.name,
          kind: file.type.startsWith("video/") ? "video" : "image",
          mimeType: file.type,
          blob: file,
        });
        const settings = readSettings();
        settings.mediaKind = record.kind;
        settings.mediaUrl = "";
        settings.mediaCredit = null;
        settings.localAssetId = record.id;
        writeSettings(settings);
        apply(settings);
        context.rerender();
        context.showToast("Arquivo salvo apenas neste navegador.");
      } catch (error) {
        context.showToast(error.message === "CacheItemLimit" ? "O cache local atingiu 60 itens." : "O arquivo excede 25 MB ou não pôde ser salvo.");
      }
      return true;
    }
    return false;
  }

  async function handleSubmit(event, context) {
    const form = event.target.closest("[data-pexels-search]");
    if (!form) return false;
    event.preventDefault();
    if (!context.plusActive) return true;
    const data = new FormData(form);
    const query = String(data.get("query") || "").trim();
    const type = data.get("type") === "photo" ? "photo" : "video";
    try {
      const response = await fetch(`/api/backgrounds/pexels/search?type=${type}&query=${encodeURIComponent(query)}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "PexelsUnavailable");
      pexelsResults = Array.isArray(payload.items) ? payload.items : [];
      context.rerender();
      context.showToast(`${pexelsResults.length} opções encontradas.`);
    } catch (error) {
      context.showToast(error.message === "PlusRequired" ? "Este recurso requer Plus ativo." : "Configure PEXELS_API_KEY no Render para pesquisar.");
    }
    return true;
  }

  apply();
  window.NeonThemeStudio = Object.freeze({ THEMES, apply, readSettings, enforceEntitlement, render, handleClick, handleChange, handleSubmit });
})();
