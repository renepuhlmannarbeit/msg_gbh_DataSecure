import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { standaloneFontLicense, verifyStandaloneFontNotice } from '../scripts/lib/standalone-font-license.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = standaloneFontLicense(root);
const entries = new Map([['LICENSE-Inter.txt', fs.readFileSync(font.licensePath)]]);
const sbom = { packages: [font.package] };
verifyStandaloneFontNotice(entries, sbom);
verifyStandaloneFontNotice(new Map(), { packages: [] }); // historical no-font archive
assert.throws(() => verifyStandaloneFontNotice(new Map(), sbom), /FONT_LICENSE_MISSING/u);
assert.throws(() => verifyStandaloneFontNotice(entries, { packages: [] }), /FONT_SBOM_INVALID/u);
assert.throws(() => verifyStandaloneFontNotice(entries, { packages: [font.package, font.package] }), /FONT_SBOM_INVALID/u);
assert.throws(() => verifyStandaloneFontNotice(new Map([['LICENSE-Inter.txt', Buffer.from('changed')]]), sbom), /FONT_LICENSE_CHANGED/u);
for (const patch of [{ versionInfo: '5' }, { licenseDeclared: 'MIT' }, { checksums: [] }]) {
  assert.throws(() => verifyStandaloneFontNotice(entries, { packages: [{ ...font.package, ...patch }] }), /FONT_SBOM_INVALID/u);
}
for (const platform of ['package', 'macos-package', 'linux-package']) {
  const source = fs.readFileSync(path.join(root, 'scripts', `build-standalone-${platform}.mjs`), 'utf8');
  assert.match(source, /standaloneFontLicense\(root\)/u);
  assert.match(source, /font\.licensePath, 'LICENSE-Inter\.txt'/u);
  assert.match(source, /font\.package/u);
  const verifier = fs.readFileSync(path.join(root, 'scripts', `verify-standalone-${platform}.mjs`), 'utf8');
  assert.match(verifier, /verifyStandaloneFontNotice\(relative, sbom\)/u);
}
console.log('STANDALONE FONT PASS: pinned local bytes/license, honest SPDX, missing/changed/duplicate rejection, all target builders/verifiers; no native package claim');
