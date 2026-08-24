(function () {
  "use strict";

  const STORAGE_KEY = "jarvis-local-memory-v1";
  const VOICE_KEY = "jarvis-local-voice-v1";

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  const state = {
    listening: false,
    recognition: null,
    lastAnswer: "",
    voices: [],
    memory: loadMemory(),
    settings: loadVoiceSettings()
  };

  const commands = [
    ["Jarvis, status", "Mostra data, hora, tarefas e notas salvas."],
    ["Lembre que ...", "Salva uma nota na memória local."],
    ["Criar tarefa ...", "Adiciona uma tarefa na lista."],
    ["Concluir tarefa ...", "Remove tarefa pelo texto ou número."],
    ["Listar tarefas", "Lê suas tarefas atuais."],
    ["Abrir guia Roblox", "Abre o guia de sistemas criado no projeto."],
    ["Modo Roblox", "Sugere o próximo serviço para construir."],
    ["Planejar update ...", "Cria um plano curto de atualização."],
    ["Limpar memória", "Apaga notas e tarefas locais."],
    ["Parar de ouvir", "Desliga a escuta contínua."]
  ];

  const statusLabel = document.getElementById("status-label");
  const heardText = document.getElementById("heard-text");
  const chatLog = document.getElementById("chat-log");
  const notesList = document.getElementById("notes-list");
  const tasksList = document.getElementById("tasks-list");
  const commandList = document.getElementById("command-list");
  const listenButton = document.getElementById("listen-button");
  const stopButton = document.getElementById("stop-button");
  const speakButton = document.getElementById("speak-button");
  const clearChat = document.getElementById("clear-chat");
  const textForm = document.getElementById("text-form");
  const textInput = document.getElementById("text-input");
  const voiceSelect = document.getElementById("voice-select");
  const rateInput = document.getElementById("rate-input");

  function loadMemory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { notes: [], tasks: [], history: [] };
    } catch (_error) {
      return { notes: [], tasks: [], history: [] };
    }
  }

  function saveMemory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memory));
    renderMemory();
  }

  function loadVoiceSettings() {
    try {
      return JSON.parse(localStorage.getItem(VOICE_KEY)) || { voiceURI: "", rate: 1 };
    } catch (_error) {
      return { voiceURI: "", rate: 1 };
    }
  }

  function saveVoiceSettings() {
    localStorage.setItem(VOICE_KEY, JSON.stringify(state.settings));
  }

  function normalize(text) {
    return text
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function setStatus(message, mode) {
    statusLabel.textContent = message;
    document.body.classList.toggle("listening", mode === "listening");
    document.body.classList.toggle("error", mode === "error");
  }

  function addMessage(author, text) {
    const article = document.createElement("article");
    article.className = `message ${author}`;
    article.innerHTML = `<small>${author === "user" ? "Você" : "Jarvis"}</small><p>${escapeHtml(text)}</p>`;
    chatLog.appendChild(article);
    chatLog.scrollTop = chatLog.scrollHeight;

    state.memory.history.push({ author, text, at: Date.now() });
    state.memory.history = state.memory.history.slice(-80);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.memory));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function speak(text) {
    if (!synth) {
      setStatus("Este navegador não oferece síntese de voz.", "error");
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = Number(state.settings.rate) || 1;

    const chosen = state.voices.find((voice) => voice.voiceURI === state.settings.voiceURI);
    if (chosen) {
      utterance.voice = chosen;
    }

    synth.speak(utterance);
  }

  function answer(text, shouldSpeak) {
    state.lastAnswer = text;
    addMessage("assistant", text);
    if (shouldSpeak !== false) {
      speak(text);
    }
  }

  function handleCommand(rawText, fromVoice) {
    const text = rawText.trim();
    if (!text) return;

    const clean = normalize(text).replace(/^jarvis[, ]*/, "");
    heardText.textContent = text;
    addMessage("user", text);

    if (matches(clean, ["parar de ouvir", "parar escuta", "desligar microfone"])) {
      stopListening();
      answer("Escuta pausada. Continuo aqui quando você quiser voltar.", true);
      return;
    }

    if (matches(clean, ["status", "relatorio", "resumo"])) {
      const now = new Date();
      answer(`Agora são ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Você tem ${state.memory.tasks.length} tarefa(s) e ${state.memory.notes.length} nota(s) salvas.`, true);
      return;
    }

    if (clean.startsWith("lembre que ") || clean.startsWith("lembrar que ")) {
      const note = text.replace(/^jarvis[, ]*/i, "").replace(/^lembre que\s*/i, "").replace(/^lembrar que\s*/i, "").trim();
      if (note) {
        state.memory.notes.unshift(note);
        state.memory.notes = state.memory.notes.slice(0, 30);
        saveMemory();
        answer(`Memória salva: ${note}`, true);
      }
      return;
    }

    if (clean.startsWith("criar tarefa ") || clean.startsWith("adicionar tarefa ") || clean.startsWith("nova tarefa ")) {
      const task = text
        .replace(/^jarvis[, ]*/i, "")
        .replace(/^(criar tarefa|adicionar tarefa|nova tarefa)\s*/i, "")
        .trim();
      if (task) {
        state.memory.tasks.push({ title: task, createdAt: Date.now() });
        saveMemory();
        answer(`Tarefa criada: ${task}`, true);
      }
      return;
    }

    if (matches(clean, ["listar tarefas", "minhas tarefas", "ler tarefas"])) {
      if (!state.memory.tasks.length) {
        answer("Você ainda não tem tarefas salvas.", true);
      } else {
        answer(`Suas tarefas: ${state.memory.tasks.map((task, index) => `${index + 1}. ${task.title}`).join("; ")}.`, true);
      }
      return;
    }

    if (clean.startsWith("concluir tarefa ") || clean.startsWith("remover tarefa ")) {
      const target = clean.replace(/^(concluir tarefa|remover tarefa)\s*/, "").trim();
      const removed = removeTask(target);
      answer(removed ? `Tarefa concluída: ${removed.title}` : "Não encontrei essa tarefa.", true);
      return;
    }

    if (matches(clean, ["limpar memoria", "apagar memoria", "resetar memoria"])) {
      state.memory.notes = [];
      state.memory.tasks = [];
      saveMemory();
      answer("Memória local limpa. Histórico visual continua na tela até você limpar a conversa.", true);
      return;
    }

    if (matches(clean, ["abrir guia roblox", "abrir guia", "abrir sistemas"])) {
      window.open("../economy-systems-guide/index.html", "_blank");
      answer("Abrindo o guia Roblox em outra aba.", true);
      return;
    }

    if (clean.includes("modo roblox") || clean.includes("proximo sistema") || clean.includes("o que criar agora")) {
      answer("Modo Roblox ativado. Eu começaria por PlayerDataService, ConfigService, RemoteGatewayService, TransactionService e MigrationService. Depois disso, você consegue criar economia, eventos e updates sem virar uma novela de bugs.", true);
      return;
    }

    if (clean.startsWith("planejar update") || clean.startsWith("planejar atualizacao")) {
      const idea = text.replace(/^jarvis[, ]*/i, "").replace(/^(planejar update|planejar atualização|planejar atualizacao)\s*/i, "").trim();
      answer(planUpdate(idea), true);
      return;
    }

    if (clean.includes("cframe")) {
      answer("CFrame é posição mais orientação. Para placement de tycoon, salve offset local com ToObjectSpace e recoloque com ToWorldSpace ou PivotTo.", true);
      return;
    }

    if (clean.includes("humanoid")) {
      answer("Humanoid controla vida, movimento e estados do personagem. A regra de dano, recompensa e permissão deve ficar no servidor, não no cliente.", true);
      return;
    }

    if (clean.includes("datastore") || clean.includes("profilestore") || clean.includes("storage")) {
      answer("Para save sério, use um serviço de perfil como dono único. DataStore salva dados simples; CFrame, Vector3 e objetos precisam ser serializados em tabelas.", true);
      return;
    }

    answer(makeConversationalReply(text, fromVoice), true);
  }

  function matches(text, options) {
    return options.some((option) => text === option || text.includes(option));
  }

  function removeTask(target) {
    if (!target) return null;

    const asNumber = Number(target);
    let index = Number.isInteger(asNumber) ? asNumber - 1 : -1;
    if (index < 0 || index >= state.memory.tasks.length) {
      index = state.memory.tasks.findIndex((task) => normalize(task.title).includes(target));
    }

    if (index < 0) return null;
    const removed = state.memory.tasks.splice(index, 1)[0];
    saveMemory();
    return removed;
  }

  function planUpdate(idea) {
    const subject = idea || "o próximo update";
    return `Plano para ${subject}: 1. defina a feature flag; 2. liste dados novos e migração; 3. crie teste com player novo e player antigo; 4. valide economia e recompensas; 5. publique com patch notes; 6. monitore erros, funil e saldo médio depois do lançamento.`;
  }

  function makeConversationalReply(text, fromVoice) {
    const clean = normalize(text);

    if (clean.includes("oi") || clean.includes("ola") || clean.includes("bom dia") || clean.includes("boa noite")) {
      return "Estou online. Pode falar comigo por voz ou digitar comandos. Se quiser trabalhar no jogo, diga: modo Roblox.";
    }

    if (clean.includes("ajuda") || clean.includes("comandos")) {
      return "Você pode dizer: status, lembre que, criar tarefa, listar tarefas, concluir tarefa, abrir guia Roblox, modo Roblox ou planejar update.";
    }

    if (clean.includes("obrigado") || clean.includes("valeu")) {
      return "Sempre. Vamos deixando seu setup mais afiado, uma peça por vez.";
    }

    if (fromVoice) {
      return "Entendi. Ainda sou um Jarvis local por comandos, sem modelo de IA externo. Posso salvar isso como nota se você disser: lembre que, seguido da ideia.";
    }

    return "Recebi. Para eu agir melhor, use um comando direto como criar tarefa, lembre que, planejar update ou modo Roblox.";
  }

  function setupRecognition() {
    if (!SpeechRecognition) {
      setStatus("Reconhecimento de voz indisponível neste navegador.", "error");
      answer("Seu navegador não expôs SpeechRecognition. Abra no Chrome ou Edge e permita o microfone para usar voz.", false);
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      state.listening = true;
      setStatus("Ouvindo continuamente", "listening");
      listenButton.querySelector("span:last-child").textContent = "Escutando";
    };

    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0].transcript;
        if (event.results[index].isFinal) {
          handleCommand(transcript, true);
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        heardText.textContent = interim;
      }
    };

    recognition.onerror = (event) => {
      setStatus(`Erro de voz: ${event.error}`, "error");
    };

    recognition.onend = () => {
      if (state.listening) {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch (_error) {
            setStatus("Aguardando microfone", "error");
          }
        }, 500);
      } else {
        setStatus("Escuta pausada", "");
        listenButton.querySelector("span:last-child").textContent = "Iniciar escuta";
      }
    };

    return recognition;
  }

  function startListening() {
    if (!state.recognition) {
      state.recognition = setupRecognition();
    }

    if (!state.recognition) return;

    try {
      state.listening = true;
      state.recognition.start();
    } catch (_error) {
      setStatus("A escuta já está ativa.", "listening");
    }
  }

  function stopListening() {
    state.listening = false;
    if (state.recognition) {
      state.recognition.stop();
    }
    setStatus("Escuta pausada", "");
    listenButton.querySelector("span:last-child").textContent = "Iniciar escuta";
  }

  function renderCommands() {
    commandList.innerHTML = commands.map(([title, description]) => `
      <article class="command">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </article>
    `).join("");
  }

  function renderMemory() {
    notesList.innerHTML = state.memory.notes.length
      ? state.memory.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")
      : "<li>Nenhuma nota ainda.</li>";

    tasksList.innerHTML = state.memory.tasks.length
      ? state.memory.tasks.map((task, index) => `<li>${index + 1}. ${escapeHtml(task.title)}</li>`).join("")
      : "<li>Nenhuma tarefa ainda.</li>";
  }

  function renderHistory() {
    chatLog.innerHTML = "";
    state.memory.history.slice(-18).forEach((message) => {
      const article = document.createElement("article");
      article.className = `message ${message.author}`;
      article.innerHTML = `<small>${message.author === "user" ? "Você" : "Jarvis"}</small><p>${escapeHtml(message.text)}</p>`;
      chatLog.appendChild(article);
    });
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function loadVoices() {
    state.voices = synth ? synth.getVoices() : [];
    const preferred = state.voices.filter((voice) => voice.lang.toLocaleLowerCase("pt-BR").startsWith("pt"));
    const ordered = preferred.concat(state.voices.filter((voice) => !preferred.includes(voice)));

    voiceSelect.innerHTML = ordered.length
      ? ordered.map((voice) => `<option value="${escapeHtml(voice.voiceURI)}">${escapeHtml(`${voice.name} (${voice.lang})`)}</option>`).join("")
      : "<option value=\"\">Voz padrão do navegador</option>";

    if (state.settings.voiceURI) {
      voiceSelect.value = state.settings.voiceURI;
    }
  }

  listenButton.addEventListener("click", startListening);
  stopButton.addEventListener("click", stopListening);
  speakButton.addEventListener("click", () => {
    if (state.lastAnswer) {
      speak(state.lastAnswer);
    } else {
      speak("Ainda não existe uma resposta para repetir.");
    }
  });

  clearChat.addEventListener("click", () => {
    state.memory.history = [];
    saveMemory();
    renderHistory();
    answer("Conversa limpa.", false);
  });

  textForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    textInput.value = "";
    handleCommand(text, false);
  });

  voiceSelect.addEventListener("change", () => {
    state.settings.voiceURI = voiceSelect.value;
    saveVoiceSettings();
  });

  rateInput.addEventListener("input", () => {
    state.settings.rate = Number(rateInput.value);
    saveVoiceSettings();
  });

  if (synth) {
    synth.addEventListener("voiceschanged", loadVoices);
  }

  rateInput.value = state.settings.rate;
  renderCommands();
  renderMemory();
  renderHistory();
  loadVoices();
  answer("Jarvis local iniciado. Para voz, clique em iniciar escuta e permita o microfone no navegador.", false);
})();
