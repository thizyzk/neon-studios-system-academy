(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.getElementById("pointer-trail");
  const context = canvas?.getContext("2d");
  const TRAIL_PROFILES = Object.freeze({
    neon: { hue: 154, spread: 55, saturation: 94, lightness: 64, lifetime: 620, width: 10, glow: 18, maxPoints: 28, throttle: 18, dash: [], wave: 0 },
    purple: { hue: 278, spread: 72, saturation: 92, lightness: 69, lifetime: 760, width: 12, glow: 24, maxPoints: 34, throttle: 16, dash: [], wave: 3 },
    blue: { hue: 205, spread: 34, saturation: 92, lightness: 66, lifetime: 900, width: 8, glow: 20, maxPoints: 38, throttle: 16, dash: [14, 8], wave: 1 },
    yellow: { hue: 49, spread: 24, saturation: 96, lightness: 62, lifetime: 430, width: 7, glow: 17, maxPoints: 23, throttle: 22, dash: [3, 8], wave: 2 },
    cyan: { hue: 183, spread: 36, saturation: 96, lightness: 68, lifetime: 700, width: 9, glow: 25, maxPoints: 32, throttle: 15, dash: [18, 5], wave: 1 },
    red: { hue: 356, spread: 30, saturation: 95, lightness: 63, lifetime: 360, width: 14, glow: 22, maxPoints: 20, throttle: 20, dash: [], wave: 0 },
    pink: { hue: 326, spread: 42, saturation: 93, lightness: 72, lifetime: 820, width: 13, glow: 24, maxPoints: 36, throttle: 16, dash: [], wave: 5 },
    orange: { hue: 27, spread: 34, saturation: 96, lightness: 62, lifetime: 520, width: 9, glow: 20, maxPoints: 26, throttle: 19, dash: [2, 6], wave: 2 },
    black: { hue: 150, spread: 25, saturation: 38, lightness: 55, lifetime: 980, width: 6, glow: 10, maxPoints: 40, throttle: 20, dash: [20, 12], wave: 0 },
    monochrome: { hue: 0, spread: 0, saturation: 0, lightness: 88, lifetime: 680, width: 8, glow: 12, maxPoints: 30, throttle: 18, dash: [9, 9], wave: 0 },
    white: { hue: 190, spread: 28, saturation: 58, lightness: 43, lifetime: 580, width: 7, glow: 12, maxPoints: 28, throttle: 18, dash: [16, 6], wave: 1 },
    mythic: { hue: 278, spread: 300, saturation: 96, lightness: 70, lifetime: 980, width: 15, glow: 30, maxPoints: 42, throttle: 14, dash: [], wave: 6 },
    legendary: { hue: 43, spread: 38, saturation: 98, lightness: 66, lifetime: 860, width: 14, glow: 29, maxPoints: 38, throttle: 15, dash: [24, 4], wave: 3 },
    cute: { hue: 329, spread: 55, saturation: 90, lightness: 76, lifetime: 780, width: 16, glow: 22, maxPoints: 34, throttle: 17, dash: [5, 5], wave: 7 },
  });
  const trail = [];
  let audioContext = null;
  let animationFrame = null;
  let lastPointAt = 0;

  function setting(name, fallback = true) {
    const value = document.body.dataset[name];
    return value === undefined || value === "" ? fallback : value === "true";
  }

  function activeProfile() {
    return TRAIL_PROFILES[document.documentElement.dataset.academyTheme] || TRAIL_PROFILES.neon;
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
    const profile = activeProfile();
    while (trail.length && now - trail[0].time > profile.lifetime) trail.shift();
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (trail.length > 1) {
      context.lineCap = "round";
      context.lineJoin = "round";
      for (let index = 1; index < trail.length; index += 1) {
        const previous = trail[index - 1];
        const point = trail[index];
        const life = Math.max(0, 1 - (now - point.time) / profile.lifetime);
        const wave = Math.sin(now * 0.012 + index * 0.9) * profile.wave * life;
        const previousY = previous.y + wave;
        const pointY = point.y - wave;
        const hue = (profile.hue + (index / Math.max(trail.length, 1)) * profile.spread + now * 0.018) % 360;
        const gradient = context.createLinearGradient(previous.x, previousY, point.x, pointY);
        gradient.addColorStop(0, `hsla(${hue}, ${profile.saturation}%, ${profile.lightness}%, ${life * 0.1})`);
        gradient.addColorStop(0.5, `hsla(${(hue + profile.spread * 0.35) % 360}, ${profile.saturation}%, ${Math.min(86, profile.lightness + 7)}%, ${life * 0.68})`);
        gradient.addColorStop(1, `hsla(${(hue + profile.spread) % 360}, ${profile.saturation}%, ${profile.lightness}%, ${life * 0.22})`);
        context.strokeStyle = gradient;
        context.lineWidth = 2 + life * profile.width;
        context.shadowBlur = profile.glow * life;
        context.shadowColor = `hsla(${hue}, ${profile.saturation}%, ${profile.lightness}%, ${life})`;
        context.setLineDash(profile.dash);
        context.beginPath();
        context.moveTo(previous.x, previousY);
        context.lineTo(point.x, pointY);
        context.stroke();
      }
    }
    context.shadowBlur = 0;
    context.setLineDash([]);
    if (trail.length) animationFrame = requestAnimationFrame(drawTrail);
  }

  function onPointerMove(event) {
    const now = performance.now();
    const profile = activeProfile();
    if (reducedMotion.matches || !setting("mouseTrail") || now - lastPointAt < profile.throttle) return;
    lastPointAt = now;
    trail.push({ x: event.clientX, y: event.clientY, time: now });
    if (trail.length > profile.maxPoints) trail.shift();
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
      const profile = activeProfile();
      particle.style.setProperty("--particle-hue", String((profile.hue + Math.round(Math.random() * Math.max(24, profile.spread))) % 360));
      document.body.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    }
  }

  function clickPulse(event) {
    if (!setting("clickEffects") || reducedMotion.matches || event.button !== 0) return;
    const pulse = document.createElement("span");
    pulse.className = "click-touch";
    const profile = activeProfile();
    pulse.style.setProperty("--pulse-hue", String(profile.hue));
    pulse.style.setProperty("--pulse-saturation", `${profile.saturation}%`);
    pulse.style.left = `${event.clientX}px`;
    pulse.style.top = `${event.clientY}px`;
    document.body.appendChild(pulse);
    pulse.addEventListener("animationend", () => pulse.remove(), { once: true });
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerdown", clickPulse, { passive: true });
  window.addEventListener("neon:theme-applied", () => {
    trail.length = 0;
    context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
  });
  resize();

  window.NeonEffects = { burst, sound };
})();
