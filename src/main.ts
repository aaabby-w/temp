import * as THREE from "three";
import { ATLAS_NODES, MAP_SIZE, normalizedPosition, type AtlasNode } from "./nodes";
import "./style.css";

type Theme = "light" | "dark";
type MarkerBinding = { button: HTMLButtonElement; railButton?: HTMLButtonElement };

const TAU = Math.PI * 2;
const RADIUS = 7.8;
const MAP_ASPECT = MAP_SIZE.width / MAP_SIZE.height;
const HEIGHT = (TAU * RADIUS) / MAP_ASPECT;
const DEFAULT_FOV = 71;
const MIN_FOV = 45;
const MAX_FOV = 78;

const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const screen = document.querySelector<HTMLElement>("#screen")!;
const nodesRoot = document.querySelector<HTMLElement>("#nodes")!;
const panel = document.querySelector<HTMLElement>("#city-panel")!;
const rail = document.querySelector<HTMLElement>("#node-rail")!;
const themeButton = document.querySelector<HTMLButtonElement>("#theme-toggle")!;
const zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in")!;
const zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out")!;
const resetButton = document.querySelector<HTMLButtonElement>("#reset-view")!;
const authorButton = document.querySelector<HTMLButtonElement>("#author-toggle")!;
const authorPosition = document.querySelector<HTMLElement>("#author-position")!;
const authorSnippet = document.querySelector<HTMLElement>("#author-snippet")!;
const authorCode = document.querySelector<HTMLElement>("#author-code")!;
const authorCopy = document.querySelector<HTMLButtonElement>("#author-copy")!;
const authorToast = document.querySelector<HTMLElement>("#author-toast")!;
const status = document.querySelector<HTMLElement>("#viewport-status")!;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 40);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, -1);

const ring = new THREE.Group();
scene.add(ring);
scene.add(new THREE.HemisphereLight(0xf8fffc, 0x36544c, 1.08));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.48);
keyLight.position.set(-3.5, 5, 1.5);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x9edbc8, 3.5, 18, 2);
rimLight.position.set(3.5, -2, 0);
scene.add(rimLight);

function ringGeometry(radius: number, horizontalSegments = 1024, verticalSegments = 1) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let yIndex = 0; yIndex <= verticalSegments; yIndex += 1) {
    const v = 1 - yIndex / verticalSegments;
    const y = HEIGHT * (v - 0.5);
    for (let xIndex = 0; xIndex <= horizontalSegments; xIndex += 1) {
      const u = xIndex / horizontalSegments;
      const angle = (u - 0.5) * TAU;
      positions.push(radius * Math.sin(angle), y, -radius * Math.cos(angle));
      uvs.push(u, v);
    }
  }
  const stride = horizontalSegments + 1;
  for (let yIndex = 0; yIndex < verticalSegments; yIndex += 1) {
    for (let xIndex = 0; xIndex < horizontalSegments; xIndex += 1) {
      const top = yIndex * stride + xIndex;
      indices.push(top, top + stride, top + 1, top + 1, top + stride, top + stride + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

async function loadAtlas() {
  const image = new Image();
  image.src = `${import.meta.env.BASE_URL}assets/fantasy-world-map.jpg`;
  await image.decode();
  const maxTextureSize = renderer.capabilities.maxTextureSize;
  let source: CanvasImageSource = image;
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  if (width > maxTextureSize || height > maxTextureSize) {
    const scale = Math.min(maxTextureSize / width, maxTextureSize / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const fallback = document.createElement("canvas");
    fallback.width = width;
    fallback.height = height;
    fallback.getContext("2d")!.drawImage(image, 0, 0, width, height);
    source = fallback;
  }
  const texture = new THREE.Texture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return { image, texture, width, height };
}

function makeHeightTexture(image: HTMLImageElement) {
  const layer = document.createElement("canvas");
  layer.width = Math.min(4096, image.naturalWidth);
  layer.height = Math.round(layer.width / MAP_ASPECT);
  const context = layer.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, layer.width, layer.height);
  const pixels = context.getImageData(0, 0, layer.width, layer.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const r = pixels.data[index] / 255;
    const g = pixels.data[index + 1] / 255;
    const b = pixels.data[index + 2] / 255;
    const distanceFromWhite = 1 - Math.min(r, g, b);
    const mask = THREE.MathUtils.smoothstep(distanceFromWhite, 0.035, 0.16);
    const value = Math.round(mask * 255);
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(layer);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeGrid() {
  const layer = document.createElement("canvas");
  layer.width = 4096;
  layer.height = Math.round(layer.width / MAP_ASPECT);
  const context = layer.getContext("2d")!;
  context.strokeStyle = "rgba(37,74,66,.18)";
  context.lineWidth = 1;
  context.setLineDash([12, 18]);
  for (let x = 0; x <= 48; x += 1) {
    context.beginPath();
    context.moveTo((x / 48) * layer.width, 0);
    context.lineTo((x / 48) * layer.width, layer.height);
    context.stroke();
  }
  for (let y = 1; y < 10; y += 1) {
    context.beginPath();
    context.moveTo(0, (y / 10) * layer.height);
    context.lineTo(layer.width, (y / 10) * layer.height);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(layer);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

const atlas = await loadAtlas();
const heightTexture = makeHeightTexture(atlas.image);
const baseMaterial = new THREE.MeshBasicMaterial({ map: atlas.texture, side: THREE.DoubleSide });
baseMaterial.toneMapped = false;
const baseMesh = new THREE.Mesh(ringGeometry(RADIUS), baseMaterial);
ring.add(baseMesh);

const reliefMaterial = new THREE.MeshStandardMaterial({
  map: atlas.texture,
  alphaMap: heightTexture,
  alphaTest: 0.08,
  displacementMap: heightTexture,
  displacementScale: 0.19,
  bumpMap: heightTexture,
  bumpScale: 0.055,
  emissive: 0xffffff,
  emissiveMap: atlas.texture,
  emissiveIntensity: 0.58,
  roughness: 0.86,
  metalness: 0.02,
  side: THREE.DoubleSide,
});
const reliefMesh = new THREE.Mesh(ringGeometry(RADIUS - 0.025, 1024, 64), reliefMaterial);
ring.add(reliefMesh);

const gridMaterial = new THREE.MeshBasicMaterial({
  map: makeGrid(), transparent: true, opacity: 0.32, depthWrite: false,
  side: THREE.DoubleSide,
});
ring.add(new THREE.Mesh(ringGeometry(RADIUS - 0.235), gridMaterial));

let theme: Theme = localStorage.getItem("fantasy-map-theme") === "dark" ? "dark" : "light";
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  renderer.setClearColor(dark ? 0x07100f : 0xe8f0ed, 1);
  baseMaterial.color.set(dark ? 0x506b63 : 0xffffff);
  reliefMaterial.color.set(dark ? 0xa9c2ba : 0xffffff);
  reliefMaterial.emissiveIntensity = dark ? 0.18 : 0.58;
  gridMaterial.color.set(dark ? 0x9bb1aa : 0x355c51);
  gridMaterial.opacity = dark ? 0.14 : 0.1;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#07100f" : "#e8f0ed");
  localStorage.setItem("fantasy-map-theme", theme);
  requestRender();
}

function nodeVector(node: AtlasNode) {
  const { u, v } = normalizedPosition(node);
  const angle = (u - 0.5) * TAU;
  return new THREE.Vector3((RADIUS - 0.32) * Math.sin(angle), (0.5 - v) * HEIGHT, -(RADIUS - 0.32) * Math.cos(angle));
}

const nodePoints = ATLAS_NODES.map(nodeVector);
const bindings: MarkerBinding[] = ATLAS_NODES.map((node, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `map-node ${node.kind}`;
  button.setAttribute("aria-label", `${node.code} ${node.name}`);
  button.innerHTML = `<i aria-hidden="true"></i><span><em>${node.code}</em><b>${node.name}</b></span>`;
  button.addEventListener("click", (event) => { event.stopPropagation(); selectNode(index, true); });
  nodesRoot.append(button);
  let railButton: HTMLButtonElement | undefined;
  if (node.kind === "named") {
    railButton = document.createElement("button");
    railButton.type = "button";
    railButton.innerHTML = `<span>${node.code}</span><small>${node.name}</small>`;
    railButton.addEventListener("click", () => selectNode(index, true));
    rail.append(railButton);
  }
  return { button, railButton };
});

let active = 0;
let rotation = (normalizedPosition(ATLAS_NODES[active]).u - 0.5) * TAU;
let targetRotation = rotation;
let fov = DEFAULT_FOV;
let targetFov = DEFAULT_FOV;
let velocityX = 0;
let animationFrame = 0;
let lastFrameTime = performance.now();
const pointers = new Map<number, { x: number; y: number }>();
let previousPointer = { x: 0, y: 0 };
let pinchDistance = 0;
let pointerMoved = false;
let authorMode = new URLSearchParams(location.search).get("editNodes") === "1";
let toastTimer = 0;
let lastSnippet = "";

function updatePanel() {
  const node = ATLAS_NODES[active];
  const { u, v } = normalizedPosition(node);
  const typeLabel = node.kind === "named" ? "NAMED NODE" : "UNNAMED SIGNAL";
  panel.dataset.kind = node.kind;
  panel.innerHTML = `<header><span>${node.code} · ${typeLabel}</span><strong>${node.name}</strong><small>${node.kind === "named" ? "已命名区域节点" : "待归档观测节点"}</small></header><dl><div><dt>原图坐标</dt><dd>${Math.round(node.x)} / ${Math.round(node.y)}</dd></div><div><dt>地图位置</dt><dd>${u.toFixed(3)} / ${v.toFixed(3)}</dd></div></dl><p>${node.note}</p><footer><span>${node.kind === "named" ? "REFERENCE 01—07" : "REFERENCE POINT"}</span><button type="button" id="panel-reset">返回总览</button></footer>`;
  panel.querySelector<HTMLButtonElement>("#panel-reset")?.addEventListener("click", resetView);
  bindings.forEach(({ button, railButton }, index) => {
    button.classList.toggle("active", index === active);
    railButton?.classList.toggle("active", index === active);
  });
}

function nearestTurn(angle: number) { return angle + Math.round((rotation - angle) / TAU) * TAU; }

function selectNode(index: number, focus = false) {
  active = index;
  const { u } = normalizedPosition(ATLAS_NODES[index]);
  targetRotation = nearestTurn((u - 0.5) * TAU);
  if (focus) targetFov = 54;
  velocityX = 0;
  updatePanel();
  animate();
}

function resetView() {
  const home = normalizedPosition(ATLAS_NODES[0]);
  targetRotation = nearestTurn((home.u - 0.5) * TAU);
  targetFov = DEFAULT_FOV;
  velocityX = 0;
  animate();
}

function setZoom(nextFov: number) {
  targetFov = THREE.MathUtils.clamp(nextFov, MIN_FOV, MAX_FOV);
  animate();
}

function projectNodes() {
  const rect = screen.getBoundingClientRect();
  ring.updateMatrixWorld(true);
  nodePoints.forEach((position, index) => {
    const world = position.clone().applyMatrix4(ring.matrixWorld);
    const projected = world.clone().project(camera);
    const visible = world.z < -1.2 && Math.abs(projected.x) < 1.06 && Math.abs(projected.y) < 1.08;
    const button = bindings[index].button;
    button.style.setProperty("--x", `${(projected.x * 0.5 + 0.5) * rect.width}px`);
    button.style.setProperty("--y", `${(-projected.y * 0.5 + 0.5) * rect.height}px`);
    button.style.setProperty("--depth", `${THREE.MathUtils.clamp((-world.z - 2) / RADIUS, 0.58, 1)}`);
    button.toggleAttribute("data-visible", visible);
  });
}

function updateStatus() {
  const wrappedDegrees = ((THREE.MathUtils.radToDeg(rotation) % 360) + 360) % 360;
  status.textContent = `AZ ${wrappedDegrees.toFixed(1)}° · ZOOM ${Math.round((DEFAULT_FOV / fov) * 100)}% · ${atlas.width}PX MASTER`;
}

function resize() {
  const rect = screen.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
  requestRender();
}

function render() {
  ring.rotation.y = rotation;
  camera.fov = fov;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  projectNodes();
  updateStatus();
}

function tick(time: number) {
  animationFrame = 0;
  const dt = Math.min(2, (time - lastFrameTime) / 16.67);
  lastFrameTime = time;
  const ease = 1 - Math.pow(0.86, dt);
  rotation += (targetRotation - rotation) * ease;
  fov += (targetFov - fov) * ease;
  if (pointers.size === 0) {
    velocityX *= Math.pow(0.91, dt);
    rotation += velocityX * dt;
    targetRotation += velocityX * dt;
  }
  render();
  const moving = Math.abs(targetRotation - rotation) > 0.0001 || Math.abs(targetFov - fov) > 0.01 || Math.abs(velocityX) > 0.00002;
  if (moving) animate();
}

function animate() { if (!animationFrame) { lastFrameTime = performance.now(); animationFrame = requestAnimationFrame(tick); } }
function requestRender() { if (!animationFrame) animationFrame = requestAnimationFrame(tick); }

function updatePointerLight(clientX: number, clientY: number) {
  const rect = screen.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((clientY - rect.top) / rect.height) * 2 - 1;
  screen.style.setProperty("--hud-x", `${x * 6}px`);
  screen.style.setProperty("--hud-y", `${y * 4}px`);
  screen.style.setProperty("--light-x", `${(x + 1) * 50}%`);
  screen.style.setProperty("--light-y", `${(y + 1) * 50}%`);
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
function mapCoordinateAt(clientX: number, clientY: number) {
  const rect = screen.getBoundingClientRect();
  pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObject(baseMesh, false)[0];
  if (!hit?.uv) return null;
  return { x: Math.round(hit.uv.x * MAP_SIZE.width), y: Math.round((1 - hit.uv.y) * MAP_SIZE.height) };
}

function setAuthorMode(next: boolean) {
  authorMode = next;
  document.body.classList.toggle("author-mode", authorMode);
  authorButton.textContent = authorMode ? "EXIT EDITOR" : "NODE EDITOR";
  const url = new URL(location.href);
  if (authorMode) url.searchParams.set("editNodes", "1"); else url.searchParams.delete("editNodes");
  history.replaceState(null, "", url);
  authorPosition.textContent = authorMode ? "移动光标读取坐标 · 点击地图复制节点代码" : "";
  if (!authorMode) authorSnippet.classList.remove("show");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.append(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }
}

async function copyNodeSnippet(clientX: number, clientY: number) {
  const coordinate = mapCoordinateAt(clientX, clientY);
  if (!coordinate) return;
  const nextNumber = ATLAS_NODES.filter((node) => node.kind === "unnamed").length + 1;
  const code = `U${String(nextNumber).padStart(2, "0")}`;
  const snippet = `{ code: "${code}", name: "未命名节点 ${String(nextNumber).padStart(2, "0")}", kind: "unnamed", x: ${coordinate.x}, y: ${coordinate.y}, note: "等待补充档案。" },`;
  lastSnippet = snippet;
  authorCode.textContent = snippet;
  authorSnippet.classList.add("show");
  await copyText(snippet);
  authorToast.textContent = `已复制 ${coordinate.x}, ${coordinate.y}`;
  authorToast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => authorToast.classList.remove("show"), 1800);
}

screen.addEventListener("wheel", (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    setZoom(targetFov + event.deltaY * 0.045);
    return;
  }
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  targetRotation += delta * 0.00135;
  velocityX = delta * 0.00012;
  animate();
}, { passive: false });

screen.addEventListener("pointerdown", (event) => {
  if ((event.target as HTMLElement).closest("[data-ui]")) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  previousPointer = { x: event.clientX, y: event.clientY };
  pointerMoved = false;
  if (pointers.size === 2) {
    const [first, second] = [...pointers.values()];
    pinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
  }
  screen.setPointerCapture(event.pointerId);
  screen.classList.add("is-dragging");
});

screen.addEventListener("pointermove", (event) => {
  updatePointerLight(event.clientX, event.clientY);
  if (authorMode) {
    const coordinate = mapCoordinateAt(event.clientX, event.clientY);
    if (coordinate) authorPosition.textContent = `X ${coordinate.x} · Y ${coordinate.y} · 点击复制`;
  }
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) {
    const [first, second] = [...pointers.values()];
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    if (pinchDistance > 0) setZoom(targetFov - (distance - pinchDistance) * 0.07);
    pinchDistance = distance;
    return;
  }
  const dx = event.clientX - previousPointer.x;
  const dy = event.clientY - previousPointer.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) pointerMoved = true;
  previousPointer = { x: event.clientX, y: event.clientY };
  targetRotation += dx * 0.0041;
  rotation = targetRotation;
  velocityX = dx * 0.00042;
  render();
});

function releasePointer(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (screen.hasPointerCapture(event.pointerId)) screen.releasePointerCapture(event.pointerId);
  if (pointers.size < 2) pinchDistance = 0;
  if (pointers.size === 0) { screen.classList.remove("is-dragging"); animate(); }
}
screen.addEventListener("pointerup", releasePointer);
screen.addEventListener("pointercancel", releasePointer);
screen.addEventListener("click", (event) => {
  if (!authorMode || pointerMoved || (event.target as HTMLElement).closest("[data-ui]")) return;
  void copyNodeSnippet(event.clientX, event.clientY);
});
screen.addEventListener("dblclick", (event) => {
  if (authorMode || (event.target as HTMLElement).closest("[data-ui]")) return;
  if (!pointerMoved) setZoom(targetFov > 55 ? 50 : DEFAULT_FOV);
});

screen.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") targetRotation += event.key === "ArrowLeft" ? -0.24 : 0.24;
  else if (event.key === "+" || event.key === "=") setZoom(targetFov - 5);
  else if (event.key === "-" || event.key === "_") setZoom(targetFov + 5);
  else if (event.key === "0" || event.key === "Home") resetView();
  else return;
  event.preventDefault();
  animate();
});

zoomInButton.addEventListener("click", () => setZoom(targetFov - 6));
zoomOutButton.addEventListener("click", () => setZoom(targetFov + 6));
resetButton.addEventListener("click", resetView);
authorButton.addEventListener("click", () => setAuthorMode(!authorMode));
authorCopy.addEventListener("click", async () => {
  if (!lastSnippet) return;
  await copyText(lastSnippet);
  authorToast.textContent = "节点代码已再次复制";
  authorToast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => authorToast.classList.remove("show"), 1800);
});
themeButton.addEventListener("click", () => { theme = theme === "light" ? "dark" : "light"; applyTheme(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
  else if (!document.hidden) animate();
});

new ResizeObserver(resize).observe(screen);
setAuthorMode(authorMode);
updatePanel();
applyTheme();
resize();
