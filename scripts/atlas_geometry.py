"""SVG authoring -> shared boundaries -> real cylindrical-map geometry."""
from pathlib import Path
import hashlib
import json
import math
import xml.etree.ElementTree as ET
from xml.sax.saxutils import quoteattr
import numpy as np
import shapely
from shapely.geometry import Polygon, box, LineString
from svgelements import SVG, Path as SVGPath, Shape, Move, Close, Line

ROOT = Path(__file__).resolve().parents[1]
SOURCE_WIDTH, HEIGHT, WIDTH = 8192, 1900, 9216


def parts(g):
    if g.geom_type == 'Polygon':
        yield g
    elif hasattr(g, 'geoms'):
        for child in g.geoms:
            yield from parts(child)


def arrays(g):
    if g.is_empty: return []
    if g.geom_type in ('LineString', 'LinearRing'):
        return [[[round(x, 4), round(y, 4)] for x, y in g.coords]]
    return [points for child in getattr(g, 'geoms', []) for points in arrays(child)]


def rings(p):
    return arrays(p.exterior) + [points for hole in p.interiors for points in arrays(hole)]


def path_data(g):
    return ' '.join('M' + ' L'.join(f'{x:g},{y:g}' for x,y in r) + ' Z' for p in parts(g) for r in rings(p))


def path_geometry(path):
    """Flatten curves to <= 0.35 source-pixel chord deviation, preserve holes."""
    contours, current = [], []
    def curve_points(segment, a=0., b=1., depth=0):
        start, end = segment.point(a), segment.point(b)
        m = (a+b)/2
        points = [segment.point(a+(b-a)*t) for t in (.25,.5,.75)]
        chord = LineString([(start.x,start.y),(end.x,end.y)])
        error = max(shapely.Point(p.x,p.y).distance(chord) for p in points)
        if error <= .35 or depth >= 15:
            return [(end.x,end.y)]
        return curve_points(segment,a,m,depth+1)+curve_points(segment,m,b,depth+1)
    for segment in path:
        if isinstance(segment, Move):
            if current:
                raise ValueError('存在未闭合路径，请闭合轮廓后再导入')
            current = [(segment.end.x,segment.end.y)]
        elif isinstance(segment, Close):
            if len(current) >= 3:
                p=Polygon(current)
                if not p.is_valid:
                    raise ValueError('路径自相交：请检查交叉的节点或拆分轮廓')
                if p.area > .001: contours.append(p)
            current=[]
        elif isinstance(segment, Line):
            current.append((segment.end.x,segment.end.y))
        else:
            current.extend(curve_points(segment))
    if current:
        raise ValueError('存在未闭合路径，请闭合轮廓后再导入')
    # Authoring master explicitly uses evenodd: nested contours become holes.
    result=Polygon()
    for p in contours: result=result.symmetric_difference(p)
    return result


def load_svg(filename):
    doc=ET.parse(filename).getroot()
    viewbox=[float(v) for v in doc.attrib.get('viewBox','').replace(',',' ').split()]
    if viewbox != [0,0,WIDTH,HEIGHT]:
        raise ValueError(f'画布 viewBox 必须保持 0 0 {WIDTH} {HEIGHT}，请勿缩放画布')
    for element in doc.iter():
        tag=element.tag.rsplit('}',1)[-1]
        if tag in ('image','text','use','clipPath','mask','filter','linearGradient','radialGradient','pattern'):
            raise ValueError(f'不支持 {tag}；请仅保留纯色闭合路径，去掉位图、文字、渐变和特效')
    result=[]
    drawing=SVG.parse(str(filename),reify=True,ppi=96,width=WIDTH,height=HEIGHT)
    seen=set()
    for i, element in enumerate(drawing.elements()):
        if not isinstance(element,Shape) or element.id == 'ocean-background': continue
        if element.fill.value is None: continue
        if element.values.get('display') == 'none': continue
        name=element.id or f'custom-{i:03}'
        if name in seen: raise ValueError(f'重复 ID：{name}')
        seen.add(name)
        if element.fill.opacity != 1 or any(float(element.values.get(key,1)) != 1 for key in ('opacity','fill-opacity')):
            raise ValueError(f'{name}：填色必须完全不透明')
        p=SVGPath(element)
        p.reify()
        try: geometry=path_geometry(p)
        except ValueError as error: raise ValueError(f'{name}: {error}') from error
        if geometry.is_empty: continue
        outside=geometry.difference(box(0,0,WIDTH,HEIGHT)).area
        if outside > .05: raise ValueError(f'{name} 超出画布，请将路径裁切至画布内')
        color=element.fill.hex[:7]
        result.append({'id':name,'geometry':geometry,'color':color,'kind':'water' if color.lower()=='#ffffff' else 'land'})
    if not result: raise ValueError('SVG 中没有可导入的填色路径')
    return result


def seam_profile(regions,x):
    line=LineString([(x,0),(x,HEIGHT)])
    profile=[]
    for r in regions:
        hit=r['geometry'].intersection(line)
        for points in arrays(hit):
            ys=[p[1] for p in points]
            if max(ys)-min(ys)>.001: profile.append((round(min(ys),4),round(max(ys),4),r['color']))
    return sorted(profile)


def compile_atlas(regions,authoring_path,out):
    """Fail before replacing runtime files if edits are unsafe."""
    original_regions=regions
    regions=[dict(r,id=r['id'] if len(list(parts(r['geometry'])))==1 else f'{r["id"]}-part{index+1}',
                  sourceId=r['id'],geometry=p) for r in regions for index,p in enumerate(parts(r['geometry']))]
    geometry=[r['geometry'] for r in regions]
    union=shapely.unary_union(geometry)
    overlap=sum(p.area for p in geometry)-union.area
    if overlap > .05:
        raise ValueError(f'色块有 {overlap:.2f} 平方像素重叠；请用路径差集／联合修好，旧网页资产未替换')
    left,right=seam_profile(original_regions,0),seam_profile(original_regions,WIDTH)
    if left != right: raise ValueError(f'左右接缝不匹配，请成对修改边缘。左 {left}；右 {right}')
    # Global noding splits T-junctions and provides one authoritative boundary.
    ocean=box(0,0,WIDTH,HEIGHT).difference(union)
    noded=shapely.unary_union([p.boundary for p in geometry]+[ocean.boundary])
    faces=list(shapely.polygonize(list(noded.geoms)).geoms)
    tree=shapely.STRtree(geometry)
    normalized=[]
    for face in faces:
        matches=tree.query(face.representative_point(),predicate='intersects')
        if len(matches)>1: raise ValueError('色块内部存在重叠')
        if len(matches)==1: normalized.append(dict(regions[matches[0]],geometry=face))
    if len(normalized)!=len(regions): raise ValueError('区域分区数发生变化，请检查被切断或重复的路径')
    if not shapely.coverage_is_valid([r['geometry'] for r in normalized]): raise ValueError('共用边界验证失败')
    regions=normalized
    geometry=[r['geometry'] for r in regions]
    tree=shapely.STRtree(geometry)
    exported=[]
    for index,r in enumerate(regions):
        p=r['geometry']; vertices=[]; indices=[]; cache={}
        for x in range(math.floor(p.bounds[0]/24)*24,math.ceil(p.bounds[2]/24)*24,24):
            for piece in parts(p.intersection(box(x,-1,x+24,HEIGHT+1))):
                for triangle in shapely.constrained_delaunay_triangles(piece).geoms:
                    for xy in list(triangle.exterior.coords)[:3]:
                        xy=tuple(round(v,4) for v in xy)
                        if xy not in cache:
                            cache[xy]=len(vertices)//2;vertices.extend(xy)
                        indices.append(cache[xy])
        neighbors=[regions[j]['id'] for j in tree.query(p,predicate='intersects') if j!=index and p.boundary.intersection(geometry[j].boundary).length>.01]
        exported.append({'id':r['id'],'sourceId':r['sourceId'],'color':r['color'],'kind':r['kind'],
            'rings':rings(p),'vertices':vertices,'indices':indices,'neighbors':sorted(neighbors),'area':round(p.area,4)})
    # Validate rounded export coordinates before replacing either live asset.
    for r in exported:
        p=Polygon(r['rings'][0],r['rings'][1:])
        vertices=np.array(r['vertices']).reshape(-1,2)
        indices=np.array(r['indices']).reshape(-1,3)
        if not len(indices) or not np.isfinite(vertices).all():
            raise ValueError(f'{r["id"]}：三角化未生成有效面')
        triangles=shapely.polygons(vertices[indices])
        mesh=shapely.unary_union(triangles)
        tolerance=max(2,p.area*.00001)
        if mesh.symmetric_difference(p).area > tolerance or sum(t.area for t in triangles)-mesh.area > tolerance:
            raise ValueError(f'{r["id"]}：三角化验证失败，旧网页资产未替换')
    frame=box(0,0,WIDTH,HEIGHT).boundary
    water=[r['geometry'] for r in regions if r['kind']=='water']
    coast=shapely.unary_union([ocean.boundary]+[p.boundary for p in water]).difference(frame)
    all_lines=shapely.unary_union([p.boundary for p in geometry]).difference(frame)
    borders=all_lines.difference(coast)
    source=ROOT/'public/assets/fantasy-world-map.jpg'
    data={'width':WIDTH,'height':HEIGHT,'sourceWidth':SOURCE_WIDTH,'extensionWidth':WIDTH-SOURCE_WIDTH,
          'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'authoringSha256':hashlib.sha256(Path(authoring_path).read_bytes()).hexdigest(),
          'regions':exported,'coastlines':arrays(coast),'borders':arrays(borders)}
    svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}">',
         '<title>Vector atlas with authored seam extension</title>',f'<rect width="{WIDTH}" height="{HEIGHT}" fill="white"/>',
         '<g stroke="none" fill-rule="evenodd">']
    for r in regions: svg.append(f'<path id={quoteattr(r["id"])} fill="{r["color"]}" d="{path_data(r["geometry"])}"/>')
    svg.append('</g>')
    for linework,color,width in [(coast,'#397b8a',3.2),(borders,'#739d94',2)]:
        svg.append(f'<g fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round">')
        for points in arrays(linework): svg.append('<path d="M'+' L'.join(f'{x:g},{y:g}' for x,y in points)+'"/>')
        svg.append('</g>')
    svg.append('</svg>')
    report={'authoringFile':str(Path(authoring_path).relative_to(ROOT)) if Path(authoring_path).is_relative_to(ROOT) else Path(authoring_path).name,
      'regionCount':len(regions),'fillTriangleCount':sum(len(r['indices'])//3 for r in exported),
      'overlapArea':round(overlap,6),'sharedBoundaryCoverageValid':True,'periodicSeamMatches':True,
      'seamProfile':left,'dimensions':[WIDTH,HEIGHT],'sourceDimensions':[SOURCE_WIDTH,HEIGHT],
      'extensionSource':'Assistant-authored vector coastlines, not canonical source geography. No raster image generation.'}
    out.mkdir(parents=True,exist_ok=True)
    (out/'atlas-regions.json').write_text(json.dumps(data,separators=(',',':')))
    (out/'atlas.svg').write_text('\n'.join(svg))
    return report
