"""Compile the editable SVG without ever retracing or overwriting it."""
import argparse
import json
from pathlib import Path
from atlas_geometry import ROOT,load_svg,compile_atlas

parser=argparse.ArgumentParser()
parser.add_argument('source',nargs='?',default=str(ROOT/'art-source/atlas-editable.svg'))
parser.add_argument('--output',default=str(ROOT/'public/assets'))
args=parser.parse_args()
source=Path(args.source).resolve()
try:
    report=compile_atlas(load_svg(source),source,Path(args.output))
except (ValueError,AssertionError) as error:
    parser.exit(1,f'\n地图未更新：{error}\n')
if Path(args.output).resolve()==ROOT/'public/assets':
    (ROOT/'docs/atlas-build-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report,indent=2,ensure_ascii=False))
