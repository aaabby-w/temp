"""Reproducible raster-to-vector tracing. Source artwork is read-only.

Install offline build tools from scripts/requirements-vector.txt. Browser/runtime
needs only the generated SVG/JSON and the project's existing Three.js dependency.
"""
from pathlib import Path
import hashlib
import json
import math
import cv2
import numpy as np
from scipy import ndimage
from rasterio.features import shapes, rasterize
from rasterio.transform import Affine
import shapely
from shapely.geometry import shape, box, LineString

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/assets/fantasy-world-map.jpg'
OUT = ROOT / 'art-source/traced'
WIDTH, HEIGHT = 8192, 1900
SCALE = 2
MIN_AREA = 20  # Seed interior pixels, not final polygon area.


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms:
            yield from polygons(part)


def rings(geometry):
    return [[[round(x, 3), round(y, 3)] for x, y in ring.coords]
            for ring in [geometry.exterior, *geometry.interiors]]


def svg_path(geometry):
    return ' '.join('M' + ' L'.join(f'{x:g},{y:g}' for x, y in ring) + ' Z'
                    for ring in rings(geometry))


def hex_color(rgb):
    return '#%02x%02x%02x' % tuple(np.round(rgb).astype(int))


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    cv2.setNumThreads(2)
    rgb = cv2.cvtColor(cv2.imread(str(SOURCE)), cv2.COLOR_BGR2RGB)
    assert rgb.shape[:2] == (HEIGHT, WIDTH)
    # The source is softly resampled artwork. Half-resolution segmentation
    # suppresses its JPEG ringing; output paths retain the original coordinates.
    rgb = cv2.resize(rgb, (WIDTH // SCALE, HEIGHT // SCALE), interpolation=cv2.INTER_AREA)
    # Segment by the DRAWN linework, not nearest palette color. A JPEG fill
    # contains gradients/compression noise; quantizing it creates fake countries.
    blur = cv2.GaussianBlur(rgb, (5, 5), 1)
    edges = np.max([cv2.Canny(blur[:, :, i], 8, 18) for i in range(3)], axis=0)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats((edges == 0).astype(np.uint8), connectivity=4)
    inside = cv2.distanceTransform((edges == 0).astype(np.uint8), cv2.DIST_L2, 5)
    thickness = ndimage.maximum(inside, labels, np.arange(count))
    valid = (stats[:, cv2.CC_STAT_AREA] >= MIN_AREA) & (thickness >= 2.8)
    valid[0] = False
    palette = np.full((count, 3), 255, np.uint8)
    water = np.zeros(count, bool)
    water[0] = True
    remap = np.arange(count, dtype=np.int32)
    removed = []
    for index in np.where(valid)[0]:
        x, y, w, h, area = stats[index]
        color = np.median(rgb[y:y+h, x:x+w][labels[y:y+h, x:x+w] == index], axis=0)
        if color.min() >= 242:
            color[:] = 255
            water[index] = True
            # Keep enclosed pale islets/lakes as outlined features. Only the
            # boundary-touching ocean becomes the background region.
            if x == 0 or y == 0 or x+w == labels.shape[1] or y+h == labels.shape[0]:
                remap[index] = 0
        elif color.min() < 150 or color.max()-color.min() < 18:
            valid[index] = False
        palette[index] = np.round(color)
    for index in range(1, count):
        if not valid[index]:
            x, y, w, h, area = stats[index]
            removed.append({'bbox': [int(n*SCALE) for n in (x,y,w,h)], 'seedArea': int(area*SCALE**2)})
    indices = ndimage.distance_transform_edt(~valid[labels], return_distances=False, return_indices=True)
    labels = remap[labels[tuple(indices)]]
    del indices
    raw, colors = [], []
    for geo, value in shapes(labels, connectivity=4, transform=Affine.scale(SCALE)):
        polygon = shape(geo)
        for part in polygons(shapely.make_valid(polygon)):
            raw.append(part)
            colors.append(int(value))
    # Raster polygonization can omit intermediate vertices at T junctions.
    # Node the shared linework globally before simplifying the coverage.
    noded = shapely.unary_union([p.boundary for p in raw])
    raw = list(shapely.polygonize(list(noded.geoms)).geoms)
    colors = []
    for p in raw:
        center = p.representative_point()
        colors.append(int(labels[min(labels.shape[0]-1, int(center.y / SCALE)), min(labels.shape[1]-1, int(center.x / SCALE))]))
    assert shapely.coverage_is_valid(raw), 'Segmentation does not form a valid coverage'
    # Simplify the whole partition, including ocean, in one operation: neighbors
    # share exactly the same vertices after simplification.
    simplified = shapely.coverage_simplify(raw, tolerance=4.5)
    assert shapely.coverage_is_valid(simplified), 'Shared boundary topology failed'
    assert all(p.is_valid for p in simplified), 'Invalid polygon'
    # Smooth the SHARED graph, not each face independently. Keep T-junctions
    # fixed; Chaikin corner cutting stays within the local control polygon.
    graph = shapely.line_merge(shapely.unary_union([p.boundary for p in simplified]))
    smooth_lines = []
    for chain in graph.geoms:
        points = np.asarray(chain.coords)
        closed = np.array_equal(points[0], points[-1])
        # Keep the coordinate frame exact (uncoveredArea must remain zero).
        frame = any(np.any(points[:, axis] == value) for axis,value in [(0,0),(0,WIDTH),(1,0),(1,HEIGHT)])
        if not frame:
            for _ in range(2):
                a, b = points[:-1], points[1:]
                cut = np.stack([.75*a+.25*b, .25*a+.75*b],axis=1).reshape(-1,2)
                points = np.vstack([cut,cut[0]]) if closed else np.vstack([points[0],cut,points[-1]])
        smooth_lines.append(LineString(points))
    smooth_faces = list(shapely.polygonize(smooth_lines).geoms)
    assert len(smooth_faces) == len(simplified), 'Smoothing changed the face topology'
    source_tree = shapely.STRtree(simplified)
    smooth_colors = []
    for face in smooth_faces:
        matches = source_tree.query(face.representative_point(), predicate='intersects')
        assert len(matches) == 1, 'Could not recover region after shared-line smoothing'
        smooth_colors.append(colors[matches[0]])
    simplified, colors = smooth_faces, smooth_colors
    assert shapely.coverage_is_valid(simplified), 'Smoothing broke shared boundary topology'
    land = sorted([(p, c) for p, c in zip(simplified, colors) if c], key=lambda t: (t[0].centroid.x, t[0].centroid.y))
    print('Land regions:', len(land), 'Building vector triangles…', flush=True)
    tree = shapely.STRtree([p for p, _ in land])
    regions = []
    for index, (p, c) in enumerate(land):
        # Clip into narrow longitude strips BEFORE triangulation. Large flat
        # triangles would cut chords across the cylinder and create gaps.
        verts, triangles, cache = [], [], {}
        minx, _, maxx, _ = p.bounds
        for x in range(math.floor(minx / 24) * 24, math.ceil(maxx / 24) * 24, 24):
            clipped = p.intersection(box(x, -1, x + 24, HEIGHT + 1))
            for part in polygons(clipped):
                for tri in shapely.constrained_delaunay_triangles(part).geoms:
                    for xy in list(tri.exterior.coords)[:3]:
                        key = tuple(round(v, 3) for v in xy)
                        if key not in cache:
                            cache[key] = len(verts) // 2
                            verts.extend(key)
                        triangles.append(cache[key])
        neighbors = []
        for other in tree.query(p, predicate='intersects'):
            if other != index and p.boundary.intersection(land[other][0].boundary).length > .1:
                neighbors.append(f'region-{other+1:03}')
        regions.append({'id': f'region-{index+1:03}', 'color': hex_color(palette[c]), 'kind': 'water' if water[c] else 'land',
            'rings': rings(p), 'vertices': verts, 'indices': triangles,
            'neighbors': sorted(neighbors), 'area': round(p.area, 2)})
    # Deduplicate all boundaries, distinguish coastlines from shared borders.
    all_lines = shapely.unary_union([p.boundary for p, _ in land])
    coastline = shapely.unary_union([p.boundary for p,c in zip(simplified,colors) if water[c]])
    coastline = coastline.difference(box(0, 0, WIDTH, HEIGHT).boundary)
    interior = all_lines.difference(coastline)
    def line_arrays(geometry):
        if geometry.geom_type in ('LineString', 'LinearRing'):
            return [[[round(x, 3), round(y, 3)] for x,y in geometry.coords]]
        return [points for g in getattr(geometry, 'geoms', []) for points in line_arrays(g)]
    data = {'width': WIDTH, 'height': HEIGHT, 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'regions': regions, 'coastlines': line_arrays(coastline), 'borders': line_arrays(interior)}
    (OUT / 'atlas-regions.json').write_text(json.dumps(data, separators=(',', ':')))
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}">',
        '<title>Vector atlas traced from the supplied reference</title>', '<rect width="8192" height="1900" fill="white"/>',
        '<g stroke="#739d94" stroke-width="2" stroke-linejoin="round" fill-rule="evenodd">']
    for region, (p, _) in zip(regions, land):
        svg.append(f'<path id="{region["id"]}" fill="{region["color"]}" d="{svg_path(p)}"/>')
    svg.append('</g><g fill="none" stroke="#397b8a" stroke-width="3.2" stroke-linejoin="round">')
    for line in data['coastlines']:
        svg.append('<path d="M' + ' L'.join(f'{x:g},{y:g}' for x,y in line) + '"/>')
    svg.append('</g></svg>')
    (OUT / 'atlas.svg').write_text('\n'.join(svg))
    restored = rasterize([(p, c) for p,c in zip(simplified, colors)], out_shape=labels.shape, transform=Affine.scale(SCALE), dtype='int32')
    coverage = shapely.unary_union(simplified)
    area_sum = sum(p.area for p in simplified)
    assert abs(WIDTH*HEIGHT-coverage.area) < .01, 'Uncovered vector partition area'
    assert abs(area_sum-coverage.area) < .01, 'Overlapping vector partition area'
    report = {'source': SOURCE.name, 'sourceSha256': data['sourceSha256'], 'coordinateSystem': [WIDTH, HEIGHT],
        'regionCount': len(regions), 'holeCount': sum(len(p.interiors) for p,_ in land),
        'palette': sorted(set(r['color'] for r in regions)), 'triangleCount': sum(len(r['indices']) // 3 for r in regions),
        'sharedBoundaryCoverageValid': bool(shapely.coverage_is_valid(simplified)),
        'uncoveredArea': round(WIDTH*HEIGHT-coverage.area, 8), 'overlapArea': round(area_sum-coverage.area, 8),
        'segmentationAgreementPercent': round(100 * float((restored == labels).mean()), 4),
        'discardedThinOrSmallSeedComponents': removed,
        'limitations': ['Color segmentation is inferred from a JPEG, not an original layered/vector file.',
          'Thin or tiny enclosed features with no reliable interior seed are listed for review.',
          'Two adjacent same-color regions without a visible line cannot be recovered automatically.',
          'The original left and right edges are not geographically continuous; vectorization does not invent new coastlines.']}
    (ROOT / 'docs/vectorization-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({k:v for k,v in report.items() if k not in ['discardedThinOrSmallSeedComponents', 'limitations', 'palette']}, indent=2), flush=True)


if __name__ == '__main__':
    main()
