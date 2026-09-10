'use strict';

const { createSuite } = require('./helpers');
const { SafeError } = require('../plugins/data-secure/server/runtime');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const {
  isWidePrivacyExtension,
  isMarkdownFirstPrivacyExtension,
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
  for (const extension of ['.docx', '.DOCX', '.xlsx', '.pdf', '.png']) {
    assert.equal(isMarkdownFirstPrivacyExtension(extension), true, extension);
  }
  for (const extension of ['.txt', '.md', '.csv', '.svg', '.exe', '', undefined]) {
    assert.equal(isMarkdownFirstPrivacyExtension(extension), false, String(extension));
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
  assert.deepEqual(Object.keys(result), ['markdown', 'warnings', 'attachments', 'unreviewedVisualCount',
    'requiresExplicitProfile', 'sourceType', 'sourceExtractionCoverage']);
  assert.deepEqual(result.sourceExtractionCoverage, { status: 'complete', reason_codes: [] });
  assert.equal(result.markdown, 'E-Mail: max@example.org');
  assert.equal(Object.hasOwn(result, 'artifact_id'), false);
  assert.equal(Object.hasOwn(result, 'processing_mode'), false);
});

testAsync('Standalone DOCX privacy alone requests header and footer omission', async () => {
  let docxOptions;
  const result = await extractWideSourceForPrivacy(Buffer.from('synthetic docx'), '.docx', {
    ErrorType: SafeError,
    async convertBuffer(_input, extension, options) {
      assert.equal(extension, '.docx');
      docxOptions = options;
      return createMarkdownExtraction({ source_type: 'docx', markdown: 'Body text', coverage: {
        status: 'incomplete', reason_codes: ['DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY']
      } });
    }
  });
  assert.strictEqual(docxOptions.omitDocxHeaderFooter, true);
  assert.deepStrictEqual(result.sourceExtractionCoverage, {
    status: 'incomplete', reason_codes: ['DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY']
  });

  let xlsxOptions;
  await extractWideSourceForPrivacy(bytes, '.xlsx', {
    ErrorType: SafeError,
    async convertBuffer(_input, _extension, options) {
      xlsxOptions = options;
      return createMarkdownExtraction({ source_type: 'xlsx', markdown: 'Body text', coverage: {
        status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED']
      } });
    }
  });
  assert.strictEqual(Object.hasOwn(xlsxOptions, 'omitDocxHeaderFooter'), false);
});

testAsync('useful incomplete Markdown continues into privacy while empty OCR stays fail closed', async () => {
  for (const reason of ['OCR_NOT_VERIFIED', 'SOURCE_COVERAGE_UNVERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED']) {
    const result = await extractWideSourceForPrivacy(bytes, '.pdf', {
      ErrorType: SafeError,
      async convertBuffer() {
        return createMarkdownExtraction({ source_type: 'pdf', markdown: 'private text',
          coverage: { status: 'incomplete', reason_codes: [reason] } });
      }
    });
    assert.equal(result.markdown, 'private text');
  }
  for (const candidate of [
    { markdown: '', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] },
    { markdown: '   ', reason_codes: ['OCR_NOT_VERIFIED'] },
    { markdown: 'unexpected text', reason_codes: ['OCR_TEXT_EMPTY', 'OCR_NOT_VERIFIED'] }
  ]) await assert.rejects(extractWideSourceForPrivacy(bytes, '.pdf', {
    ErrorType: SafeError,
    async convertBuffer() {
      return createMarkdownExtraction({ source_type: 'pdf', markdown: candidate.markdown,
        coverage: { status: 'incomplete', reason_codes: [...candidate.reason_codes].sort() } });
    }
  }), error => error instanceof SafeError && error.code === 'PARSER_COVERAGE_UNVERIFIED' &&
    !error.message.includes('unexpected text'));
});

testAsync('invalid source and malformed converter response fail closed', async () => {
  await assert.rejects(extractWideSourceForPrivacy(Buffer.from('x'), '.txt', { ErrorType: SafeError }),
    { code: 'FORMAT_COVERAGE_UNVERIFIED' });
  await assert.rejects(extractWideSourceForPrivacy(bytes, '.pdf', { ErrorType: SafeError,
    async convertBuffer() { return { markdown: 'raw' }; } }));
});

testAsync('converter source type is bound to the admitted extension', async () => {
  const expected = new Map([
    ['.docx', 'docx'], ['.xlsx', 'xlsx'], ['.pptx', 'pptx'], ['.pdf', 'pdf'], ['.png', 'png'],
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
