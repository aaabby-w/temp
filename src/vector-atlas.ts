import * as THREE from 'three';
import { MAP_SIZE } from './nodes';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

type Point = [number, number];
type Region = {
  id: string; color: string; rings: Point[][]; vertices: number[];
  indices: number[]; neighbors: string[]; area: number;
};
type Atlas = {
  width: number; height: number; sourceSha256: string;
  regions: Region[]; coastlines: Point[][]; borders: Point[][];
};

/** True vector faces and shared linework. No atlas bitmap is sampled at runtime. */
export async function createVectorAtlas(radius: number, height: number, seam: number) {
  const response = await fetch(`${import.meta.env.BASE_URL}assets/atlas-regions.json`);
  if (!response.ok) throw new Error(`Vector atlas could not load (${response.status})`);
  const data: Atlas = await response.json();
  if (data.width !== MAP_SIZE.width || data.height !== MAP_SIZE.height || !data.regions.length) {
    throw new Error('Vector atlas has an incompatible coordinate system');
  }
  const group = new THREE.Group();
  group.name = 'vector-atlas';
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  function point(x: number, y: number, r: number): [number, number, number] {
    const angle = (x / data.width - seam - .5) * Math.PI * 2;
    return [r * Math.sin(angle), (.5 - y / data.height) * height, -r * Math.cos(angle)];
  }
  let triangleCount = 0;
  data.regions.forEach(region => {
    const positions: number[] = [];
    for (let i = 0; i < region.vertices.length; i += 2) {
      positions.push(...point(region.vertices[i], region.vertices[i + 1], radius - .006));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(region.indices);
    geometry.computeBoundingSphere();
    let material = materials.get(region.color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: region.color, side: THREE.DoubleSide, toneMapped: false });
      materials.set(region.color, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = region.id;
    mesh.userData.regionId = region.id;
    mesh.userData.neighbors = region.neighbors;
    group.add(mesh);
    triangleCount += region.indices.length / 3;
  });
  function lineLayer(lines: Point[][], color: number, width: number) {
    const positions: number[] = [];
    for (const points of lines) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        // Bound the chord error, matching the 24-source-pixel fill strips.
        const steps = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / 12));
        for (let j = 0; j < steps; j++) {
          for (const t of [j / steps, (j + 1) / steps]) {
            positions.push(...point(THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t), radius - .012));
          }
        }
      }
    }
    const geometry = new LineSegmentsGeometry().setPositions(positions);
    // Screen-space stroke width can otherwise intersect the curved fill depth
    // on mobile, making a solid edge appear stippled. This is an overlay layer.
    const material = new LineMaterial({ color, linewidth: width, alphaToCoverage: false, worldUnits: false, toneMapped: false, depthTest: false, depthWrite: false });
    const line = new LineSegments2(geometry, material);
    line.renderOrder = 3;
    line.frustumCulled = false;
    group.add(line);
    return material;
  }
  const coast = lineLayer(data.coastlines, 0x397b8a, 1.5);
  const border = lineLayer(data.borders, 0x739d94, 1.05);
  return {
    group, regionCount: data.regions.length, triangleCount,
    setTheme(dark: boolean) {
      for (const [color, material] of materials) {
        material.color.set(color);
        if (dark) {
          if (color === '#ffffff') material.color.set(0x101d1b);
          else material.color.multiplyScalar(.24);
        }
      }
      coast.color.set(dark ? 0x7cb4b9 : 0x397b8a);
      border.color.set(dark ? 0x689a8d : 0x739d94);
    },
    resize(width: number, height: number) {
      coast.resolution.set(width, height);
      border.resolution.set(width, height);
    },
  };
}
