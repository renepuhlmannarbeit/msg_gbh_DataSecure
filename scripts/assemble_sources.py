#!/usr/bin/env python3
from pathlib import Path
import hashlib, json

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / 'source-parts'
manifest = json.loads((PARTS / 'manifest.json').read_text(encoding='utf-8'))

for rel, spec in manifest.items():
    data = b''.join((PARTS / name).read_bytes() for name in spec['parts'])
    digest = hashlib.sha256(data).hexdigest()
    if digest != spec['sha256']:
        raise SystemExit(f'hash mismatch assembling {rel}: {digest} != {spec["sha256"]}')
    if len(data) != spec['bytes']:
        raise SystemExit(f'length mismatch assembling {rel}')
    target = ROOT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    print(f'assembled {rel} {len(data)} bytes sha256={digest}')
