"""Exercise real authoring edits; all outputs stay in a temporary directory."""
import copy
import hashlib
import json
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from shapely.geometry import box
from svgelements import Path as SVGPath
from atlas_geometry import ROOT,WIDTH,HEIGHT,load_svg,compile_atlas,path_geometry

master=ROOT/'art-source/atlas-editable.svg'
original=load_svg(master)
by_id={r['id']:r for r in original}
frame=box(0,0,8192,HEIGHT)
reference=ET.parse(ROOT/'art-source/atlas-reference.svg')
for p in reference.getroot().iter('{http://www.w3.org/2000/svg}path'):
    accepted=path_geometry(SVGPath(p.attrib['d']))
    current=by_id[p.attrib['id']]['geometry'].intersection(frame)
    assert accepted.symmetric_difference(current).area < .01,p.attrib['id']

# Find an isolated island with room around it; don't depend on a guessed ID.
island=next(r for r in original if r['kind']=='land' and r['geometry'].geom_type=='Polygon'
    and 500<r['geometry'].area<30000 and 20<r['geometry'].bounds[0]<8000
    and r['geometry'].bounds[1]>20 and r['geometry'].bounds[3]<HEIGHT-20
    and all(r is other or r['geometry'].distance(other['geometry'])>35 for other in original))
svg_namespace='{http://www.w3.org/2000/svg}'
with tempfile.TemporaryDirectory(prefix='atlas-edit-check-') as directory:
    directory=Path(directory)
    tree=ET.parse(master);group=tree.getroot().find(svg_namespace+'g')
    selected=next(p for p in group if p.attrib.get('id')==island['id'])
    group.remove(selected)
    modified=directory/'deleted.svg';tree.write(modified)
    report=compile_atlas(load_svg(modified),modified,directory/'deleted')
    removed=json.loads((directory/'deleted/atlas-regions.json').read_text())
    assert not any(r['sourceId']==island['id'] for r in removed['regions'])
    # Smooth cubic shape + transformed object: exactly what vector editors save.
    new=ET.SubElement(group,svg_namespace+'path',{'id':'custom-test-island','fill':'#b2dbcb',
      'd':'M8600,1400 C8620,1340 8720,1340 8740,1400 C8720,1460 8620,1460 8600,1400 Z',
      'transform':'translate(30 20)'})
    edited=directory/'added.svg';tree.write(edited)
    added=load_svg(edited)
    curve=next(r for r in added if r['id']=='custom-test-island')
    assert abs(curve['geometry'].bounds[0]-8630)<.01
    compile_atlas(added,edited,directory/'added')
    # Overlaps and open paths must fail and leave existing output bytes alone.
    outputs=directory/'added'
    before=hashlib.sha256((outputs/'atlas-regions.json').read_bytes()).hexdigest()
    duplicate=copy.deepcopy(new);duplicate.attrib['id']='overlap-test';group.append(duplicate)
    bad=directory/'overlap.svg';tree.write(bad)
    try: compile_atlas(load_svg(bad),bad,outputs)
    except ValueError as error: assert '重叠' in str(error)
    else: raise AssertionError('Overlapping fills were silently accepted')
    assert hashlib.sha256((outputs/'atlas-regions.json').read_bytes()).hexdigest()==before
    group.remove(duplicate);new.attrib['d']='M8600,1400 L8700,1400 L8700,1500'
    tree.write(bad)
    try: load_svg(bad)
    except ValueError as error: assert '未闭合' in str(error)
    else: raise AssertionError('Open path was silently accepted')
result={'originalGeographyUnchanged':True,'deletedIsland':island['id'],'curveAndTransformImport':True,
        'overlapRejectedWithoutOverwrite':True,'openPathRejected':True,'periodicSeamMatches':report['periodicSeamMatches']}
(ROOT/'docs/atlas-editing-test.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
