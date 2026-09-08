import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inspectSourceFormatFromFd } = require('../plugins/data-secure/server/gateway/source-format-inspector');
const { enumerateSourceFolderAsync } = require('../plugins/data-secure/server/companion/source-folder');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { anonymize, scanResidual } = require('../plugins/data-secure/server/privacy/engine');
const { decodePng } = require('../plugins/data-secure/server/images/png');
const { decodeBmp } = require('../plugins/data-secure/server/images/bmp');
const { loadImage } = await import('../native/ocr/pilot/node_modules/@napi-rs/canvas/index.js');
const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-format-corpus-'));
const first = path.join(root, 'first'), second = path.join(root, 'second');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function generate(destination) {
  const result = childProcess.spawnSync(process.execPath,
    [path.join(repo, 'scripts', 'generate-standalone-format-corpus.mjs'), destination],
    { cwd: repo, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

try {
  generate(first); generate(second);
  assert.equal(hash(`${first}.zip`), hash(`${second}.zip`), 'the distributable corpus must be byte reproducible');
  const rows = fs.readFileSync(`${first}-MANIFEST.csv`, 'utf8').trim().split(/\r?\n/u).slice(1)
    .map(line => line.split(';'));
  assert.equal(rows.length, 100);
  const expected = { txt: 25, markdown: 24, csv: 24, docx: 4, xlsx: 4, pptx: 4,
    'pdf-text': 3, 'pdf-scan': 3, png: 3, jpeg: 3, bmp: 3 };
  assert.deepEqual(Object.fromEntries(Object.keys(expected).map(category =>
    [category, rows.filter(row => row[1] === category).length])), expected);
  for (const category of Object.keys(expected)) {
    assert.deepEqual([...new Set(rows.filter(row => row[1] === category).map(row => row[2]))].sort(),
      ['large', 'medium', 'short']);
  }
  for (const row of rows) {
    const full = path.join(first, ...row[3].split('/'));
    const extension = path.extname(full).toLowerCase();
    const stat = fs.statSync(full), fd = fs.openSync(full, fs.constants.O_RDONLY);
    try {
      assert.equal(inspectSourceFormatFromFd(fd, stat, extension,
        { processingMode: 'markdown-only', productChannel: 'standalone' }).verdict, 'candidate', row[3]);
    } finally { fs.closeSync(fd); }
    const bytes = fs.readFileSync(full);
    if (['.txt', '.md', '.csv', '.docx', '.xlsx', '.pptx'].includes(extension)) {
      const result = extractMarkdownBuffer(bytes, extension);
      assert.ok(result.markdown.length > 20, row[3]);
      if (extension === '.docx') {
        const person = result.markdown.match(/^\| person \| ([^|]+) \|$/imu)?.[1].trim();
        assert.ok(person, `${row[3]} must expose the converted person fixture`);
        const anonymized = anonymize(result.markdown, 'general');
        assert.ok(!anonymized.text.includes(person), `${row[3]} must redact ${person}`);
        assert.match(anonymized.text, /\[PERSON_\d+\]/u, row[3]);
        assert.deepEqual(scanResidual(anonymized.text, 'general', anonymized.dictionary, {
          strongPersonAnchor: anonymized.strongPersonAnchor
        }), [], `${row[3]} must pass the independent release gate`);
      }
    } else if (extension === '.png') {
      assert.ok(decodePng(bytes).width >= 1000, row[3]);
    } else if (extension === '.bmp') {
      assert.ok(decodeBmp(bytes).width >= 1000, row[3]);
    } else if (['.jpg', '.jpeg'].includes(extension)) {
      const image = await loadImage(bytes);
      assert.ok(image.width >= 1000, row[3]);
    } else {
      assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-', row[3]);
    }
  }
  const admitted = await enumerateSourceFolderAsync(first, {
    allowedTypes: ['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp']
  });
  assert.equal(admitted.length, 100, 'the selectable root must be one valid recursive batch');
  assert.ok(admitted.some(item => path.relative(first, item.sourcePath).split(path.sep).length === 3),
    'nested files must survive real admission');
  assert.equal(fs.readdirSync(first, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).length, 100);
  assert.ok(fs.statSync(`${first}.zip`).size < 500 * 1024 * 1024);
  process.stdout.write('Standalone 100-format corpus: valid, reproducible and below 500 MB\n');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
