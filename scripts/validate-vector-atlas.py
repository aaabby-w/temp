"""Validate the EXPORTED, rounded coordinates, not just generator intermediates."""
from pathlib import Path
import hashlib
import json
import numpy as np
import shapely
from shapely.geometry import Polygon

root = Path(__file__).resolve().parents[1]
data = json.loads((root / 'public/assets/atlas-regions.json').read_text())
assert data['sourceSha256'] == hashlib.sha256((root / 'public/assets/fantasy-world-map.jpg').read_bytes()).hexdigest()
ids = {r['id'] for r in data['regions']}
polygons, largest_error, largest_overlap, total = [], 0, 0, 0
for r in data['regions']:
    p = Polygon(r['rings'][0], r['rings'][1:])
    assert p.is_valid, r['id']
    vertices = np.array(r['vertices']).reshape(-1, 2)
    indices = np.array(r['indices']).reshape(-1, 3)
    assert np.isfinite(vertices).all() and indices.min() >= 0 and indices.max() < len(vertices), r['id']
    assert (vertices >= 0).all() and (vertices <= [data['width'],data['height']]).all(), r['id']
    # Every triangle fits a narrow longitude band, including at the UV seam.
    assert np.ptp(vertices[indices][:,:,0], axis=1).max() <= 24.001, r['id']
    triangles = shapely.polygons(vertices[indices])
    mesh = shapely.unary_union(triangles)
    error = mesh.symmetric_difference(p).area
    overlap = sum(t.area for t in triangles) - mesh.area
    assert error < max(2, p.area * .00001), (r['id'], 'mesh outside region/hole',error)
    assert overlap < max(2, p.area * .00001), (r['id'], 'triangle overlap',overlap)
    assert set(r['neighbors']) <= ids and r['id'] not in r['neighbors']
    largest_error = max(largest_error,error)
    largest_overlap = max(largest_overlap,overlap)
    total += len(indices)
    polygons.append(p)
assert shapely.coverage_is_valid(polygons), 'Exported regions do not have shared boundaries'
result = {'regionCount':len(polygons),'fillTriangleCount':total,'exportedCoverageValid':True,
          'largestTriangleCoverageDifferenceSourcePixelsSquared':round(largest_error,6),
          'largestTriangleOverlapSourcePixelsSquared':round(largest_overlap,6),
          'sourceChecksumUnchanged':True}
if data.get('extensionWidth'):
    from atlas_geometry import seam_profile
    geo=[{'geometry':p,'color':r['color']} for p,r in zip(polygons,data['regions'])]
    assert seam_profile(geo,0)==seam_profile(geo,data['width']), 'Exported periodic seam mismatch'
    result['periodicSeamMatches']=True
(root/'docs/vector-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
