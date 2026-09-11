import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generate, identities, preserveTerms, reviewCandidates } from '../scripts/generate-adversarial-golden-corpus.mjs';

const require = createRequire(import.meta.url);
const { inspectSourceFormatFromFd } = require('../plugins/data-secure/server/gateway/source-format-inspector');
const { enumerateSourceFolderAsync } = require('../plugins/data-secure/server/companion/source-folder');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { anonymize, scanResidual } = require('../plugins/data-secure/server/privacy/engine');
const { createBatchPseudonymRegistry, SECRET_BYTES } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { personProseAmbiguities } = require('../plugins/data-secure/server/privacy/person-ambiguities');

const scope = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'datasecure-adversarial-golden-'));
const first = path.join(scope, 'first'), second = path.join(scope, 'second');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const directExtensions = new Set(['.txt', '.md', '.csv', '.docx', '.xlsx', '.pptx']);
const rawNeedles = identities.flatMap(identity => [identity.shortPerson, identity.company, identity.email, identity.phone,
  identity.iban.replaceAll(' ', '')]).concat(reviewCandidates);

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

  const registry = createBatchPseudonymRegistry(
    crypto.createHash('sha256').update('datasecure-adversarial-golden-corpus').digest().subarray(0, SECRET_BYTES)
  );
  let cleanReleases = 0, safeStopsOrReviews = 0;
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
    assert.ok(preserveTerms.some(term => extracted.markdown.includes(term)), `professional content missing: ${item.sourcePath}`);
    if (extension === '.docx') {
      assert.doesNotMatch(extracted.markdown, /VERTRAULICH \||Seite TEST/u, 'privacy extraction excludes headers and footers');
    }
    let released, privacyError;
    try {
      released = anonymizeMarkdown(extracted.markdown, 'personnel_profile', { registry });
    } catch (cause) {
      privacyError = cause;
    }
    if (!privacyError) {
      const leaked = rawNeedles.filter(needle => released.text.includes(needle));
      if (leaked.length) {
        const ambiguities = personProseAmbiguities(extracted.markdown, released.text);
        assert.ok(ambiguities.length > 0, `clear identifiers without local review: ${item.sourcePath}: ${leaked.join(', ')}`);
        safeStopsOrReviews++;
      } else {
        cleanReleases++;
      }
      assert.ok(preserveTerms.some(term => released.text.includes(term)), `all professional anchors lost: ${item.sourcePath}`);
    } else {
      assert.equal(privacyError?.code, 'RESIDUAL_PII', `unexpected privacy failure: ${item.sourcePath}`);
      const firstPass = anonymize(extracted.markdown, 'personnel_profile', { registry });
      const residual = scanResidual(firstPass.text, 'personnel_profile', firstPass.dictionary,
        { strongPersonAnchor: firstPass.strongPersonAnchor });
      assert.ok(residual.length > 0, `a safe stop needs an independently reproducible residual: ${item.sourcePath}`);
      safeStopsOrReviews++;
    }
  }
  assert.ok(cleanReleases >= 5, `expected representative automatic releases, got ${cleanReleases}`);
  assert.ok(safeStopsOrReviews >= 1, 'the corpus must also exercise fail-closed review paths');
  assert.equal(registry.lookup('PERSON', 'Aylin Öztürk'), registry.lookup('PERSON', 'Aylin Öztürk'),
    'the shared batch registry must be stable');
  process.stdout.write(`Adversarial golden corpus: 16 files admitted, ${cleanReleases} clean direct parser/privacy releases, ` +
    `${safeStopsOrReviews} direct safe stops/reviews; recursive intake and reproducibility verified\n`);
} finally {
  fs.rmSync(scope, { recursive: true, force: true });
}
