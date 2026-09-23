import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {advanceReleaseSource} from '../scripts/lib/release-version.mjs';
const history = '\nDer Windows-x64-Cowork-Kandidat RC138 bleibt an Quellcommit `' + 'a'.repeat(40) + '` gebunden.\n';
for (const first of [
  'Der aktuelle Quellstand ist RC138 und für Cowork als technischer\nVorabkandidat veröffentlicht.',
  'Der aktuelle Quellstand ist RC138 und für Standalone macOS als technischer Vorabkandidat veröffentlicht.',
  'Der aktuelle Quellstand ist RC138-Kandidat und veröffentlicht.',
  'Der aktuelle Quellstand ist RC138-Entwicklungsstand und noch nicht gebunden.'
]) {
  const source = '# Release\r\n\r\n' + first + history;
  const next = advanceReleaseSource(source, {previous:'3.2.0-rc138', target:'3.2.0-rc139'});
  assert.match(next, /aktuelle Quellstand ist RC139-Entwicklungsstand und noch kein neu gebundener Paketkandidat\./u);
  assert.ok(next.endsWith(history), 'historical commit evidence is immutable');
  assert.equal(advanceReleaseSource(next, {previous:'3.2.0-rc139', target:'3.2.0-rc139'}), next);
  assert.equal(advanceReleaseSource(source, {previous:'3.2.0-rc138', target:'3.2.0-rc138'}), source);
}
assert.throws(() => advanceReleaseSource('missing', {previous:'1.0.0', target:'2.0.0'}), /RELEASE_SOURCE_STATEMENT_MISSING/u);
// Execute the real synchronizer, not a regex/mocked write: a bad release marker
// must fail before touching even package.json or trying the remaining files.
const scope = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-version-preflight-'));
try {
  fs.mkdirSync(path.join(scope, 'scripts/lib'), { recursive: true });
  fs.mkdirSync(path.join(scope, 'docs'));
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['scripts/set-version.mjs', 'scripts/lib/release-version.mjs']) {
    fs.copyFileSync(path.join(repo, file), path.join(scope, file));
  }
  const packageBytes = '{"version":"3.2.0-rc140"}\n';
  fs.writeFileSync(path.join(scope, 'package.json'), packageBytes);
  fs.writeFileSync(path.join(scope, 'docs/RELEASE.md'), 'Missing source marker.\n');
  const result = spawnSync(process.execPath, [path.join(scope, 'scripts/set-version.mjs'), '3.2.0-rc141'],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RELEASE_SOURCE_STATEMENT_MISSING/u);
  assert.equal(fs.readFileSync(path.join(scope, 'package.json'), 'utf8'), packageBytes);
} finally {
  fs.rmSync(scope, { recursive: true, force: true });
}
console.log('Release version transition: plain published, candidate and development forms preserve historical evidence: PASS');
