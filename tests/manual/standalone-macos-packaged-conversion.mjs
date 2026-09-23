// E0 only: execute the real converter from the extracted distribution app.
// Finder, quarantine and Gatekeeper still require a separate target-host test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { office, image, pdf, text } from '../helpers/conversion-fixtures.mjs';

if (process.platform !== 'darwin') throw new Error('MACOS_PACKAGE_HOST_REQUIRED');
const appArgument = process.argv[2];
if (!appArgument || path.basename(appArgument) !== 'DataSecure Standalone.app') {
  throw new Error('MACOS_PACKAGE_APP_REQUIRED');
}
const app = fs.realpathSync(appArgument);
const server = path.join(app, 'Contents', 'Resources', 'server');
const require = createRequire(import.meta.url);
const { convertBuffer } = require(path.join(server, 'standalone', 'conversion-worker.js'));

for (const [label, bytes, extension] of [
  ['office', office('xlsx'), '.xlsx'],
  ['pdf', pdf([{ text }]), '.pdf'],
  ['ocr', image().toBuffer('image/png'), '.png']
]) {
  const result = await convertBuffer(bytes, extension, { timeoutMs: 90_000 });
  assert.equal(result.processing_mode, 'markdown-only', `MACOS_PACKAGE_${label}_MODE`);
  assert.ok(result.markdown.includes('Max Mustermann'), `MACOS_PACKAGE_${label}_CONTENT`);
  process.stdout.write(`MACOS PACKAGE CONVERSION PASS (${label})\n`);
}
