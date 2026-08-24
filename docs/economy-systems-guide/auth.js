(function () {
  "use strict";

  const statusElement = document.getElementById("auth-status");
  const configWarning = document.getElementById("config-warning");
  const configMessage = document.getElementById("config-message");
  const captchaSlot = document.getElementById("captcha-slot");
  const googleStep = document.getElementById("google-step");
  const googleButton = document.getElementById("google-button");
  const accountPolicy = document.getElementById("account-policy");
  const AUTH_HANDOFF_KEY = "neon-academy-auth-handoff-v1";
  const AUTH_REQUEST_TIMEOUT_MS = 20000;

  try {
    const visualSettings = JSON.parse(localStorage.getItem("neon-academy-visual-settings-v1") || "{}");
    for (const [name, value] of Object.entries(visualSettings)) {
      if (typeof value === "boolean") document.body.dataset[name] = String(value);
    }
  } catch (_error) {
    // Invalid local preferences fall back to the animated defaults.
  }

  let captchaWidgetId = null;
  let captchaToken = "";
  let activeConfig = null;
  let googleInitialized = false;
  let busy = false;
  let retryTimer = null;

  async function fetchWithTimeout(url, options = {}, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      const error = new Error("Authentication server returned an invalid response.");
      error.name = "InvalidServerResponse";
      error.status = response.status;
      throw error;
    }
  }

  function refreshIcons() {
    window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  function setStatus(message, tone = "") {
    statusElement.textContent = message;
    statusElement.className = `auth-status ${tone}`.trim();
  }

  function loadScript(src, id) {
    if (document.getElementById(id)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`Falha ao carregar ${id}.`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function lockGoogleStep(message = "Conclua o CAPTCHA primeiro") {
    captchaToken = "";
    googleStep.classList.remove("ready");
    googleStep.classList.add("locked");
    googleButton.replaceChildren();
    const label = document.createElement("span");
    label.textContent = message;
    googleButton.appendChild(label);
  }

  function renderGoogleButton(config, statusMessage = "Verificação concluída. Escolha sua conta Google.") {
    if (!googleInitialized) {
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      googleInitialized = true;
    }

    googleButton.replaceChildren();
    googleStep.classList.remove("locked");
    googleStep.classList.add("ready");
    window.google.accounts.id.renderButton(googleButton, {
      type: "standard",
      theme: "outline",
      size: "large",
      shape: "rectangular",
      text: "signin_with",
      logo_alignment: "left",
      locale: "pt-BR",
      width: Math.min(320, Math.max(220, googleButton.clientWidth)),
    });
    setStatus(statusMessage, "success");
  }

  function resetCaptcha(message, retryAfterSeconds = 0) {
    clearTimeout(retryTimer);
    if (activeConfig?.recaptchaVersion === "v3") {
      captchaToken = "";
      const waitSeconds = Math.max(0, Math.ceil(Number(retryAfterSeconds) || 0));
      if (waitSeconds > 0) {
        lockGoogleStep(`Aguarde ${waitSeconds}s para tentar novamente`);
        setStatus(message, "error");
        retryTimer = setTimeout(() => {
          renderGoogleButton(activeConfig, "Pode tentar novamente com sua conta Google.");
        }, waitSeconds * 1000);
      } else {
        renderGoogleButton(activeConfig, message);
        statusElement.classList.remove("success");
        statusElement.classList.add("error");
      }
      return;
    }

    lockGoogleStep();
    if (captchaWidgetId !== null && window.grecaptcha) {
      window.grecaptcha.reset(captchaWidgetId);
    }
    setStatus(message, "error");
  }

  async function handleGoogleCredential(response) {
    if (busy || !response?.credential) return;
    busy = true;
    setStatus("Validando CAPTCHA e identidade no servidor...");

    try {
      const token = activeConfig.recaptchaVersion === "v3"
        ? await window.grecaptcha.execute(activeConfig.recaptchaSiteKey, { action: activeConfig.recaptchaAction })
        : captchaToken;
      if (!token) {
        throw new Error("CAPTCHA token unavailable.");
      }

      const authResponse = await fetchWithTimeout("/api/auth/google", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: response.credential,
          captchaToken: token,
        }),
      });
      const payload = await readJsonResponse(authResponse);

      if (!authResponse.ok || !payload.ok) {
        const messages = {
          InvalidCaptcha: "O CAPTCHA expirou ou foi recusado. Tente novamente.",
          GoogleAccountRejected: "Esta conta Google não foi aceita para este site.",
          TooManyAuthAttempts: "Muitas tentativas. Aguarde alguns minutos.",
          InvalidOrigin: "O domínio atual não está autorizado.",
          AccountSuspended: "Esta conta está temporariamente suspensa.",
          AuthStorageUnavailable: "O banco de autenticação está indisponível. Tente novamente em instantes.",
          InvalidAuthRequest: "A solicitação de login ficou inválida. Selecione a conta novamente.",
        };
        const captchaMessages = {
          CaptchaHostnameMismatch: "Este endereço não está autorizado na configuração do reCAPTCHA.",
          CaptchaScoreTooLow: "O reCAPTCHA considerou esta tentativa incomum. Aguarde alguns segundos e tente novamente.",
          CaptchaActionMismatch: "A ação configurada no reCAPTCHA não corresponde ao login.",
          CaptchaRejected: "O Google recusou o token do reCAPTCHA. Confira a chave e os domínios autorizados.",
          CaptchaVerificationUnavailable: "O serviço de verificação do reCAPTCHA está temporariamente indisponível.",
        };
        resetCaptcha(
          captchaMessages[payload.captchaReason] ?? messages[payload.error] ?? "Não foi possível concluir o login.",
          payload.retryAfterSeconds
        );
        return;
      }

      try {
        sessionStorage.setItem(AUTH_HANDOFF_KEY, JSON.stringify({
          createdAt: Date.now(),
          user: payload.user,
        }));
      } catch {
        // The signed cookie remains authoritative when session storage is blocked.
      }
      setStatus(`Bem-vindo, ${payload.user.givenName || payload.user.name}. Abrindo a Academy...`, "success");
      window.location.replace("/");
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      const invalidResponse = error?.name === "InvalidServerResponse";
      resetCaptcha(
        timedOut
          ? "A validação demorou demais porque o servidor ou o banco estava acordando. Tente novamente."
          : invalidResponse
            ? "O servidor respondeu de forma incompleta. Tente novamente em alguns segundos."
            : "A conexão com o servidor de autenticação foi interrompida. Tente novamente."
      );
    } finally {
      busy = false;
    }
  }

  async function initialize() {
    refreshIcons();

    try {
      const sessionResponse = await fetchWithTimeout("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
      }, 12000);
      if (sessionResponse.ok) {
        window.location.replace("/");
        return;
      }

      const configResponse = await fetch("/api/auth/config", { cache: "no-store" });
      const config = await configResponse.json();
      if (!config.configured) {
        captchaSlot.replaceChildren();
        lockGoogleStep("Login indisponível até concluir a configuração");
        configWarning.hidden = false;
        configMessage.textContent = `Preencha no servidor: ${config.missing.join(", ")}.`;
        setStatus("O servidor ainda não possui as credenciais necessárias.", "error");
        refreshIcons();
        return;
      }

      activeConfig = config;

      accountPolicy.textContent = config.allowedEmailDomain
        ? `Somente @${config.allowedEmailDomain}`
        : "Qualquer conta Google verificada";

      const recaptchaScriptUrl = config.recaptchaVersion === "v3"
        ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(config.recaptchaSiteKey)}&hl=pt-BR`
        : "https://www.google.com/recaptcha/api.js?render=explicit&hl=pt-BR";
      await Promise.all([
        loadScript("https://accounts.google.com/gsi/client?hl=pt-BR", "google-identity-script"),
        loadScript(recaptchaScriptUrl, "recaptcha-script"),
      ]);

      if (config.recaptchaVersion === "v3") {
        await new Promise((resolve) => window.grecaptcha.ready(resolve));
        captchaSlot.replaceChildren();
        captchaSlot.classList.add("captcha-automatic");
        const shield = document.createElement("i");
        shield.setAttribute("data-lucide", "shield-check");
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = "Proteção automática ativa";
        const detail = document.createElement("small");
        detail.textContent = "reCAPTCHA v3 verifica o acesso no momento do login";
        copy.append(title, detail);
        captchaSlot.append(shield, copy);
        renderGoogleButton(config, "Proteção automática preparada. Escolha sua conta Google.");
        refreshIcons();
        return;
      }

      captchaSlot.replaceChildren();
      captchaWidgetId = window.grecaptcha.render(captchaSlot, {
        sitekey: config.recaptchaSiteKey,
        theme: "dark",
        size: window.innerWidth < 390 ? "compact" : "normal",
        callback: (token) => {
          captchaToken = token;
          renderGoogleButton(config);
        },
        "expired-callback": () => resetCaptcha("O CAPTCHA expirou. Confirme novamente."),
        "error-callback": () => resetCaptcha("O Google reCAPTCHA não pôde ser carregado."),
      });
      setStatus("Conclua a verificação humana para liberar o login Google.");
    } catch (_error) {
      captchaSlot.replaceChildren();
      lockGoogleStep("Serviços do Google indisponíveis");
      setStatus("Não foi possível preparar o login. Verifique a conexão e o domínio.", "error");
    }
  }

  initialize();
})();
