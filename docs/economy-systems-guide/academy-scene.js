import * as THREE from "./assets/vendor/three.module.min.js";

const canvas = document.getElementById("academy-scene");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (canvas && !reducedMotion.matches) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.position.set(0, 0, 12);
  const group = new THREE.Group();
  scene.add(group);

  scene.add(new THREE.AmbientLight(0x8fffe0, 1.5));
  const keyLight = new THREE.DirectionalLight(0x5aff9d, 3.2);
  keyLight.position.set(4, 6, 8);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0x45c8ff, 18, 28);
  rimLight.position.set(-7, -4, 6);
  scene.add(rimLight);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const colors = [0x45e08d, 0x68c5be, 0x9eff7a, 0x35bfa4, 0xe2b65f];
  const cubes = Array.from({ length: 14 }, (_value, index) => {
    const size = 0.38 + (index % 4) * 0.16;
    const material = new THREE.MeshStandardMaterial({
      color: colors[index % colors.length],
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
    cube.rotation.set(index * 0.31, index * 0.22, index * 0.17);
    group.add(cube);
    return cube;
  });

  let pointerX = 0;
  let pointerY = 0;
  let scrollTarget = 0;
  let scrollCurrent = 0;
  let running = true;

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
    group.rotation.y = scrollCurrent * Math.PI * 1.6 + pointerX * 0.08;
    group.rotation.x = scrollCurrent * 0.42 + pointerY * 0.04;
    group.position.y = scrollCurrent * 7 - 1.2;
    camera.position.z = 12 - scrollCurrent * 2.4;
    cubes.forEach((cube, index) => {
      cube.rotation.x += 0.0018 + index * 0.00008;
      cube.rotation.y += 0.0023 + index * 0.00006;
      cube.position.x += Math.sin(seconds * 0.35 + index) * 0.0007;
    });
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("pointermove", (event) => {
    pointerX = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
    pointerY = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
  }, { passive: true });
  window.addEventListener("pagehide", () => { running = false; renderer.dispose(); }, { once: true });
  resize();
  updateScroll();
  requestAnimationFrame(animate);
}
