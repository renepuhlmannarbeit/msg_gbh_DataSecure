'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const {
  EXTRACTION_SCHEMA, SOURCE_TYPES, COVERAGE_REASON_CODES, MAX_MARKDOWN_CHARS,
  createMarkdownExtraction, validateMarkdownExtraction
} = require('../plugins/data-secure/server/standalone/markdown-contract');
const {
  ARTIFACT_SCHEMA, createMarkdownArtifact, validateMarkdownArtifact
} = require('../plugins/data-secure/server/standalone/markdown-artifact');

const { test, done, assert } = createSuite('Standalone Markdown artifact contract');
const artifactId = `dm_${'a'.repeat(32)}`;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const complete = () => ({ status: 'complete', reason_codes: [] });
const extraction = (markdown = '# Synthetischer Inhalt\n', sourceType = 'md', coverage = complete()) =>
  createMarkdownExtraction({ source_type: sourceType, markdown, coverage });
const errorCode = (code) => (error) => error?.code === code;

test('all declared source types share an explicit non-anonymized extraction contract', () => {
  for (const sourceType of SOURCE_TYPES) {
    const result = extraction('Text', sourceType);
    assert.strictEqual(result.schema, EXTRACTION_SCHEMA);
    assert.strictEqual(result.processing_mode, 'markdown-only');
    assert.strictEqual(result.anonymized, false);
    assert.strictEqual(result.source_type, sourceType);
    assert.strictEqual(validateMarkdownExtraction(result), result);
  }
});

test('content survives without PII replacement, normalization or compliance header', () => {
  const text = '\ufeff# Profil\r\n  Max Mustermann\tNordstern Medizin GmbH\r\n' +
    'IBAN: DE89 3704 0044 0532 0130 00\r\n' +
    '| | Name | Name |\r\n| --- | --- | --- |\r\n| | 00123 | =1+1 |\r\n' +
    'e\u0301 Ä 🚀\u00a0\u202fEnde  \r\n';
  const artifact = createMarkdownArtifact(extraction(text), artifactId);
  assert.ok(artifact.markdown === text, 'Source-derived Markdown must remain unchanged.');
  assert.strictEqual(artifact.manifest.document_bytes, Buffer.byteLength(text, 'utf8'));
  assert.strictEqual(artifact.manifest.document_sha256, hash(Buffer.from(text, 'utf8')));
  assert.strictEqual(validateMarkdownArtifact(artifact.manifest, artifact.markdown), artifact.manifest);
});

test('the fixed identity and manifest have no privacy or read-capability properties', () => {
  const { manifest } = createMarkdownArtifact(extraction(), artifactId);
  assert.strictEqual(manifest.schema, ARTIFACT_SCHEMA);
  assert.strictEqual(manifest.artifact_id, artifactId);
  assert.strictEqual(manifest.document, `${artifactId}.md`);
  assert.strictEqual(manifest.anonymized, false);
  assert.strictEqual(manifest.processing_mode, 'markdown-only');
  assert.strictEqual(manifest.extraction_grade, 'complete');
  for (const field of ['package_id', 'read_capability', 'verification', 'pseudonym_seed',
    'pseudonym_registry_state', 'content_is_verified_anonymized_markdown', 'assets', 'profile']) {
    assert.ok(!Object.hasOwn(manifest, field), 'Unexpected privacy property.');
  }
});

test('constructors detach and freeze validated metadata', () => {
  const coverage = complete();
  const result = extraction('Text', 'txt', coverage);
  coverage.reason_codes.push('SOURCE_COVERAGE_UNVERIFIED');
  coverage.status = 'incomplete';
  assert.strictEqual(result.coverage.status, 'complete');
  assert.strictEqual(result.coverage.reason_codes.length, 0);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.coverage) && Object.isFrozen(result.coverage.reason_codes));
  const artifact = createMarkdownArtifact(result, artifactId);
  assert.ok(Object.isFrozen(artifact) && Object.isFrozen(artifact.manifest) && Object.isFrozen(artifact.manifest.reason_codes));
});

test('empty text has an honest zero-byte digest rather than an invented placeholder', () => {
  const artifact = createMarkdownArtifact(extraction(''), artifactId);
  assert.strictEqual(artifact.manifest.document_bytes, 0);
  assert.strictEqual(artifact.manifest.document_sha256, hash(Buffer.alloc(0)));
  assert.strictEqual(artifact.markdown.length, 0);
  validateMarkdownArtifact(artifact.manifest, '');
});

test('incomplete conversion is retained with its explicit non-anonymized grade and reasons', () => {
  for (const code of COVERAGE_REASON_CODES) {
    const result = extraction('Text', 'docx', { status: 'incomplete', reason_codes: [code] });
    assert.strictEqual(validateMarkdownExtraction(result), result);
    const artifact = createMarkdownArtifact(result, artifactId);
    assert.strictEqual(artifact.manifest.extraction_grade, 'incomplete');
    assert.deepStrictEqual(artifact.manifest.reason_codes, [code]);
    assert.strictEqual(artifact.manifest.anonymized, false);
    assert.strictEqual(validateMarkdownArtifact(artifact.manifest, artifact.markdown), artifact.manifest);
  }
  const result = extraction('Text', 'pdf', { status: 'incomplete', reason_codes: [...COVERAGE_REASON_CODES] });
  assert.strictEqual(result.coverage.reason_codes.length, COVERAGE_REASON_CODES.length);
});

test('coverage rejects missing, unknown, duplicate, unsorted and contradictory reasons', () => {
  const bad = [
    { status: 'incomplete', reason_codes: [] },
    { status: 'complete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] },
    { status: 'incomplete', reason_codes: ['UNKNOWN'] },
    { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', 'OCR_NOT_VERIFIED'] },
    { status: 'incomplete', reason_codes: ['VISUAL_CONTENT_NOT_EXTRACTED', 'OCR_NOT_VERIFIED'] },
    { status: 'complete', reason_codes: [], source_path: 'sensitive' },
    { status: 'complete' }, null
  ];
  for (const coverage of bad) assert.throws(() => extraction('Text', 'txt', coverage), errorCode('MARKDOWN_EXTRACTION_INVALID'));
});

test('extraction rejects mode, schema, source-type and privacy-marker confusion', () => {
  const base = extraction();
  for (const update of [
    { schema: 'eu-privacy-package/3' }, { processing_mode: 'local_only' },
    { processing_mode: 'markdown-and-anonymize' }, { anonymized: true },
    { source_type: '.txt' }, { source_type: 'jpg' }, { source_type: 'unknown' },
    { read_capability: 'opaque' }, { original_name: 'sensitive' }, { coverage: undefined }
  ]) assert.throws(() => validateMarkdownExtraction({ ...base, ...update }), errorCode('MARKDOWN_EXTRACTION_INVALID'));
  assert.throws(() => createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete(), extra: true }),
    errorCode('MARKDOWN_EXTRACTION_INVALID'));
});

test('objects with executable accessors or hidden properties are not wire data', () => {
  const accessor = { ...extraction() };
  Object.defineProperty(accessor, 'markdown', { enumerable: true, get() { throw new Error('Getter must not run.'); } });
  assert.throws(() => validateMarkdownExtraction(accessor), errorCode('MARKDOWN_EXTRACTION_INVALID'));
  const hidden = { ...extraction() };
  Object.defineProperty(hidden, 'secret', { value: 'sensitive', enumerable: false });
  assert.throws(() => validateMarkdownExtraction(hidden), errorCode('MARKDOWN_EXTRACTION_INVALID'));
});

test('unpaired Unicode surrogates cannot be silently replaced by UTF-8 encoding', () => {
  for (const text of ['\ud800', '\udc00', 'a\ud800b', '\ud800\ud800', '\udc00\ud800']) {
    assert.throws(() => extraction(text), errorCode('MARKDOWN_EXTRACTION_INVALID'));
  }
  const text = '\ud83d\ude80\ud83d\ude00';
  assert.ok(createMarkdownArtifact(extraction(text), artifactId).markdown === text, 'Valid surrogate pairs must survive.');
});

test('the existing text resource bound is enforced without truncation', () => {
  const boundary = 'a'.repeat(MAX_MARKDOWN_CHARS);
  const result = extraction(boundary, 'txt');
  const artifact = createMarkdownArtifact(result, artifactId);
  assert.strictEqual(artifact.manifest.document_bytes, MAX_MARKDOWN_CHARS);
  assert.throws(() => extraction(`${boundary}a`, 'txt'), errorCode('TEXT_TOO_LARGE'));
});

test('artifact ids cannot masquerade as privacy packages or escape the fixed document path', () => {
  for (const id of [`ds_${'a'.repeat(32)}`, `md_${'a'.repeat(32)}`, `dm_${'A'.repeat(32)}`,
    `dm_${'a'.repeat(31)}`, `../${artifactId}`, `${artifactId}/x`, '', null, {}]) {
    assert.throws(() => createMarkdownArtifact(extraction(), id), errorCode('MARKDOWN_ARTIFACT_INVALID'));
  }
});

test('manifest validation rejects extra privacy claims, traversal and changed metadata', () => {
  const { manifest, markdown } = createMarkdownArtifact(extraction(), artifactId);
  for (const update of [
    { schema: 'eu-privacy-package/3' }, { anonymized: true }, { processing_mode: 'local_only' },
    { document: '../original.md' }, { document: `${artifactId}.txt` }, { source_type: 'unknown' },
    { document_bytes: -1 }, { document_bytes: 1.5 }, { document_bytes: Number.MAX_SAFE_INTEGER },
    { document_sha256: 'A'.repeat(64) }, { document_sha256: 'a'.repeat(63) },
    { extraction_grade: 'incomplete' }, { reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] },
    { read_capability: 'opaque' }, { verification: 'passed' }, { package_id: artifactId }
  ]) assert.throws(() => validateMarkdownArtifact({ ...manifest, ...update }, markdown), errorCode('MARKDOWN_ARTIFACT_INVALID'));
});

test('digest and UTF-8 byte count are independently checked, including equal-length tampering', () => {
  const { manifest, markdown } = createMarkdownArtifact(extraction('ÄBC🚀'), artifactId);
  assert.notStrictEqual(markdown.length, manifest.document_bytes);
  assert.throws(() => validateMarkdownArtifact({ ...manifest, document_bytes: markdown.length }, markdown),
    errorCode('MARKDOWN_ARTIFACT_INVALID'));
  assert.throws(() => validateMarkdownArtifact(manifest, 'ÄBD🚀'), errorCode('MARKDOWN_ARTIFACT_INVALID'));
  assert.throws(() => validateMarkdownArtifact(manifest, `${markdown}\n`), errorCode('MARKDOWN_ARTIFACT_INVALID'));
  const roundTrip = JSON.parse(JSON.stringify(manifest));
  assert.strictEqual(validateMarkdownArtifact(roundTrip, markdown), roundTrip);
});

// Real filesystem and real package read gates. There is deliberately no mocked
// capability issuer or resolver in this cross-product boundary test.
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-markdown-artifact-'));
process.env.EU_PRIVACY_ROOT = path.join(temporaryRoot, 'privacy');
process.env.EU_PRIVACY_DATA_ROOT = path.join(temporaryRoot, 'state', 'data');
process.env.LOCALAPPDATA = path.join(temporaryRoot, 'localapp');
const packageStore = require('../plugins/data-secure/server/gateway/package-store');
const { roots } = require('../plugins/data-secure/server/gateway/common');

function writeArtifactFixture(directoryId, manifest, markdown) {
  const directory = path.join(roots().output, directoryId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `${directoryId}.md`), markdown, 'utf8');
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  return directory;
}

test('real privacy gates reject conversions even when placed inside the privacy Output tree', () => {
  const artifact = createMarkdownArtifact(extraction('Synthetische unveränderte Eingabe'), artifactId);
  for (const directoryId of [artifactId, `ds_${'b'.repeat(32)}`, 'legacy-conversion']) {
    writeArtifactFixture(directoryId, artifact.manifest, artifact.markdown);
    assert.throws(() => packageStore.safeResolvePackage(directoryId), /Paketmanifest/u);
    assert.throws(() => packageStore.issueReadCapability(directoryId), /Paketmanifest/u);
    assert.throws(() => packageStore.readOutput(directoryId), /Leseberechtigung/u);
    assert.throws(() => packageStore.openVerifiedMarkdownSnapshot(directoryId), /Leseberechtigung/u);
    assert.ok(!packageStore.listOutputs().packages.some((entry) => entry.package_id === directoryId));
  }
});

test('a genuine prior privacy capability cannot read a replacement conversion manifest', () => {
  const id = `ds_${'c'.repeat(32)}`;
  const markdown = '# Freigegebene Testinformation';
  const directory = writeArtifactFixture(id, {
    schema: 'eu-privacy-package/2', package_id: id, profile: 'general',
    created_at: '2026-09-06T00:00:00.000Z', document: `${id}.md`,
    document_sha256: hash(Buffer.from(markdown, 'utf8')), assets: []
  }, markdown);
  const grant = packageStore.issueReadCapability(id);
  assert.ok(packageStore.readOutput(id, grant.read_capability).text === markdown,
    'Positive control must read the genuine privacy package.');
  const conversion = createMarkdownArtifact(extraction('Unveränderte Testeingabe'), artifactId);
  fs.writeFileSync(path.join(directory, `${id}.md`), conversion.markdown, 'utf8');
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(conversion.manifest), 'utf8');
  assert.throws(() => packageStore.issueReadCapability(id), /Paketmanifest/u);
  assert.throws(() => packageStore.readOutput(id, grant.read_capability), /Paketmanifest/u);
  assert.throws(() => packageStore.openVerifiedMarkdownSnapshot(id, grant.read_capability), /Paketmanifest/u);
});

function cleanupFixture() {
  // Inspect every exact target first. Never recursively delete or traverse a
  // symlink/reparse point; only the tree this test just created is removable.
  const resolvedRoot = fs.realpathSync(temporaryRoot);
  if (path.dirname(resolvedRoot) !== fs.realpathSync(os.tmpdir()) ||
      !path.basename(resolvedRoot).startsWith('data-secure-markdown-artifact-')) {
    throw new Error('Fixture cleanup root is invalid.');
  }
  const targets = [];
  function inspect(target) {
    const stat = fs.lstatSync(target);
    const relative = path.relative(resolvedRoot, target);
    if (stat.isSymbolicLink() || relative.startsWith('..') || path.isAbsolute(relative) ||
        fs.realpathSync(target) !== target) throw new Error('Fixture cleanup target is invalid.');
    if (!stat.isDirectory() && !stat.isFile()) throw new Error('Fixture type is invalid.');
    if (stat.isDirectory()) for (const name of fs.readdirSync(target)) inspect(path.join(target, name));
    targets.push({ target, directory: stat.isDirectory() });
  }
  inspect(resolvedRoot);
  for (const { target, directory } of targets) {
    if (directory) fs.rmdirSync(target); else fs.unlinkSync(target);
  }
}

cleanupFixture();
done();
