import path from 'node:path';
import assert from 'node:assert/strict';
import { readRegular, sha256 } from './bundled-runtime.mjs';

// Unmodified official Inter 4.1 assets. No build-time download or CDN.
export function standaloneFontLicense(root) {
  const directory = path.join(root, 'apps', 'datasecure-standalone', 'frontend', 'fonts');
  const font = readRegular(path.join(directory, 'InterVariable.woff2'), 1024 * 1024);
  const licensePath = path.join(directory, 'LICENSE-Inter.txt');
  const license = readRegular(licensePath, 32 * 1024);
  const digest = '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3';
  if (sha256(font) !== digest || sha256(license) !== '262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a') {
    throw new Error('STANDALONE_FONT_ASSET_CHANGED');
  }
  return {
    licensePath,
    package: {
      name: 'Inter Variable', SPDXID: 'SPDXRef-Inter', versionInfo: '4.1',
      downloadLocation: 'https://github.com/rsms/inter/raw/refs/tags/v4.1/docs/font-files/InterVariable.woff2',
      filesAnalyzed: false, checksums: [{ algorithm: 'SHA256', checksumValue: digest }],
      licenseConcluded: 'OFL-1.1', licenseDeclared: 'OFL-1.1',
      comment: 'Unmodified local font embedded in the desktop frontend; LICENSE-Inter.txt accompanies the package.'
    }
  };
}

// Historical archives without Inter remain verifiable. New font-bearing
// archives must carry both the exact license and its truthful SBOM component.
export function verifyStandaloneFontNotice(entries, sbom) {
  const fonts = (sbom.packages || []).filter(item => item.name === 'Inter Variable' || item.SPDXID === 'SPDXRef-Inter');
  if (!fonts.length && !entries.has('LICENSE-Inter.txt')) return;
  assert.equal(fonts.length, 1, 'STANDALONE_FONT_SBOM_INVALID');
  const font = fonts[0];
  assert.equal(font.name, 'Inter Variable', 'STANDALONE_FONT_SBOM_INVALID');
  assert.equal(font.versionInfo, '4.1', 'STANDALONE_FONT_SBOM_INVALID');
  assert.equal(font.licenseDeclared, 'OFL-1.1', 'STANDALONE_FONT_SBOM_INVALID');
  assert.equal(font.licenseConcluded, 'OFL-1.1', 'STANDALONE_FONT_SBOM_INVALID');
  assert.deepEqual(font.checksums, [{ algorithm: 'SHA256', checksumValue:
    '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3' }], 'STANDALONE_FONT_SBOM_INVALID');
  assert.ok(Buffer.isBuffer(entries.get('LICENSE-Inter.txt')), 'STANDALONE_FONT_LICENSE_MISSING');
  assert.equal(sha256(entries.get('LICENSE-Inter.txt')),
    '262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a', 'STANDALONE_FONT_LICENSE_CHANGED');
}
