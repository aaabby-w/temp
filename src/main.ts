import * as THREE from "three";
import { createVectorAtlas } from "./vector-atlas";
import { ATLAS_NODES, MAP_SIZE, normalizedPosition, type AtlasNode } from "./nodes";
import "./style.css";
import './effects/gold-particle-rain.ts';

type Theme = "light" | "dark";
type MarkerBinding = { button: HTMLButtonElement; railButton?: HTMLButtonElement };

const TAU = Math.PI * 2;
const RADIUS = 7.8;
const MAP_ASPECT = MAP_SIZE.width / MAP_SIZE.height;
const HEIGHT = (TAU * RADIUS) / MAP_ASPECT;
const MIN_FOV = 28;
const MAX_FOV = 78;
const DEFAULT_FOV = 71;
// Coordinate origin; the added 1024-pixel vector strip closes the actual
// source edge cut. Moving this origin alone would not have repaired the seam.
const MAP_SEAM_U = 0.79;

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
const cursorStatus = document.querySelector<HTMLElement>("#cursor-status")!;
const tooltip = document.querySelector<HTMLElement>("#node-tooltip")!;
const activeTooltip = document.createElement("div");
activeTooltip.className = "node-tooltip hud active-label";
activeTooltip.setAttribute("aria-hidden", "true");
screen.append(activeTooltip);
const overlayObstacles = [...document.querySelectorAll<HTMLElement>(
  '.masthead, .city-panel, .node-rail, .viewport-controls, .footer, .author-tools, .author-snippet',
)];
const connection = document.querySelector<SVGSVGElement>("#node-connection")!;
const connectionPath = document.querySelector<SVGPathElement>("#node-connection-path")!;
const connectionOrigin = document.querySelector<SVGCircleElement>("#node-connection-origin")!;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.1, 40);
camera.position.set(0, 0, 0);
camera.lookAt(0, 0, -1);

const ring = new THREE.Group();
scene.add(ring);

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

const mapMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  toneMapped: false,
});
const baseMesh = new THREE.Mesh(ringGeometry(RADIUS, 1024, 1), mapMaterial);
ring.add(baseMesh);
const atlas = await createVectorAtlas(RADIUS, HEIGHT, MAP_SEAM_U);
ring.add(atlas.group);
canvas.dataset.vectorRegions = String(atlas.regionCount);
canvas.dataset.vectorTriangles = String(atlas.triangleCount);

const gridMaterial = new THREE.MeshBasicMaterial({
  map: makeGrid(), transparent: true, opacity: 0.32, depthWrite: false,
  side: THREE.DoubleSide,
});
ring.add(new THREE.Mesh(ringGeometry(RADIUS - 0.018), gridMaterial));

let theme: Theme = localStorage.getItem("fantasy-map-theme") === "dark" ? "dark" : "light";
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  renderer.setClearColor(dark ? 0x07100f : 0xe8f0ed, 1);
  mapMaterial.color.set(dark ? 0x101d1b : 0xffffff);
  atlas.setTheme(dark);
  gridMaterial.color.set(dark ? 0x9bb1aa : 0x355c51);
  gridMaterial.opacity = dark ? 0.14 : 0.1;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#07100f" : "#e8f0ed");
  localStorage.setItem("fantasy-map-theme", theme);
  requestRender();
}

function nodeVector(node: AtlasNode) {
  const { u, v } = normalizedPosition(node);
  const displayU = (u - MAP_SEAM_U + 1) % 1;
  const angle = (displayU - 0.5) * TAU;
  return new THREE.Vector3((RADIUS - 0.028) * Math.sin(angle), (0.5 - v) * HEIGHT, -(RADIUS - 0.028) * Math.cos(angle));
}

const nodePoints = ATLAS_NODES.map(nodeVector);
const bindings: MarkerBinding[] = ATLAS_NODES.map((node, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `map-node ${node.kind}`;
  button.setAttribute("aria-label", `${node.code} ${node.name}`);
  button.innerHTML = `<i aria-hidden="true"></i>`;
  button.addEventListener("click", (event) => { event.stopPropagation(); selectNode(index, true); });
  button.addEventListener("pointerenter", (event) => { if (event.pointerType !== "touch") showNodeTooltip(index); });
  button.addEventListener("pointerleave", hideNodeTooltip);
  button.addEventListener("focus", () => showNodeTooltip(index));
  button.addEventListener("blur", hideNodeTooltip);
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
let panelExpanded = false;
const initialU = new URLSearchParams(location.search).get('view') === 'seam'
  ? (MAP_SIZE.width - 512) / MAP_SIZE.width : normalizedPosition(ATLAS_NODES[active]).u;
let rotation = (((initialU - MAP_SEAM_U + 1) % 1) - 0.5) * TAU;
let targetRotation = rotation;
let fov = DEFAULT_FOV;
let targetFov = DEFAULT_FOV;
let velocityX = 0;
let animationFrame = 0;
let lastFrameTime = 0;
const pointers = new Map<number, { x: number; y: number }>();
let previousPointer = { x: 0, y: 0 };
let pinchDistance = 0;
let pointerMoved = false;
let authorMode = new URLSearchParams(location.search).get("editNodes") === "1";
let toastTimer = 0;
let lastSnippet = "";
let hoveredNode = -1;
let activeScreenPoint = { x: 0, y: 0, visible: false };
const screenPoints = bindings.map(() => ({ x: 0, y: 0, visible: false }));
type Bounds = { left: number; top: number; right: number; bottom: number };

function blockedAreas(rect: DOMRect): Bounds[] {
  return overlayObstacles.filter(element => element.getClientRects().length).map(element => {
    const area = element.getBoundingClientRect();
    return { left: area.left - rect.left - 8, top: area.top - rect.top - 8,
      right: area.right - rect.left + 8, bottom: area.bottom - rect.top + 8 };
  });
}

function intersects(a: Bounds, b: Bounds) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function placeLabel(element: HTMLElement, index: number, rect: DOMRect, obstacles: Bounds[]) {
  const point = screenPoints[index];
  if (authorMode || !point?.visible) { element.classList.remove("show"); return null; }
  const width = element.offsetWidth, height = element.offsetHeight;
  const { x, y } = point;
  const gap = 25;
  const candidates = [
    [x + gap, y - height / 2], [x - width - gap, y - height / 2],
    [x - width / 2, y - height - gap], [x - width / 2, y + gap],
    [x + gap, y - height - gap], [x - width - gap, y - height - gap],
    [x + gap, y + gap], [x - width - gap, y + gap],
  ].map(([left, top], order) => {
    left = THREE.MathUtils.clamp(left, 12, Math.max(12, rect.width - width - 12));
    top = THREE.MathUtils.clamp(top, 12, Math.max(12, rect.height - height - 12));
    const bounds = { left, top, right: left + width, bottom: top + height };
    // Avoid other important markers too, but never sacrifice UI clearance.
    const coveredMarkers = screenPoints.filter((p, i) => p.visible && i !== index &&
      (ATLAS_NODES[i].kind === "named" || i === active) &&
      intersects(bounds, { left: p.x - 16, right: p.x + 16, top: p.y - 16, bottom: p.y + 16 })).length;
    return { bounds, score: coveredMarkers * 100 + order };
  }).filter(({ bounds }) => !obstacles.some(area => intersects(bounds, area)) &&
    !intersects(bounds, { left: x - 18, right: x + 18, top: y - 18, bottom: y + 18 }));
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0]?.bounds;
  element.classList.toggle("show", !!best);
  if (!best) return null; // Hide instead of covering controls on a cramped viewport.
  element.style.setProperty("--tooltip-x", `${best.left}px`);
  element.style.setProperty("--tooltip-y", `${best.top}px`);
  return best;
}

function layoutNodeLabels(rect = screen.getBoundingClientRect(), obstacles = blockedAreas(rect)) {
  const activeBounds = placeLabel(activeTooltip, active, rect, obstacles);
  if (hoveredNode >= 0 && hoveredNode !== active) {
    placeLabel(tooltip, hoveredNode, rect, activeBounds ? [...obstacles, activeBounds] : obstacles);
  } else tooltip.classList.remove("show");
}

function showNodeTooltip(index: number) {
  hoveredNode = index;
  const node = ATLAS_NODES[index];
  const name = document.createElement("strong");
  name.textContent = node.name;
  const hint = document.createElement("small");
  hint.textContent = node.kind === "named" ? "会馆 · 点击查看" : "地点 · 点击查看";
  tooltip.replaceChildren(name, hint);
  layoutNodeLabels();
}

function hideNodeTooltip() {
  hoveredNode = -1;
  tooltip.classList.remove("show");
  layoutNodeLabels();
}

function updatePanelExpansion() {
  panel.dataset.expanded = String(panelExpanded);
  const toggle = panel.querySelector<HTMLButtonElement>(".panel-toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(panelExpanded));
    toggle.textContent = panelExpanded ? "收起档案 −" : "展开档案 ＋";
  }
  requestRender();
}

function updatePanel() {
  const node = ATLAS_NODES[active];
  const { u, v } = normalizedPosition(node);
  const typeLabel = node.kind === "named" ? "NAMED NODE" : "UNNAMED SIGNAL";
  panel.dataset.kind = node.kind;
  panel.innerHTML = `<button class="panel-toggle" type="button" aria-controls="panel-facts panel-description panel-actions" aria-expanded="${panelExpanded}"></button><header><span>${node.code} · ${typeLabel}</span><strong>${node.name}</strong><small>${node.kind === "named" ? "已命名区域节点" : "待归档观测节点"}</small></header><dl id="panel-facts"><div><dt>地图坐标</dt><dd>${Math.round(node.x)} / ${Math.round(node.y)}</dd></div><div><dt>地图位置</dt><dd>${u.toFixed(3)} / ${v.toFixed(3)}</dd></div></dl><p id="panel-description">${node.note}</p><footer id="panel-actions"><span>${node.kind === "named" ? "REFERENCE " + node.code : "REFERENCE POINT"}</span><button type="button" id="panel-reset">返回总览</button></footer>`;
  panel.classList.remove("is-revealing");
  void panel.offsetWidth;
  if (!reducedMotion.matches) panel.classList.add("is-revealing");
  panel.querySelector<HTMLButtonElement>("#panel-reset")?.addEventListener("click", resetView);
  panel.querySelector<HTMLButtonElement>(".panel-toggle")?.addEventListener("click", () => {
    panelExpanded = !panelExpanded;
    panel.classList.remove("is-revealing");
    updatePanelExpansion();
  });
  panel.scrollTop = 0;
  updatePanelExpansion();
  nodesRoot.classList.add("has-selection");
  const name = document.createElement("strong");
  name.textContent = node.name;
  const state = document.createElement("small");
  state.textContent = "已选中";
  activeTooltip.replaceChildren(name, state);
  bindings.forEach(({ button, railButton }, index) => {
    button.classList.toggle("active", index === active);
    button.setAttribute("aria-pressed", String(index === active));
    railButton?.classList.toggle("active", index === active);
    railButton?.setAttribute("aria-pressed", String(index === active));
  });
}

function nearestTurn(angle: number) { return angle + Math.round((rotation - angle) / TAU) * TAU; }

function selectNode(index: number, focus = false) {
  const changed = index !== active;
  active = index;
  const { u } = normalizedPosition(ATLAS_NODES[index]);
  const displayU = (u - MAP_SEAM_U + 1) % 1;
  targetRotation = nearestTurn((displayU - 0.5) * TAU);
  if (focus) targetFov = 54;
  velocityX = 0;
  if (changed) updatePanel();
  hideNodeTooltip();
  if (changed) {
    connection.classList.remove("is-drawing");
    void connection.getBoundingClientRect();
    connection.classList.add("is-drawing");
  }
  animate();
}

function resetView() {
  const home = normalizedPosition(ATLAS_NODES[0]);
  const displayU = (home.u - MAP_SEAM_U + 1) % 1;
  targetRotation = nearestTurn((displayU - 0.5) * TAU);
  targetFov = DEFAULT_FOV;
  velocityX = 0;
  panelExpanded = false;
  updatePanelExpansion();
  animate();
}

function setZoom(nextFov: number) {
  targetFov = THREE.MathUtils.clamp(nextFov, MIN_FOV, MAX_FOV);
  animate();
}

function zoomAt(nextFov: number, clientX: number) {
  const rect = screen.getBoundingClientRect();
  const pointerX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const clamped = THREE.MathUtils.clamp(nextFov, MIN_FOV, MAX_FOV);
  targetRotation += pointerX * (clamped - targetFov) * 0.0024;
  setZoom(clamped);
}

function projectNodes() {
  const rect = screen.getBoundingClientRect();
  const obstacles = blockedAreas(rect);
  const detail = THREE.MathUtils.clamp((DEFAULT_FOV - fov) / (DEFAULT_FOV - MIN_FOV), 0, 1);
  nodesRoot.style.setProperty("--minor-opacity", `${.7 + detail * .26}`);
  nodesRoot.style.setProperty("--minor-size", `${7 + detail * 1.5}px`);
  ring.updateMatrixWorld(true);
  nodePoints.forEach((position, index) => {
    const world = position.clone().applyMatrix4(ring.matrixWorld);
    const projected = world.clone().project(camera);
    const x = (projected.x * .5 + .5) * rect.width;
    const y = (-projected.y * .5 + .5) * rect.height;
    const visible = world.z < -1.2 && x > 8 && x < rect.width - 8 && y > 8 && y < rect.height - 8 &&
      !obstacles.some(area => x > area.left && x < area.right && y > area.top && y < area.bottom);
    const button = bindings[index].button;
    button.style.setProperty("--x", `${(projected.x * 0.5 + 0.5) * rect.width}px`);
    button.style.setProperty("--y", `${(-projected.y * 0.5 + 0.5) * rect.height}px`);
    button.style.setProperty("--depth", `${THREE.MathUtils.clamp((-world.z - 2) / RADIUS, 0.88, 1)}`);
    button.toggleAttribute("data-visible", visible);
    button.tabIndex = visible && !authorMode ? 0 : -1;
    button.setAttribute("aria-hidden", String(!visible || authorMode));
    screenPoints[index] = { x, y, visible };
    if (index === active) activeScreenPoint = screenPoints[index];
  });
  const panelRect = panel.getBoundingClientRect();
  const startX = activeScreenPoint.x;
  const startY = activeScreenPoint.y;
  const left = panelRect.left - rect.left, right = panelRect.right - rect.left;
  const top = panelRect.top - rect.top, bottom = panelRect.bottom - rect.top;
  const px = THREE.MathUtils.clamp(startX, left + 20, right - 20);
  const py = THREE.MathUtils.clamp(startY, top + 20, bottom - 20);
  const ends = [{ x: left, y: py, nx: -1, ny: 0 }, { x: right, y: py, nx: 1, ny: 0 },
    { x: px, y: top, nx: 0, ny: -1 }, { x: px, y: bottom, nx: 0, ny: 1 }];
  ends.sort((a, b) => Math.hypot(a.x - startX, a.y - startY) - Math.hypot(b.x - startX, b.y - startY));
  const end = ends[0];
  const bend = Math.min(110, Math.hypot(end.x - startX, end.y - startY) * .35);
  connectionPath.setAttribute("d", `M ${startX} ${startY} C ${startX + (end.x - startX) * .32} ${startY + (end.y - startY) * .32}, ${end.x + end.nx * bend} ${end.y + end.ny * bend}, ${end.x} ${end.y}`);
  connectionOrigin.setAttribute("cx", `${startX}`);
  connectionOrigin.setAttribute("cy", `${startY}`);
  connection.toggleAttribute("data-visible", activeScreenPoint.visible && !authorMode);
  layoutNodeLabels(rect, obstacles);
}

function updateStatus() {
  const wrappedDegrees = ((THREE.MathUtils.radToDeg(rotation) % 360) + 360) % 360;
  status.textContent = `AZ ${wrappedDegrees.toFixed(1)}° · ZOOM ${Math.round((DEFAULT_FOV / fov) * 100)}% · VECTOR`;
}

function resize() {
  const rect = screen.getBoundingClientRect();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  atlas.resize(rect.width, rect.height);
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
  requestRender();
}

function render() {
  ring.rotation.y = rotation;
  ring.updateMatrixWorld(true);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  projectNodes();
  updateStatus();
}

function tick(time: number) {
  animationFrame = 0;
  // Use consecutive RAF timestamps. Resetting to performance.now() after a
  // slow render can make the next delta negative and drive easing backwards.
  const dt = lastFrameTime ? THREE.MathUtils.clamp((time - lastFrameTime) / 16.67, 0, 2) : 1;
  lastFrameTime = time;
  const ease = reducedMotion.matches ? 1 : 1 - Math.pow(0.86, dt);
  if (reducedMotion.matches) velocityX = 0;
  rotation += (targetRotation - rotation) * ease;
  const nextFov = fov + (targetFov - fov) * ease;
  fov = Number.isFinite(nextFov) ? THREE.MathUtils.clamp(nextFov, MIN_FOV, MAX_FOV) : DEFAULT_FOV;
  if (pointers.size === 0) {
    velocityX *= Math.pow(0.91, dt);
    rotation += velocityX * dt;
    targetRotation += velocityX * dt;
  }
  render();
  const moving = Math.abs(targetRotation - rotation) > 0.0001 || Math.abs(targetFov - fov) > 0.01 || Math.abs(velocityX) > 0.00002;
  if (moving) animationFrame = requestAnimationFrame(tick);
}

function animate() { requestRender(); }
function requestRender() { if (!animationFrame) { lastFrameTime = 0; animationFrame = requestAnimationFrame(tick); } }

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
  const sourceU = (hit.uv.x + MAP_SEAM_U) % 1;
  return { x: Math.round(sourceU * MAP_SIZE.width), y: Math.round((1 - hit.uv.y) * MAP_SIZE.height) };
}

function setAuthorMode(next: boolean) {
  authorMode = next;
  document.body.classList.toggle("author-mode", authorMode);
  authorButton.textContent = authorMode ? "EXIT EDITOR" : "NODE EDITOR";
  const url = new URL(location.href);
  if (authorMode) url.searchParams.set("editNodes", "1"); else url.searchParams.delete("editNodes");
  history.replaceState(null, "", url);
  authorPosition.textContent = authorMode ? "移动光标读取坐标 · 点击地图复制节点代码" : "";
  if (!authorMode) {
    authorSnippet.classList.remove("show");
    authorToast.classList.remove("show");
    window.clearTimeout(toastTimer);
  }
  hideNodeTooltip();
  requestRender();
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
  const target = event.target as HTMLElement;
  if (target.closest("[data-ui]") && !target.closest(".map-node")) return;
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    zoomAt(targetFov + event.deltaY * 0.045, event.clientX);
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
  const liveCoordinate = mapCoordinateAt(event.clientX, event.clientY);
  cursorStatus.textContent = liveCoordinate ? `X ${liveCoordinate.x} · Y ${liveCoordinate.y}` : "X — · Y —";
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
  if (!pointerMoved) {
    const coordinate = mapCoordinateAt(event.clientX, event.clientY);
    if (coordinate && targetFov > 55) {
      const displayU = (coordinate.x / MAP_SIZE.width - MAP_SEAM_U + 1) % 1;
      targetRotation = nearestTurn((displayU - 0.5) * TAU);
      setZoom(50);
    } else resetView();
  }
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
reducedMotion.addEventListener("change", requestRender);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
  else if (!document.hidden) animate();
});

new ResizeObserver(resize).observe(screen);
new ResizeObserver(requestRender).observe(panel);
setAuthorMode(authorMode);
updatePanel();
applyTheme();
resize();
void document.fonts.ready.then(requestRender);
