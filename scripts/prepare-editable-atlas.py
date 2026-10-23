"""One-time bootstrap: preserve the accepted vector trace, append new coastlines.

Refuses to overwrite the editable master. Normal edits use build-atlas.py.
"""
import json
from atlas_geometry import ROOT,WIDTH,HEIGHT,path_data,path_geometry
from shapely.geometry import Polygon
from shapely.ops import unary_union
from svgelements import Path

out=ROOT/'art-source';out.mkdir(exist_ok=True)
target=out/'atlas-editable.svg'
if target.exists(): raise SystemExit('Editable master exists; refusing to overwrite manual edits.')
data=json.loads((ROOT/'public/assets/atlas-regions.json').read_text())
assert data['width']==8192,'Bootstrap requires the accepted 8192-pixel vector trace'
regions=[dict(r,geometry=Polygon(r['rings'][0],r['rings'][1:])) for r in data['regions']]

def write_svg(path,regions,width):
    lines=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="{width}" height="{HEIGHT}" viewBox="0 0 {width} {HEIGHT}">',
      '<title>Editable map master — filled paths only</title>',
      '<desc>The source reference occupies x=0..8192. x=8192..9216 is an assistant-authored seam extension, not source geography.</desc>',
      '<g id="regions" fill-rule="evenodd" stroke="#397b8a" stroke-width="2" stroke-linejoin="round">']
    for r in regions: lines.append(f'<path id="{r["id"]}" fill="{r["color"]}" d="{path_data(r["geometry"])}"/>')
    lines.append('</g></svg>');path.write_text('\n'.join(lines))

write_svg(out/'atlas-reference.svg',regions,8192)
# Endpoints exactly match the accepted trace; intermediate curves are new.
extensions={
 'region-131':'M8192,0 L8654,0 C8648,40 8690,63 8669,99 C8652,125 8618,104 8600,127 C8582,153 8622,174 8596,199 C8565,225 8525,188 8499,218 C8475,248 8504,270 8465,287 C8426,307 8392,270 8351,286 C8303,305 8262,259 8225,251 C8212,247 8202,239 8192,236 Z',
 'region-002':'M9216,186 C9175,180 9152,161 9115,167 C9073,177 9061,129 9020,143 C8980,155 8965,113 8925,129 C8889,146 8881,187 8848,180 C8813,173 8792,200 8771,226 C8748,250 8780,278 8812,280 C8840,283 8851,310 8883,296 C8917,281 8941,320 8973,306 C9017,286 9024,331 9065,323 C9103,315 9119,354 9155,344 C9177,339 9195,343 9216,348 Z',
 'region-001':'M9216,438 C9181,434 9157,411 9127,422 C9094,435 9075,418 9046,431 C9018,444 8997,431 8975,448 C8946,469 8966,492 8990,498 C9018,505 9018,530 9055,522 C9090,514 9103,546 9138,532 C9167,520 9188,536 9216,542 Z',
}
for r in regions:
    if r['id'] in extensions:
        extension=path_geometry(Path(extensions[r['id']]))
        r['geometry']=unary_union([r['geometry'],extension])
write_svg(target,regions,WIDTH)
print(f'Created {target.name}; preserved accepted source paths in atlas-reference.svg')
