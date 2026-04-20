/**
 * UnifiedSphinx — 3D hero animation
 * A spinning wireframe icosahedron wrapped in a glowing shield contour,
 * surrounded by orbiting "threat" particles and a pulsing core.
 * Plus: a full-viewport starfield in the background.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------
 * 1. HERO ORB (the sphinx sentinel)
 * ------------------------------------------------------------ */
(function initHeroOrb() {
  const canvas = document.getElementById('sphinx-canvas');
  if (!canvas) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();
  const parent = canvas.parentElement;
  const getSize = () => ({ w: parent.clientWidth, h: parent.clientHeight });

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const group = new THREE.Group();
  scene.add(group);

  // Outer wireframe icosahedron (the "shield")
  const outerGeo = new THREE.IcosahedronGeometry(2.0, 1);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  group.add(outerMesh);

  // Mid octahedron (rotating against the grain)
  const midGeo = new THREE.OctahedronGeometry(1.35, 0);
  const midMat = new THREE.MeshBasicMaterial({
    color: 0xa855f7,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
  });
  const midMesh = new THREE.Mesh(midGeo, midMat);
  group.add(midMesh);

  // Inner solid core
  const coreGeo = new THREE.IcosahedronGeometry(0.5, 1);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.85,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  group.add(coreMesh);

  // Glow sprite around core — via a second, larger transparent sphere
  const glowGeo = new THREE.SphereGeometry(0.75, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  group.add(glowMesh);

  // Orbiting particles (the "threats" being tracked)
  const orbitCount = 120;
  const orbitGeo = new THREE.BufferGeometry();
  const orbitPositions = new Float32Array(orbitCount * 3);
  const orbitColors = new Float32Array(orbitCount * 3);
  const orbitMeta = []; // {radius, theta, phi, speed, colorMix}
  const cyan = new THREE.Color(0x00e5ff);
  const violet = new THREE.Color(0xa855f7);

  for (let i = 0; i < orbitCount; i++) {
    const radius = 2.4 + Math.random() * 1.4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 0.2 + Math.random() * 0.4;
    const colorMix = Math.random();
    orbitMeta.push({ radius, theta, phi, speed, colorMix });

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    orbitPositions[i * 3] = x;
    orbitPositions[i * 3 + 1] = y;
    orbitPositions[i * 3 + 2] = z;

    const c = cyan.clone().lerp(violet, colorMix);
    orbitColors[i * 3] = c.r;
    orbitColors[i * 3 + 1] = c.g;
    orbitColors[i * 3 + 2] = c.b;
  }
  orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
  orbitGeo.setAttribute('color', new THREE.BufferAttribute(orbitColors, 3));
  const orbitMat = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const orbitPoints = new THREE.Points(orbitGeo, orbitMat);
  group.add(orbitPoints);

  // Resize handling
  function resize() {
    const { w, h } = getSize();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // Mouse parallax
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 0.6;
    target.y = (e.clientY / window.innerHeight - 0.5) * 0.6;
  });

  const clock = new THREE.Clock();

  function tick() {
    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta(), 0.05);

    // Parallax smoothing
    current.x += (target.x - current.x) * 0.05;
    current.y += (target.y - current.y) * 0.05;
    group.rotation.y = current.x * 0.8 + t * 0.12;
    group.rotation.x = -current.y * 0.6 + Math.sin(t * 0.3) * 0.08;

    // Counter-rotate inner
    midMesh.rotation.y = -t * 0.6;
    midMesh.rotation.x = t * 0.4;
    outerMesh.rotation.y = t * 0.08;

    // Core pulse
    const pulse = 1 + Math.sin(t * 2.2) * 0.06;
    coreMesh.scale.setScalar(pulse);
    glowMesh.scale.setScalar(1 + Math.sin(t * 1.4) * 0.12);
    coreMat.opacity = 0.75 + Math.sin(t * 3) * 0.15;

    // Orbit particle animation
    const pos = orbitGeo.attributes.position.array;
    for (let i = 0; i < orbitCount; i++) {
      const m = orbitMeta[i];
      m.theta += dt * m.speed * 0.3;
      const x = m.radius * Math.sin(m.phi) * Math.cos(m.theta);
      const y = m.radius * Math.sin(m.phi) * Math.sin(m.theta);
      const z = m.radius * Math.cos(m.phi);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    orbitGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  if (prefersReducedMotion) {
    // Render one static frame only
    renderer.render(scene, camera);
  } else {
    tick();
  }
})();

/* ------------------------------------------------------------
 * 2. GLOBAL BACKGROUND — starfield + drifting vector lines
 * ------------------------------------------------------------ */
(function initBackdrop() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 120;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  // Starfield
  const starCount = 500;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const cyan = new THREE.Color(0x00e5ff);
  const violet = new THREE.Color(0xa855f7);
  const white = new THREE.Color(0xffffff);

  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 400;
    starPos[i * 3 + 1] = (Math.random() - 0.5) * 400;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 400;

    const pick = Math.random();
    const c = pick < 0.2 ? cyan : pick < 0.35 ? violet : white;
    const tint = 0.4 + Math.random() * 0.6;
    starColors[i * 3] = c.r * tint;
    starColors[i * 3 + 1] = c.g * tint;
    starColors[i * 3 + 2] = c.b * tint;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  let scrollY = 0;
  window.addEventListener(
    'scroll',
    () => {
      scrollY = window.scrollY;
    },
    { passive: true }
  );

  function tick() {
    stars.rotation.y += 0.0005;
    stars.rotation.x += 0.0002;
    camera.position.y = -scrollY * 0.02;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  if (prefersReducedMotion) {
    renderer.render(scene, camera);
  } else {
    tick();
  }
})();
