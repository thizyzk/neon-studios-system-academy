(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.getElementById("pointer-trail");
  const context = canvas?.getContext("2d");
  const trail = [];
  let audioContext = null;
  let animationFrame = null;
  let lastPointAt = 0;

  function setting(name, fallback = true) {
    const value = document.body.dataset[name];
    return value === undefined || value === "" ? fallback : value === "true";
  }

  function resize() {
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function drawTrail() {
    animationFrame = null;
    if (!context || reducedMotion.matches || !setting("mouseTrail")) {
      trail.length = 0;
      context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
      return;
    }
    const now = performance.now();
    while (trail.length && now - trail[0].time > 620) trail.shift();
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (trail.length > 1) {
      context.lineCap = "round";
      context.lineJoin = "round";
      for (let index = 1; index < trail.length; index += 1) {
        const previous = trail[index - 1];
        const point = trail[index];
        const life = Math.max(0, 1 - (now - point.time) / 620);
        const gradient = context.createLinearGradient(previous.x, previous.y, point.x, point.y);
        gradient.addColorStop(0, `hsla(${145 + index * 3}, 92%, 62%, ${life * 0.12})`);
        gradient.addColorStop(0.5, `hsla(${170 + index * 2}, 95%, 68%, ${life * 0.62})`);
        gradient.addColorStop(1, `hsla(${115 + index * 4}, 94%, 61%, ${life * 0.2})`);
        context.strokeStyle = gradient;
        context.lineWidth = 3 + life * 10;
        context.shadowBlur = 18 * life;
        context.shadowColor = `hsla(154, 100%, 62%, ${life})`;
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      }
    }
    context.shadowBlur = 0;
    if (trail.length) animationFrame = requestAnimationFrame(drawTrail);
  }

  function onPointerMove(event) {
    const now = performance.now();
    if (reducedMotion.matches || !setting("mouseTrail") || now - lastPointAt < 18) return;
    lastPointAt = now;
    trail.push({ x: event.clientX, y: event.clientY, time: now });
    if (trail.length > 28) trail.shift();
    if (!animationFrame) animationFrame = requestAnimationFrame(drawTrail);
  }

  function sound(kind) {
    if (!setting("sounds") || reducedMotion.matches) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    const notes = kind === "correct" ? [523.25, 659.25, 783.99] : kind === "level" ? [392, 523.25, 659.25, 1046.5] : [220, 174.61];
    const startedAt = audioContext.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = kind === "wrong" ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startedAt + index * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.12, startedAt + index * 0.07 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + index * 0.07 + 0.22);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(startedAt + index * 0.07);
      oscillator.stop(startedAt + index * 0.07 + 0.24);
    });
  }

  function burst(target, kind = "correct") {
    sound(kind);
    if (!setting("particles") || reducedMotion.matches || !target) return;
    const rect = target.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const count = kind === "level" ? 34 : 22;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("span");
      particle.className = `answer-particle particle-${kind}`;
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.3;
      const distance = 45 + Math.random() * (kind === "level" ? 130 : 80);
      particle.style.left = `${originX}px`;
      particle.style.top = `${originY}px`;
      particle.style.setProperty("--particle-x", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--particle-y", `${Math.sin(angle) * distance}px`);
      particle.style.setProperty("--particle-hue", String(120 + Math.round(Math.random() * 80)));
      document.body.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    }
  }

  function clickPulse(event) {
    if (!setting("clickEffects") || reducedMotion.matches || event.button !== 0) return;
    const pulse = document.createElement("span");
    pulse.className = "click-touch";
    pulse.style.left = `${event.clientX}px`;
    pulse.style.top = `${event.clientY}px`;
    document.body.appendChild(pulse);
    pulse.addEventListener("animationend", () => pulse.remove(), { once: true });
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerdown", clickPulse, { passive: true });
  resize();

  window.NeonEffects = { burst, sound };
})();
