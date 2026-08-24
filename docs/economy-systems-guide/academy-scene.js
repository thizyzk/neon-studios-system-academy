import * as THREE from "./assets/vendor/three.module.min.js";

const canvas = document.getElementById("academy-scene");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const SCENE_PROFILES = Object.freeze({
  neon: { colors: [0x45e08d, 0x68c5be, 0x9eff7a, 0x35bfa4, 0xe2b65f], ambient: 0x8fffe0, key: 0x5aff9d, rim: 0x45c8ff, speed: 0.42, orbitX: 0.12, bob: 0.16, depth: 0.08, pulse: 0.025, twist: 1, scrollTurns: 1.6 },
  purple: { colors: [0xd093ff, 0x7c4dff, 0x69dba8, 0xff8cdd, 0x89b9ff], ambient: 0xe2b7ff, key: 0xb36cff, rim: 0x65f0c2, speed: 0.58, orbitX: 0.34, bob: 0.24, depth: 0.2, pulse: 0.06, twist: -1.2, scrollTurns: 2.1 },
  blue: { colors: [0x65c9ff, 0x307fbc, 0x78d7ff, 0x77d69c, 0xb5e8ff], ambient: 0xb5eaff, key: 0x4fb6ff, rim: 0x77d69c, speed: 0.3, orbitX: 0.2, bob: 0.36, depth: 0.16, pulse: 0.018, twist: 0.72, scrollTurns: 1.25 },
  yellow: { colors: [0xffe46c, 0xf3d84e, 0xffb84d, 0x70d6a0, 0xfff3a1], ambient: 0xfff0ad, key: 0xffdd45, rim: 0xff9d4f, speed: 0.82, orbitX: 0.1, bob: 0.18, depth: 0.26, pulse: 0.12, twist: 1.5, scrollTurns: 1.8 },
  cyan: { colors: [0x65f2ed, 0x33cbd3, 0x9bffff, 0x58e2b2, 0x61aaff], ambient: 0xb8ffff, key: 0x4ff6f2, rim: 0x5a9dff, speed: 0.66, orbitX: 0.28, bob: 0.1, depth: 0.32, pulse: 0.04, twist: -0.8, scrollTurns: 2.4 },
  red: { colors: [0xff717b, 0xd92f45, 0xff9c87, 0xff4f63, 0xf4c462], ambient: 0xffb0aa, key: 0xff4558, rim: 0xffb35f, speed: 1.05, orbitX: 0.08, bob: 0.3, depth: 0.12, pulse: 0.075, twist: 2, scrollTurns: 2.8 },
  pink: { colors: [0xff8ed8, 0xec6abc, 0xffbde8, 0x72d9aa, 0xc89cff], ambient: 0xffc8ed, key: 0xff77ca, rim: 0x8fffd0, speed: 0.47, orbitX: 0.38, bob: 0.28, depth: 0.1, pulse: 0.08, twist: -0.55, scrollTurns: 1.45 },
  orange: { colors: [0xffab61, 0xef7d32, 0xffd16a, 0xff755b, 0x70d69b], ambient: 0xffd09f, key: 0xff8c3e, rim: 0xffd35c, speed: 0.9, orbitX: 0.3, bob: 0.12, depth: 0.22, pulse: 0.055, twist: 1.7, scrollTurns: 2.2 },
  black: { colors: [0x1a201d, 0x365047, 0x67dab8, 0x252b28, 0x78958b], ambient: 0x789b8e, key: 0x3e9f7e, rim: 0x526bff, speed: 0.2, orbitX: 0.08, bob: 0.08, depth: 0.05, pulse: 0.01, twist: 0.35, scrollTurns: 0.8 },
  monochrome: { colors: [0xffffff, 0x999999, 0x333333, 0xdadada, 0x666666], ambient: 0xffffff, key: 0xd8d8d8, rim: 0x888888, speed: 0.36, orbitX: 0.16, bob: 0.22, depth: 0.18, pulse: 0.035, twist: -1, scrollTurns: 1.5 },
  white: { colors: [0x087c82, 0x51db91, 0x316fa5, 0xb8dfe3, 0x96620b], ambient: 0xd9ffff, key: 0x45c99a, rim: 0x4c8dcc, speed: 0.27, orbitX: 0.22, bob: 0.14, depth: 0.12, pulse: 0.02, twist: 0.5, scrollTurns: 1.1 },
  mythic: { colors: [0xf18cff, 0x62e5b7, 0x80c6ff, 0xff9de9, 0xffd778], ambient: 0xf4caff, key: 0xd76cff, rim: 0x59f2c1, speed: 1.15, orbitX: 0.46, bob: 0.42, depth: 0.38, pulse: 0.14, twist: -2.2, scrollTurns: 3.2 },
  legendary: { colors: [0xffd55a, 0xffec84, 0xf0a938, 0x5be2ad, 0x6fd2e6], ambient: 0xffedac, key: 0xffcb3c, rim: 0x54e8bd, speed: 0.76, orbitX: 0.32, bob: 0.34, depth: 0.3, pulse: 0.09, twist: 1.25, scrollTurns: 2.7 },
  cute: { colors: [0xff9fd7, 0xffd0e9, 0x81ddb4, 0x9ec6ff, 0xf2d17f], ambient: 0xffddf2, key: 0xff8bce, rim: 0x8effc8, speed: 0.52, orbitX: 0.4, bob: 0.48, depth: 0.14, pulse: 0.16, twist: -0.4, scrollTurns: 1.35 },
});

if (canvas && !reducedMotion.matches) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  const group = new THREE.Group();
  scene.add(group);

  const ambientLight = new THREE.AmbientLight(0x8fffe0, 1.5);
  scene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0x5aff9d, 3.2);
  keyLight.position.set(4, 6, 8);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x45c8ff, 18, 28);
  rimLight.position.set(-7, -4, 6);
  scene.add(rimLight);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  let profile = SCENE_PROFILES.neon;
  const cubes = Array.from({ length: 14 }, (_value, index) => {
    const size = 0.38 + (index % 4) * 0.16;
    const material = new THREE.MeshStandardMaterial({
      color: profile.colors[index % profile.colors.length],
      roughness: 0.27,
      metalness: 0.34,
      transparent: true,
      opacity: 0.2 + (index % 3) * 0.09,
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.scale.setScalar(size);
    cube.position.set(
      (index % 2 === 0 ? -1 : 1) * (3.2 + (index % 5) * 0.85),
      5.5 - index * 0.9,
      -2 - (index % 4) * 1.1
    );
    cube.userData.basePosition = cube.position.clone();
    cube.userData.baseScale = size;
    cube.rotation.set(index * 0.31, index * 0.22, index * 0.17);
    group.add(cube);
    return cube;
  });

  let pointerX = 0;
  let pointerY = 0;
  let scrollTarget = 0;
  let scrollCurrent = 0;
  let running = true;

  function applyThemeProfile() {
    const themeId = document.documentElement.dataset.academyTheme || "neon";
    profile = SCENE_PROFILES[themeId] || SCENE_PROFILES.neon;
    ambientLight.color.setHex(profile.ambient);
    keyLight.color.setHex(profile.key);
    rimLight.color.setHex(profile.rim);
    cubes.forEach((cube, index) => {
      cube.material.color.setHex(profile.colors[index % profile.colors.length]);
      cube.material.emissive.setHex(profile.colors[(index + 2) % profile.colors.length]);
      cube.material.emissiveIntensity = ["mythic", "legendary", "cute"].includes(themeId) ? 0.16 : 0.05;
    });
  }

  function enabled() {
    return document.body.dataset.scene3d !== "false" && !document.hidden && !reducedMotion.matches;
  }

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
  }

  function updateScroll() {
    const maximum = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    scrollTarget = window.scrollY / maximum;
  }

  function animate(time) {
    if (!running) return;
    if (!enabled()) {
      renderer.clear();
      window.setTimeout(() => requestAnimationFrame(animate), 250);
      return;
    }
    scrollCurrent += (scrollTarget - scrollCurrent) * 0.045;
    const seconds = time * 0.001;
    group.rotation.y = scrollCurrent * Math.PI * profile.scrollTurns + pointerX * 0.08;
    group.rotation.x = scrollCurrent * (0.3 + profile.speed * 0.22) + pointerY * 0.04;
    group.position.y = scrollCurrent * 7 - 1.2;
    camera.position.z = 12 - scrollCurrent * 2.4;
    cubes.forEach((cube, index) => {
      const phase = seconds * profile.speed + index * 0.73;
      const base = cube.userData.basePosition;
      cube.rotation.x += (0.0012 + index * 0.00006) * profile.speed;
      cube.rotation.y += (0.0018 + index * 0.00005) * profile.speed * profile.twist;
      cube.position.x = base.x + Math.sin(phase) * profile.orbitX;
      cube.position.y = base.y + Math.cos(phase * 0.83) * profile.bob;
      cube.position.z = base.z + Math.sin(phase * 0.61) * profile.depth;
      cube.scale.setScalar(cube.userData.baseScale * (1 + Math.sin(phase * 1.7) * profile.pulse));
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("neon:theme-applied", applyThemeProfile);
  window.addEventListener("pointermove", (event) => {
    pointerX = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
    pointerY = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
  }, { passive: true });
  window.addEventListener("pagehide", () => { running = false; renderer.dispose(); }, { once: true });
  resize();
  applyThemeProfile();
  updateScroll();
  requestAnimationFrame(animate);
}
