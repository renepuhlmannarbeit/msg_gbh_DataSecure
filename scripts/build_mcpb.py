#!/usr/bin/env python3
from pathlib import Path
import json, zipfile, hashlib

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
version=manifest['version']
out=ROOT/'dist'/f"EU-Privacy-Document-Gateway-Windows-v{version}.mcpb"
out.parent.mkdir(exist_ok=True)
include=['manifest.json','package.json','README.md','SECURITY.md','ARCHITECTURE_DECISION.md','TEST_REPORT.md','THIRD_PARTY_NOTICES.md','BUILD_INFO.json']
for d in ['server','scripts','docs','assets']:
    for p in (ROOT/d).rglob('*'):
        if p.is_file() and p.name!='build_mcpb.py': include.append(p.relative_to(ROOT).as_posix())
include.append('scripts/build_mcpb.py')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for rel in sorted(set(include)):
        z.write(ROOT/rel,rel)
h=hashlib.sha256(out.read_bytes()).hexdigest()
print(out)
print('sha256',h)
