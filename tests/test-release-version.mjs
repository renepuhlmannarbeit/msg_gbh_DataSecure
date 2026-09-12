import assert from 'node:assert/strict';
import {advanceReleaseSource} from '../scripts/lib/release-version.mjs';
const history = '\nDer Windows-x64-Cowork-Kandidat RC138 bleibt an Quellcommit `' + 'a'.repeat(40) + '` gebunden.\n';
for (const first of [
  'Der aktuelle Quellstand ist RC138 und für Cowork als technischer\nVorabkandidat veröffentlicht.',
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
console.log('Release version transition: plain published, candidate and development forms preserve historical evidence: PASS');
