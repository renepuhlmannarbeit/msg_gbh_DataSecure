'use strict';

const { createSuite } = require('./helpers');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const {
  isWidePrivacyExtension,
  extractWideSourceForPrivacy
} = require('../plugins/data-secure/server/standalone/wide-privacy-extraction');

const { testAsync, assert, done } = createSuite('Wide source privacy extraction');
const bytes = Buffer.from('%PDF-1.7 synthetic');

testAsync('wide allowlist is exact and platform-neutral', async () => {
  for (const extension of ['.xlsx', '.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.PDF']) {
    assert.equal(isWidePrivacyExtension(extension), true, extension);
  }
  for (const extension of ['.docx', '.txt', '.svg', '.exe', '', undefined]) {
    assert.equal(isWidePrivacyExtension(extension), false, String(extension));
  }
});

testAsync('complete conversion becomes neutral in-memory parser output without artifact identity', async () => {
  let calls = 0;
  const result = await extractWideSourceForPrivacy(bytes, '.pdf', {
    ErrorType: SafeError,
    async convertBuffer(input, extension, options) {
      calls++;
      assert.equal(input, bytes); assert.equal(extension, '.pdf'); assert.equal(options.signal, undefined);
      return createMarkdownExtraction({ source_type: 'pdf', markdown: 'E-Mail: max@example.org',
        coverage: { status: 'complete', reason_codes: [] } });
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(result), ['markdown', 'warnings', 'attachments', 'unreviewedVisualCount', 'requiresExplicitProfile', 'sourceType']);
  assert.equal(result.markdown, 'E-Mail: max@example.org');
  assert.equal(Object.hasOwn(result, 'artifact_id'), false);
  assert.equal(Object.hasOwn(result, 'processing_mode'), false);
});

testAsync('every incomplete coverage reason stops before the privacy publication path', async () => {
  for (const reason of ['OCR_NOT_VERIFIED', 'OCR_TEXT_EMPTY', 'SOURCE_COVERAGE_UNVERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED']) {
    await assert.rejects(extractWideSourceForPrivacy(bytes, '.pdf', {
      ErrorType: SafeError,
      async convertBuffer() {
        return createMarkdownExtraction({ source_type: 'pdf', markdown: 'private text',
          coverage: { status: 'incomplete', reason_codes: [reason] } });
      }
    }), error => error instanceof SafeError && error.code === 'PARSER_COVERAGE_UNVERIFIED' && !error.message.includes('private text'));
  }
});

testAsync('invalid source and malformed converter response fail closed', async () => {
  await assert.rejects(extractWideSourceForPrivacy(Buffer.from('x'), '.docx', { ErrorType: SafeError }),
    { code: 'FORMAT_COVERAGE_UNVERIFIED' });
  await assert.rejects(extractWideSourceForPrivacy(bytes, '.pdf', { ErrorType: SafeError,
    async convertBuffer() { return { markdown: 'raw' }; } }));
});

testAsync('converter source type is bound to the admitted extension', async () => {
  const expected = new Map([
    ['.xlsx', 'xlsx'], ['.pptx', 'pptx'], ['.pdf', 'pdf'], ['.png', 'png'],
    ['.jpg', 'jpeg'], ['.jpeg', 'jpeg'], ['.bmp', 'bmp']
  ]);
  for (const [extension, sourceType] of expected) {
    await assert.rejects(extractWideSourceForPrivacy(bytes, extension, {
      ErrorType: SafeError,
      async convertBuffer() {
        return createMarkdownExtraction({ source_type: sourceType === 'pdf' ? 'png' : 'pdf',
          markdown: 'private text', coverage: { status: 'complete', reason_codes: [] } });
      }
    }), error => error instanceof SafeError && error.code === 'FORMAT_COVERAGE_UNVERIFIED' &&
      !error.message.includes('private text'));
  }
  const jpg = await extractWideSourceForPrivacy(bytes, '.JPG', {
    ErrorType: SafeError,
    async convertBuffer(_input, extension) {
      assert.equal(extension, '.jpg');
      return createMarkdownExtraction({ source_type: 'jpeg', markdown: 'safe',
        coverage: { status: 'complete', reason_codes: [] } });
    }
  });
  assert.equal(jpg.sourceType, 'jpeg');
});

done();
