import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generate, preserveTerms } from '../scripts/generate-adversarial-golden-corpus.mjs';
import { forbiddenAnchors, assertNoIdentityLeak, assertCrossDocumentPseudonyms, assertTechnicalAnchors } from './lib/adversarial-golden-oracle.mjs';

const require = createRequire(import.meta.url);
const { inspectSourceFormatFromFd } = require('../plugins/data-secure/server/gateway/source-format-inspector');
const { enumerateSourceFolderAsync } = require('../plugins/data-secure/server/companion/source-folder');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');

const scope = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-adversarial-golden-'));
const first = path.join(scope, 'first'), second = path.join(scope, 'second');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const directExtensions = new Set(['.txt', '.md', '.csv', '.docx', '.xlsx', '.pptx']);

try {
  const one = generate(first), two = generate(second);
  assert.equal(one.files, 16); assert.equal(two.files, 16);
  assert.equal(digest(one.archive), digest(two.archive), 'the complete downloadable kit must be byte reproducible');

  const input = path.join(first, 'EINGABEN');
  // Reproduce the real UAT condition: opening the Word fixture while selecting
  // its parent tree creates an Office owner file with a supported extension.
  fs.writeFileSync(path.join(input, '02-word', '~$-langer-bericht-mit-kopf-fuss-kommentar.docx'),
    'owner');
  const ignoredArtifacts = [];
  const files = await enumerateSourceFolderAsync(input, {
    allowedTypes: ['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp'],
    onIgnoredArtifact: (reason) => ignoredArtifacts.push(reason)
  });
  assert.equal(files.length, 16, 'recursive intake must admit every difficult source');
  assert.deepEqual(ignoredArtifacts, ['office_owner_file'], 'Office owner metadata must not become a seventeenth document');
  assert.ok(files.every(item => path.relative(input, item.sourcePath).split(path.sep).length >= 2));
  const expected = JSON.parse(fs.readFileSync(path.join(first, 'ERWARTUNGEN.json'), 'utf8'));
  assert.equal(expected.schema, 'datasecure-adversarial-corpus/1');
  assert.equal(expected.files.length, 16);

  let directExtractions = 0;
  for (const item of files) {
    const extension = path.extname(item.sourcePath).toLowerCase();
    const stat = fs.statSync(item.sourcePath), fd = fs.openSync(item.sourcePath, fs.constants.O_RDONLY);
    try {
      assert.equal(inspectSourceFormatFromFd(fd, stat, extension,
        { processingMode: 'markdown-only', productChannel: 'standalone' }).verdict, 'candidate', item.sourcePath);
    } finally { fs.closeSync(fd); }
    if (!directExtensions.has(extension)) continue;
    const options = extension === '.docx' ? { omitDocxHeaderFooter: true } : {};
    const extracted = extractMarkdownBuffer(fs.readFileSync(item.sourcePath), extension, options);
    assert.ok(extracted.markdown.length > 100, item.sourcePath);
    assertTechnicalAnchors(extracted.markdown, Number(path.basename(item.sourcePath).slice(0, 2)), 'direct extraction');
    if (extension === '.docx') {
      assert.doesNotMatch(extracted.markdown, /VERTRAULICH \||Seite TEST/u, 'privacy extraction excludes headers and footers');
    }
    directExtractions++;
  }
  assert.equal(directExtractions, 10);
  // Mutations validate the independent publication oracle, including escaped
  // contacts, spaced IBANs and addresses. No detector output defines success.
  for (const anchor of forbiddenAnchors) {
    assert.throws(() => assertNoIdentityLeak(`technical text ${anchor}`, 'mutation'), /published original identity anchor/u);
    assert.throws(() => assertNoIdentityLeak(anchor.replaceAll(' ', '&#32;'), 'escaped mutation'), /published original identity anchor/u);
  }
  const primary = [1, 2, 3, 1, 3, 2, 1, 3, 2, 3, 2, 2, 2, 1, 2, 3];
  const bodies = new Map(primary.map((identity, index) => [index + 1,
    index < 3 ? `${[1, 2, 3].map(id => `[PERSON_00${id}] arbeitet bei [UNTERNEHMEN_00${id}]`).join('\n')} ${preserveTerms.join(' ')}`
      : index < 10 ? `[PERSON_00${identity}] arbeitet bei [UNTERNEHMEN_00${identity}] ${preserveTerms.join(' ')}`
        : `Name: [PERSON_00${identity}]\nUnternehmen: [UNTERNEHMEN_00${identity}] ${preserveTerms.join(' ')}`]));
  assertCrossDocumentPseudonyms(bodies);
  const changed = new Map(bodies); changed.set(7, changed.get(7).replace('[PERSON_001]', '[PERSON_009]'));
  assert.throws(() => assertCrossDocumentPseudonyms(changed), /person identity changed/u);
  const collapsed = new Map([...bodies].map(([number, body]) => [number, body.replace(/PERSON_00[23]/gu, 'PERSON_001')]));
  assert.throws(() => assertCrossDocumentPseudonyms(collapsed), /distinct people/u);
  assert.throws(() => assertTechnicalAnchors(preserveTerms.filter(term => term !== 'FHIR').join(' '), 1, 'mutation'), /missing technical anchor FHIR/u);
  assert.throws(() => assertTechnicalAnchors(`[PERSON_099] ${preserveTerms.join(' ')}`, 1, 'title mutation'),
    /technical document title must survive/u);
  // Real OCR, review, publication and output-derived identity consistency for
  // all sixteen files live in test-adversarial-golden-batch.mjs. Admission or a
  // low-level ambiguity signal is deliberately not called a privacy release.
  process.stdout.write(`Adversarial corpus: 16 admitted, ${directExtractions} direct extractions, reproducible kit and negative publication-oracle checks verified\n`);
} finally {
  fs.rmSync(scope, { recursive: true, force: true });
}
