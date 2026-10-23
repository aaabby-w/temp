export const MAP_SIZE = { width: 9216, height: 1900 } as const;
const SOURCE_MAP_SIZE = { width: 8192, height: 1900 } as const;
const LEGACY_MAP_SIZE = { width: 4684, height: 1080 } as const;

export type AtlasNode = {
  code: string;
  name: string;
  kind: "named" | "unnamed";
  x: number;
  y: number;
  note: string;
};

const named = [
  ["01", "龙游", 1421.2, 378.75],
  ["02", "流石", 1734.76, 251.76],
  ["03", "灵溪", 1525.18, 401.59],
  ["04", "湘竹", 1666.41, 178.84],
  ["05", "寒木", 1665.21, 404.16],
  ["06", "苍南", 1619.68, 384.03],
  ["07", "离岛", 1463.16, 425.58],
] as const;

// Pixel centres extracted from the black reference marks in the supplied 4684 × 1080 atlas.
const unnamed = [
  [2443.29, 92.86], [4269.2, 168.4], [486.88, 267.25], [2146.67, 283.5],
  [1016.83, 287.83], [1235.67, 289.83], [1381.54, 292.23], [4236.93, 306.33],
  [1584.44, 308.78], [1757.8, 313.6], [1635.44, 325.22], [1902.2, 330.2],
  [2167.67, 349], [1798, 384.73], [1280.6, 390.1], [265.62, 392.62],
  [1718.2, 409.6], [1539.2, 417.4], [1253.4, 424.1], [1676.78, 439.11],
  [253.5, 452], [745, 451.5], [1986.71, 454.43], [1381, 471.25],
  [1200.57, 490.29], [823.67, 508.17], [945.25, 545.08], [467.5, 555.5],
  [2117.14, 584.29], [1202.44, 586.11], [695.5, 594.5], [1759.42, 601.83],
  [1426.82, 604.09], [3262.62, 618.38], [1012.44, 625.78], [3306.92, 681.69],
  [406.43, 682.29], [2037.12, 709.75], [1553.36, 734.55], [364.2, 771.2],
  [1459.89, 790.33], [326.43, 795.29], [1787.2, 801.3], [4051.15, 844.85],
  [1826.33, 849.67], [1272, 852], [1208.71, 877.43], [1721.89, 903.44],
  [2695, 907.5], [1798.5, 910.5], [2870.5, 925.5], [1595.5, 930],
  [1076.5, 940.5], [1012, 960.27], [932.67, 1007.17], [1657.58, 1014],
  [2010.23, 1016.46], [1312.5, 1036], [1181.18, 1042.09],
] as const;

// Existing points were read from the earlier 4684 × 1080 marked reference.
// Convert them to the original 8192 × 1900 portion without changing their
// geographic position. New manually placed points should use the `manual`
// array below and current-master pixel coordinates directly.
function fromLegacy(x: number, y: number) {
  return {
    x: (x / LEGACY_MAP_SIZE.width) * SOURCE_MAP_SIZE.width,
    y: (y / LEGACY_MAP_SIZE.height) * SOURCE_MAP_SIZE.height,
  };
}

// Add hand-checked points here. Open the site with `?editNodes=1`, click the
// map, and paste the copied object into this array.
const manual: AtlasNode[] = [
  // { code: "U60", name: "未命名节点 60", kind: "unnamed", x: 4096, y: 950, note: "等待补充档案。" },
];

export const ATLAS_NODES: AtlasNode[] = [
  ...named.map(([code, name, x, y]) => ({
    code,
    name,
    kind: "named" as const,
    ...fromLegacy(x, y),
    note: `编号 ${code} 的已命名观测节点。详细设定可在这里继续补充。`,
  })),
  ...unnamed.map(([x, y], index) => ({
    code: `U${String(index + 1).padStart(2, "0")}`,
    name: `未命名节点 ${String(index + 1).padStart(2, "0")}`,
    kind: "unnamed" as const,
    ...fromLegacy(x, y),
    note: "参考图中的未命名观测点，等待补充正式名称与档案。",
  })),
  ...manual,
];

export function normalizedPosition(node: AtlasNode) {
  return { u: node.x / MAP_SIZE.width, v: node.y / MAP_SIZE.height };
}
