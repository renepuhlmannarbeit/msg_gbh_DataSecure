'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-mixed-recovery-'));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.LOCALAPPDATA = path.join(base, 'localapp');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { beginBatch, processBatchNext, resumeBatch, acknowledgeDeliveredPackage, _test } = require('../plugins/data-secure/server/gateway/batch');
const { installBatchPrivateArtifactCrypto } = require('./lib/private-artifact-test-runtime');
installBatchPrivateArtifactCrypto(_test, _test.batchRoot());
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { testAsync, done, assert } = createSuite('Mixed-format batch recovery');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function processAndAcknowledge(token, convertDocument) {
  const result = await processBatchNext(token, { convertDocument });
  if (result.ok && result.package_id) return { ...result, ...acknowledgeDeliveredPackage(token, result.package_id) };
  return result;
}

async function main() {
  await testAsync('TXT, CSV and DOCX release exactly once across an explicit interruption and resume', async () => {
    const input = fs.mkdtempSync(path.join(base, 'picker-'));
    fs.writeFileSync(path.join(input, 'one.txt'), 'Kontakt: Alice Beispiel, alice@example.test\nFachtext bleibt.', 'utf8');
    fs.writeFileSync(path.join(input, 'two.csv'), 'Wert\n"=HYPERLINK(""mailto:bob@example.test"",""Bob Beispiel"")"', 'utf8');
    fs.writeFileSync(path.join(input, 'three.docx'), zipStore([
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ['word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Zertifizierung: Scrum.org PSM I</w:t></w:r></w:p><w:p><w:r><w:t>Kontakt: Carla Beispiel</w:t></w:r></w:p><w:sectPr/></w:body></w:document>']
    ]));
    const sources = ['one.txt', 'two.csv', 'three.docx'].map((name) => path.join(input, name));
    const before = sources.map(hash);
    const convertDocument = async (source, options = {}) => parseDocumentBuffer(
      options.inputBuffer || fs.readFileSync(source),
      path.extname(options.sourceName || source).toLowerCase()
    );
    const queue = sources.map((full) => { const stat = fs.lstatSync(full); return { name: path.basename(full), full, stat, sourceBytes: stat.size }; });
    const batch = beginBatch({ expectedCount: 3, profile: 'auto', queue });
    const first = await processAndAcknowledge(batch.batch_token, convertDocument);
    assert.strictEqual(first.released, 1, JSON.stringify(first));
    const interrupted = await processBatchNext(batch.batch_token, { convertDocument: async () => {
      const error = new Error('interrupted'); error.code = 'REQUEST_CANCELLED'; throw error;
    } });
    assert.strictEqual(interrupted.retryable, 1);
    assert.strictEqual((await processAndAcknowledge(batch.batch_token, convertDocument)).released, 2);
    assert.strictEqual(resumeBatch(batch.batch_token).ok, true);
    const final = await processAndAcknowledge(batch.batch_token, convertDocument);
    assert.strictEqual(final.complete, true);
    const state = _test.readState(batch.batch_token);
    assert.strictEqual(state.items.filter((item) => item.status === 'released').length, 3);
    assert.strictEqual(new Set(state.items.map((item) => item.package_id)).size, 3);
    const markdown = state.items.map((item) => fs.readFileSync(path.join(roots().output, item.package_id, `${item.package_id}.md`), 'utf8')).join('\n');
    for (const value of ['Alice Beispiel', 'Bob Beispiel', 'Carla Beispiel', 'alice@example.test', 'bob@example.test']) assert.doesNotMatch(markdown, new RegExp(value, 'u'));
    assert.match(markdown, /Scrum\.org PSM I/u);
    assert.deepStrictEqual(sources.map(hash), before);
  });
  done();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
