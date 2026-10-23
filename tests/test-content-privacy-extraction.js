'use strict';

const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('Bound content privacy extraction');
const { extractSourceForPrivacy, validatePrivacyExtractionForOptions,
  isMarkdownFirstPrivacyExtension } = require('../plugins/data-secure/server/core/markdown-first-privacy');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const options = (change = {}) => ({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: false, ...change });
const source = (type, markdown, contract = options(), more = {}) => createMarkdownExtraction({ source_type: type, markdown,
  coverage: { status: 'complete', reason_codes: [] }, ...(contract ? { content_options: contract } : {}), ...more });

testAsync('full contracts add text formats without widening legacy or Cowork', async () => {
  for (const extension of ['.txt', '.md', '.markdown', '.csv']) {
    assert.equal(isMarkdownFirstPrivacyExtension(extension, 'standalone', options()), true);
    assert.equal(isMarkdownFirstPrivacyExtension(extension, 'standalone'), false);
    assert.throws(() => isMarkdownFirstPrivacyExtension(extension, 'plugin', options()), { code: 'CONTENT_OPTIONS_FORBIDDEN' });
  }
  for (const extension of ['.exe', '.svg', '']) assert.equal(isMarkdownFirstPrivacyExtension(extension, 'standalone', options()), false);
});

testAsync('converter echo and neutral proof bind all formats before use; new DOCX retains visible stories', async () => {
  for (const [extension, type] of [['.txt', 'txt'], ['.md', 'md'], ['.docx', 'docx'], ['.xlsx', 'xlsx'],
    ['.pptx', 'pptx'], ['.pdf', 'pdf'], ['.png', 'png'], ['.jpg', 'jpeg'], ['.bmp', 'bmp']]) {
    let forwarded;
    const result = await extractSourceForPrivacy(Buffer.from('synthetic'), extension, { contentOptions: options(), productChannel: 'standalone',
      convertBuffer: async (_bytes, _extension, passed) => { forwarded = passed; return source(type, 'Anna Beispiel Ä €'); } });
    assert.deepEqual(forwarded.contentOptions, options());
    assert.notEqual(forwarded.omitDocxHeaderFooter, true, 'the new shared content input must not silently omit visible DOCX stories');
    assert.equal(result.sourceExtraction.schema, 'datasecure-source-extraction/2');
    assert.equal(validatePrivacyExtractionForOptions(result, options(), type).markdown, result.markdown);
    assert.throws(() => validatePrivacyExtractionForOptions(result, options({ scanOcr: false }), type));
    assert.throws(() => validatePrivacyExtractionForOptions(result, options(), type === 'pdf' ? 'txt' : 'pdf'));
  }
});

testAsync('new CSV uses real unchanged headers and records, not raw generic column labels', async () => {
  const csv = 'Name,Name,,Kommentar\r\n"Anna Beispiel","Berta Muster",,"  Ä é | \\ ~ ![Text](bild.png) "\r\n\r\n"Carla Demo","Dora Test",,"erste\r\nzweite"\r\n';
  const result = await extractSourceForPrivacy(Buffer.from(csv), '.csv', { contentOptions: options(),
    convertBuffer: async () => source('csv', '| Zeile | Spalte 1 | Spalte 2 |\n| --- | --- | --- |\n| 1 | Name | Name |') });
  const MarkdownIt = require('markdown-it'), { decodeHTML } = require('entities');
  const html = new MarkdownIt({ html: true }).render(result.markdown);
  assert.equal((html.match(/<th>Name<\/th>/gu) || []).length, 2);
  assert.ok(html.includes('<th></th>'));
  assert.equal((html.match(/<tr>/gu) || []).length, 4, 'header, two data records and empty record remain');
  const visible = decodeHTML(html.replace(/<[^>]*>/gu, ''));
  for (const text of ['Anna Beispiel', 'Berta Muster', 'Carla Demo', 'Dora Test', 'Ä é | \\ ~ ![Text](bild.png)', 'erste', 'zweite']) assert.ok(visible.includes(text), text);
  assert.ok(!html.includes('Spalte ') && !html.includes('<img') && !html.includes('<del'));
});

testAsync('legacy/mismatched extraction and forged private carrier cannot confirm a new request', async () => {
  for (const wrong of [source('pdf', 'unchanged', null), source('pdf', 'unchanged', options({ imageOcr: true })), source('txt', 'unchanged')]) {
    await assert.rejects(extractSourceForPrivacy(Buffer.from('synthetic'), '.pdf', { contentOptions: options(), convertBuffer: async () => wrong }));
  }
  const valid = await extractSourceForPrivacy(Buffer.from('synthetic'), '.pdf', { contentOptions: options(), convertBuffer: async () => source('pdf', 'unchanged') });
  for (const change of [{ markdown: 'different' }, { attachments: [{}] }, { warnings: ['source-bearing'] }, { unreviewedVisualCount: 1 },
    { extra: true }, { sourceExtractionCoverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] } }])
    assert.throws(() => validatePrivacyExtractionForOptions({ ...valid, ...change }, options(), 'pdf'));
});

testAsync('option/result accessors and proxies stop without executing source-bearing caller code', async () => {
  let reads = 0, calls = 0;
  const getter = () => { reads++; throw new Error('PRIVATE_SENTINEL'); };
  for (const field of ['contentOptions', 'productChannel', 'ErrorType']) {
    const request = { contentOptions: options(), convertBuffer: async () => { calls++; return source('pdf', 'Text'); } };
    Object.defineProperty(request, field, { enumerable: true, get: getter });
    await assert.rejects(extractSourceForPrivacy(Buffer.from('synthetic'), '.pdf', request));
  }
  const response = { ...source('pdf', 'Text') }; Object.defineProperty(response, 'markdown', { enumerable: true, get: getter });
  await assert.rejects(extractSourceForPrivacy(Buffer.from('synthetic'), '.pdf', { contentOptions: options(), convertBuffer: async () => response }));
  // Promise assimilation may inspect `then` before any consumer runs. The
  // decoder must execute no other trap; direct validation below needs none.
  const proxy = new Proxy(source('pdf', 'Text'), { get: (_target, key) => key === 'then' ? undefined : getter(),
    ownKeys: getter, getPrototypeOf: getter, getOwnPropertyDescriptor: getter });
  assert.throws(() => validatePrivacyExtractionForOptions(proxy, options(), 'pdf'));
  await assert.rejects(extractSourceForPrivacy(Buffer.from('synthetic'), '.pdf', { contentOptions: options(), convertBuffer: async () => proxy }));
  assert.equal(reads, 0); assert.equal(calls, 0);
});

testAsync('new consumer envelope rejects conflicting switches and unclosed fields before converter effects', async () => {
  let calls = 0;
  for (const extra of [{ scanOcr: false }, { imageOcr: true }, { markdownOutput: 'notes-v1' }, { content_options: options() },
    { sourcePath: 'PRIVATE_SENTINEL' }, { productChannel: null }]) {
    await assert.rejects(extractSourceForPrivacy(Buffer.from('synthetic'), '.pdf', { contentOptions: options(),
      convertBuffer: async () => { calls++; return source('pdf', 'Text'); }, ...extra }));
  }
  assert.equal(calls, 0);
});

testAsync('exact contact provenance and private metadata survive only in the private typed carrier', async () => {
  const text = 'E-Mail: qa@example.invalid', contract = options({ imageOcr: true });
  const result = await extractSourceForPrivacy(Buffer.from('synthetic'), '.pdf', { contentOptions: contract,
    convertBuffer: async () => source('pdf', text, contract, { coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
      ocr_contacts: [{ start: 8, end: text.length, page: 1, line: 1, kind: 'email' }],
      private_document_metadata: { schema: 'datasecure-private-document-metadata/1', source_type: 'pdf', entries: [{ key: 'Author', value: 'PRIVATE_SENTINEL' }] } }) });
  assert.equal(result.markdown.slice(result.ocrContacts[0].start, result.ocrContacts[0].end), 'qa@example.invalid');
  assert.equal(result.privateDocumentMetadata.entries[0].value, 'PRIVATE_SENTINEL');
  assert.ok(!JSON.stringify(result.sourceExtraction).includes('PRIVATE_SENTINEL'));
  assert.equal(Object.isFrozen(result.privateDocumentMetadata.entries[0]), true);
  for (const change of [{ ocrContacts: [] }, { ocrContacts: [{ ...result.ocrContacts[0], end: text.length + 1 }] },
    { privateDocumentMetadata: { ...result.privateDocumentMetadata, source_type: 'docx' } }])
    assert.throws(() => validatePrivacyExtractionForOptions({ ...result, ...change }, contract, 'pdf'));
});

testAsync('Office table edits preserve exact repeated OCR corridors across formats, profiles and line endings', async () => {
  const { appendOfficeOcr } = require('../plugins/data-secure/server/standalone/office-image-ocr');
  const { buildContactDraft, applyContactAnswer } = require('../plugins/data-secure/server/core/ocr-contact-review');
  const { automaticallyRedactOcrContacts } = require('../plugins/data-secure/server/gateway/bound-content-input');
  const email = 'same@example.invalid', phone = '+49 30 5551002';
  for (const type of ['docx', 'xlsx', 'pptx']) for (const profile of ['content-v1', 'notes-v1'])
    for (const newline of ['\n', '\r\n']) for (const tail of ['', ' Fachtext 42: keine Freigabe. '.repeat(12)]) {
      const contract = options({ markdownOutput: profile, imageOcr: true });
      const native = ['# Δ 😀 e\u0301', '', '| Spalte 1 | Spalte 2 |', '', '| --- | --- |', '',
        '| Name | Kennzahl |', '', '| Qvx | 42 |', '', `Native Quelle: ${email}`].join(newline);
      const imageText = `Bild 😀 e\u0301${newline}E-Mail: ${email}${newline}Telefon: ${phone}${tail}`;
      const emailStart = imageText.indexOf(email), phoneStart = imageText.indexOf(phone);
      const image = createMarkdownExtraction({ source_type: 'png', markdown: imageText, content_options: contract,
        coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'OCR_NOT_VERIFIED'] },
        ocr_contacts: [{ start: emailStart, end: emailStart + email.length, page: 1, line: 2, kind: 'email' },
          { start: phoneStart, end: phoneStart + phone.length, page: 1, line: 3, kind: 'phone' }] });
      const converted = appendOfficeOcr(source(type, native, contract), [image, image], contract);
      const originalContacts = JSON.stringify(converted.ocr_contacts);
      const result = await extractSourceForPrivacy(Buffer.from('synthetic'), '.' + type,
        { contentOptions: contract, convertBuffer: async () => converted });
      // Independent text oracle: explicitly state retained rows and separators;
      // never derive the expected output with the function under test.
      const expectedNative = ['# Δ 😀 e\u0301', '', '| Name | Kennzahl |', '| --- | --- |',
        '| Qvx | 42 |', '', `Native Quelle: ${email}`].join(newline);
      const expected = expectedNative + '\n\n' + imageText + '\n\n' + imageText;
      assert.equal(result.markdown, expected, `${type}/${profile}/${JSON.stringify(newline)}`);
      const firstImageStart = expectedNative.length + 2, secondImageStart = firstImageStart + imageText.length + 2;
      assert.deepEqual(result.ocrContacts.map(item => [item.start, item.end, item.page, item.line, item.kind]),
        [firstImageStart, secondImageStart].flatMap((offset, index) => [
          [offset + emailStart, offset + emailStart + email.length, index + 1, 2, 'email'],
          [offset + phoneStart, offset + phoneStart + phone.length, index + 1, 3, 'phone']
        ]));
      assert.deepEqual(result.ocrContacts.map(item => result.markdown.slice(item.start, item.end)), [email, phone, email, phone]);
      assert.equal(JSON.stringify(converted.ocr_contacts), originalContacts, 'converter provenance is never mutated');
      assert.ok(result.sourceExtractionCoverage.reason_codes.includes('OCR_CONTACT_VALUES_UNVERIFIED'));
      const input = { original_text: result.markdown, source_type: type, contacts: result.ocrContacts };
      const draft = buildContactDraft(input);
      assert.deepEqual(draft.ambiguities.map(item => result.markdown.slice(item.original_start, item.original_end)), [email, phone, email, phone]);
      const corrected = applyContactAnswer(input, { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map((item, index) =>
        index === 0 ? { ambiguity_id: item.ambiguity_id, decision: 'correct_contact', replacement: 'corrected@example.invalid' }
          : { ambiguity_id: item.ambiguity_id, decision: 'confirm_contact' }) });
      assert.equal(corrected, expectedNative + '\n\n' + imageText.replace(email, 'corrected@example.invalid') + '\n\n' + imageText,
        'guided correction changes the first OCR occurrence, never an identical native or second-image occurrence');
      const automatic = automaticallyRedactOcrContacts(input);
      assert.equal((automatic.text.match(/\[EMAIL_REDACTED\]/gu) || []).length, 2);
      assert.equal((automatic.text.match(/\[PHONE_REDACTED\]/gu) || []).length, 2);
      assert.ok(automatic.text.includes(`Native Quelle: ${email}`), 'exact OCR masking must not widen to a same-valued native occurrence');
      assert.ok(automatic.text.includes('Qvx') && automatic.text.includes('42'), 'OCR operation preserves unrelated table facts');
      assert.ok(!automatic.text.includes(phone));
    }
});

testAsync('moved real table header preserves contact identity and private image evidence without value lookup', async () => {
  const { encodePng } = require('../plugins/data-secure/server/images/png');
  const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) });
  const image = { schema: 'datasecure-ocr-contact-image/1', source_width: 1, source_height: 1,
    x: 0, y: 0, width: 1, height: 1, png_base64: png.toString('base64') };
  const email = 'same@example.invalid', contract = options({ imageOcr: true });
  const raw = `| Spalte 1 | Spalte 2 |\n| --- | --- |\n| Name | ${email} |\n| Qvx | ${email} |`;
  const first = raw.indexOf(email), second = raw.indexOf(email, first + email.length);
  const converted = source('docx', raw, contract, { coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
    ocr_contacts: [first, second].map((start, index) => ({ start, end: start + email.length, page: index + 1,
      line: index + 3, kind: 'email', image })) });
  const result = await extractSourceForPrivacy(Buffer.from('synthetic'), '.docx', { contentOptions: contract, convertBuffer: async () => converted });
  assert.equal(result.markdown, `| Name | ${email} |\n| --- | --- |\n| Qvx | ${email} |`);
  assert.deepEqual(result.ocrContacts.map(item => result.markdown.slice(item.start, item.end)), [email, email]);
  assert.deepEqual(result.ocrContacts.map(item => [item.page, item.line, item.image]), [[1, 3, image], [2, 4, image]]);
  assert.ok(Object.isFrozen(result.ocrContacts) && Object.isFrozen(result.ocrContacts[0].image));
});

testAsync('deleted table structure and malformed contact maps fail closed instead of silently losing or relocating contacts', async () => {
  const contract = options({ imageOcr: true });
  const raw = '| Spalte 1 |\n   \n| --- |\n| Name |\n| Qvx |\n\nE-Mail: same@example.invalid';
  for (const type of ['docx', 'xlsx', 'pptx']) {
    for (const [start, end] of [[2, 10], [raw.indexOf('   '), raw.indexOf('   ') + 3]]) {
      const converted = source(type, raw, contract, { coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
        ocr_contacts: [{ start, end, page: 1, line: 1, kind: 'contact' }] });
      await assert.rejects(extractSourceForPrivacy(Buffer.from('synthetic'), '.' + type,
        { contentOptions: contract, convertBuffer: async () => converted }), { code: 'OCR_CONTACT_REVIEW_INVALID' });
    }
    const valid = source(type, raw, contract, { coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
      ocr_contacts: [{ start: raw.indexOf('same@'), end: raw.length, page: 1, line: 7, kind: 'email' }] });
    for (const badContacts of [
      [{ ...valid.ocr_contacts[0], end: raw.length + 1 }],
      [{ ...valid.ocr_contacts[0], start: raw.indexOf('Qvx') }],
      [valid.ocr_contacts[0], valid.ocr_contacts[0]]
    ]) await assert.rejects(extractSourceForPrivacy(Buffer.from('synthetic'), '.' + type,
      { contentOptions: contract, convertBuffer: async () => ({ ...valid, ocr_contacts: badContacts }) }), { code: 'OCR_CONTACT_REVIEW_INVALID' });
  }
});

testAsync('legacy Office extraction remaps contact offsets without changing its coverage or source contract', async () => {
  for (const type of ['docx', 'xlsx', 'pptx']) {
    const email = 'qa@example.invalid';
    const raw = `| Spalte 1 |\n\n| --- |\n\n| Name |\n\n| Qvx |\n\nE-Mail: ${email}`;
    const converted = source(type, raw, null, { coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
      ocr_contacts: [{ start: raw.indexOf(email), end: raw.length, page: 1, line: 1, kind: 'email' }] });
    const result = await extractSourceForPrivacy(Buffer.from('synthetic'), '.' + type, { convertBuffer: async () => converted });
    assert.equal(result.markdown, `| Name |\n| --- |\n| Qvx |\n\nE-Mail: ${email}`);
    assert.equal(result.markdown.slice(result.ocrContacts[0].start, result.ocrContacts[0].end), email);
    assert.equal(Object.hasOwn(result, 'sourceExtraction'), false);
    assert.deepEqual(result.sourceExtractionCoverage, converted.coverage);
  }
});

testAsync('multiple Office tables accumulate exact shifts while no-op and consecutive blank lines retain their source bytes', async () => {
  const contract = options({ imageOcr: true }), email = 'qa@example.invalid';
  for (const [raw, expected] of [
    [`😀 Native Quelle\n\nE-Mail: ${email}`, `😀 Native Quelle\n\nE-Mail: ${email}`],
    [`| Spalte 1 |\n\n| --- |\n\n| Kennzahl |\n\n| 42 |\n\nE-Mail: ${email}`,
      `| Spalte 1 |\n| --- |\n| Kennzahl |\n| 42 |\n\nE-Mail: ${email}`],
    [`| Spalte 1 |\n\n\n| --- |\n\n\n| Name |\n\nE-Mail: ${email}`,
      `| Spalte 1 |\n\n\n| --- |\n\n\n| Name |\n\nE-Mail: ${email}`],
    [`| Spalte 1 |\n| --- |\n| Name |\n| Qvx |\n\nZwischenstand 😀\n\n| Spalte 1 |\n\n| --- |\n\n| Firma |\n\n| Qzx |\n\nE-Mail: ${email}`,
      `| Name |\n| --- |\n| Qvx |\n\nZwischenstand 😀\n\n| Firma |\n| --- |\n| Qzx |\n\nE-Mail: ${email}`]
  ]) {
    const converted = source('docx', raw, contract, { coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
      ocr_contacts: [{ start: raw.indexOf(email), end: raw.length, page: 2, line: 1, kind: 'email' }] });
    const result = await extractSourceForPrivacy(Buffer.from('synthetic'), '.docx', { contentOptions: contract, convertBuffer: async () => converted });
    assert.equal(result.markdown, expected);
    assert.equal(result.ocrContacts[0].start, expected.indexOf(email));
    assert.equal(result.ocrContacts[0].end, expected.length);
  }
});

testAsync('literal padded, tabbed and duplicate Office headers retain sensitive field semantics', async () => {
  const { zipStore } = require('./lib/zip'), { opcControlEntries } = require('./lib/opc');
  const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
  const row = cells => '<w:tr>' + cells.map(value => '<w:tc><w:p><w:r><w:t xml:space="preserve">' + value + '</w:t></w:r></w:p></w:tc>').join('') + '</w:tr>';
  const bytes = zipStore([...opcControlEntries('docx'), ['word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>' +
    row([' Name ', '\tName\t', ' Name ']) + row(['Qvx', 'Pzx', 'Rjx']) + '</w:tbl></w:body></w:document>']]);
  const result = await extractSourceForPrivacy(bytes, '.docx', { contentOptions: options(), convertBuffer: async input => {
    const parsed = extractMarkdownBuffer(input, '.docx', { markdownOutput: 'content-v1' });
    return createMarkdownExtraction({ source_type: 'docx', markdown: parsed.markdown, coverage: parsed.coverage, content_options: options() });
  } });
  assert.ok(!result.markdown.includes('Spalte 1'));
  assert.ok(result.markdown.includes('&#32;Name&#32;') && result.markdown.includes('&#9;Name&#9;'), 'preserve the literal source header, not the detection view');
  const anonymized = require('../plugins/data-secure/server/gateway/compliance').anonymizeMarkdown(result.markdown, 'general', { productChannel: 'standalone' });
  for (const value of ['Qvx', 'Pzx', 'Rjx']) assert.ok(!anonymized.text.includes(value), value);
});

testAsync('actual DOCX, CSV and MD person fields share bound semantics without changing their labels', async () => {
  const { zipStore } = require('./lib/zip'), { opcControlEntries } = require('./lib/opc');
  const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  const { fromMarkdown } = await import('../native/markdown/pilot/node_modules/mdast-util-from-markdown/index.js');
  const { parseFragment } = await import('../native/markdown/pilot/node_modules/parse5/dist/index.js');
  const labels = ['Name', 'First Name', 'Full Name', 'Vollständiger Name', 'Kontaktperson', 'Vollsta\u0308ndiger Name', 'Fir\u200bst Name'];
  for (const profile of ['content-v1', 'notes-v1']) for (const label of labels) for (const extension of ['.docx', '.csv', '.md']) {
    const contract = options({ markdownOutput: profile });
    const table = '| ' + label + ' |\n| --- |\n| Qvx |';
    const row = value => '<w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">' + value + '</w:t></w:r></w:p></w:tc></w:tr>';
    const bytes = extension === '.docx' ? zipStore([...opcControlEntries('docx'), ['word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>' +
      row(' ' + label + ' ') + row('Qvx') + '</w:tbl></w:body></w:document>']]) : Buffer.from(extension === '.csv' ? label + '\r\nQvx\r\n' : table);
    const extracted = await extractSourceForPrivacy(bytes, extension, { contentOptions: contract, convertBuffer: async input => {
      const parsed = extractMarkdownBuffer(input, extension, extension === '.md' ? {} : { markdownOutput: profile });
      const markdown = extension === '.md' && profile === 'content-v1'
        ? require('../plugins/data-secure/server/standalone/markdown-image-content').markdownImageContent(parsed.markdown, { fromMarkdown, parseFragment }).markdown : parsed.markdown;
      return createMarkdownExtraction({ source_type: extension.slice(1), markdown, coverage: parsed.coverage, content_options: contract });
    } });
    const visible = require('entities').decodeHTML(require('markdown-it')({ html: true }).render(extracted.markdown).replace(/<[^>]*>/gu, ''));
    assert.ok(visible.includes(label), `${extension}/${profile}: retain label ${label}`);
    assert.ok(!extracted.markdown.includes('Spalte 1'), `${extension}/${profile}: promote ${label}`);
    const result = anonymizeMarkdown(extracted.markdown, 'general', { productChannel: 'standalone', contentOptions: contract });
    assert.ok(!result.text.includes('Qvx'), `${extension}/${profile}: mask ${label}`);
  }
});

testAsync('both redaction and residual checks bind person semantics, including legacy-new-legacy cache alternation', async () => {
  const pii = require('../plugins/data-secure/server/pii-engine');
  const { bindStandaloneDocumentKeeps } = require('../plugins/data-secure/server/privacy/residual-person-review');
  const bound = { productChannel: 'standalone', contentOptions: options() };
  for (const label of ['First Name', 'Vollständiger Name']) {
    const text = '| ' + label + ' |\n| --- |\n| Qvx |';
    const start = text.indexOf('Qvx'), end = start + 3;
    const keep = bindStandaloneDocumentKeeps(text, [{ start, end }], []);
    for (const consumer of [{}, bound, {}, bound]) {
      const newer = Boolean(consumer.contentOptions);
      assert.equal(pii.anonymize(text, 'general', consumer).text.includes('Qvx'), !newer);
      assert.equal(pii.scanResidual(text, 'general', [], { ...consumer, reviewedPersonCandidates: keep }).length > 0, newer,
        'weak Keep cannot waive a strongly labelled person in the bound policy');
      assert.equal(pii.sensitiveSpans(text, 'general', consumer).some(row => row.type === 'PERSON' && row.text === 'Qvx'), newer);
    }
    const malformed = '| ' + label + ' | Other |\n| --- | --- |\n| Qvx |';
    assert.ok(pii.scanResidual(malformed, 'general', [], bound).some(row => row.type === 'TABLE_STRUCTURE_AMBIGUOUS'));
  }
  for (const label of ['Product Name', 'Projektname', 'Dateiname', 'Zertifikat']) {
    const text = '| ' + label + ' |\n| --- |\n| Qvx |';
    assert.equal(pii.anonymize(text, 'general', bound).text, text, label);
    assert.deepEqual(pii.scanResidual(text, 'general', [], bound), [], label);
  }
  for (const text of ['| First&#32;Name |\n| --- |\n| Qvx |', 'Vollsta\u0308ndiger Name: Qvx'])
    assert.throws(() => pii.sensitiveSpans(text, 'general', bound), { code: 'SOURCE_EXTRACTION_INVALID' },
      'a new locator never invents coordinates after canonicalization');
});

testAsync('bound field contracts reject malformed and foreign policies before registry effects', async () => {
  const pii = require('../plugins/data-secure/server/pii-engine');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  let reads = 0;
  for (const more of [{ contentOptions: null }, { contentOptions: undefined }, { contentOptions: { ...options(), extra: true } },
    { contentOptions: options(), productChannel: 'plugin' }, { content_options: options() },
    { contentOptions: options(), productChannel: undefined }]) {
    const consumer = { ...more };
    Object.defineProperty(consumer, 'registry', { enumerable: true, get: () => { reads++; return {}; } });
    assert.throws(() => pii.anonymize('First Name: Qvx', 'general', consumer));
    assert.throws(() => pii.scanResidual('First Name: Qvx', 'general', [], consumer));
    assert.throws(() => anonymizeMarkdown('First Name: Qvx', 'general', consumer));
  }
  assert.equal(reads, 0);
});

testAsync('closed person-field vocabulary preserves all established roles and rejects technical name columns', async () => {
  const { isPersonFieldLabel, personFieldPattern, LEGACY_PERSON_FIELD_POLICY, CONTENT_PERSON_FIELD_POLICY } = require('../plugins/data-secure/server/core/person-field-policy');
  const labels = ['Name', 'Person', 'Full Name', 'Employee Name', 'Candidate Name', 'Contact Name', 'Mitarbeitername',
    'Vorname', 'Nachname', 'Kunde', 'Kundin', 'Mitarbeiterin', 'Bewerber', 'Ansprechpartnerin', 'Vertreter', 'Kontaktperson',
    'Interner Kontakt', 'Technischer Kontakt', 'Fachlicher Kontakt', 'Sachbearbeiterin', 'Zuständige', 'Verantwortliche',
    'Empfängerin', 'Absender', 'Unterzeichnerin', 'Gesprächspartner', 'Betreuer', 'Beraterin', 'Teilnehmer', 'Autorin',
    'Verfasser', 'Manager', 'Eigentümer', 'Bearbeiter', 'geändert von', 'Zuletzt erstellt von', 'Author', 'Creator', 'Owner',
    'Approver', 'Representative', 'Contact person', 'Last modified by', 'Modified by', 'Nom', 'Nombre', 'Naam', 'Имя', 'ФИО', 'Όνομα', '姓名', '氏名', '이름'];
  const { promoteExplicitSensitiveTableHeaders } = require('../plugins/data-secure/server/core/markdown-first-privacy');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const label of labels) {
    assert.equal(isPersonFieldLabel(label, LEGACY_PERSON_FIELD_POLICY), true, label);
    assert.equal(isPersonFieldLabel(label, CONTENT_PERSON_FIELD_POLICY), true, label);
    const literal = require('../plugins/data-secure/server/core/markdown-literal-content').literalTableCell(' ' + label + ' ', true);
    const converted = '| Spalte 1 |\n| --- |\n| ' + literal + ' |\n| Qvx |';
    const promoted = promoteExplicitSensitiveTableHeaders(converted, true);
    assert.ok(!promoted.includes('Spalte 1'), label);
    assert.ok(promoted.includes(literal), 'header output unchanged: ' + label);
    assert.ok(!anonymizeMarkdown(promoted, 'general', { productChannel: 'standalone', contentOptions: options() }).text.includes('Qvx'), label);
  }
  for (const label of ['First Name', 'Vollständiger Name']) {
    assert.equal(isPersonFieldLabel(label, LEGACY_PERSON_FIELD_POLICY), false);
    assert.equal(isPersonFieldLabel(label, CONTENT_PERSON_FIELD_POLICY), true);
  }
  for (const label of ['Product Name', 'Projektname', 'Dateiname', 'Service Level', 'Fail Closed', 'Personality', 'Name suffix', 'Authoring Tool']) {
    assert.equal(isPersonFieldLabel(label, CONTENT_PERSON_FIELD_POLICY), false, label);
  }
  for (const unknown of [null, true, 'content-person-fields/2', 'legacy']) assert.throws(() => personFieldPattern(unknown));
});

testAsync('inconsistent person headers stop before alias discovery instead of guessing a column', async () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance'), pii = require('../plugins/data-secure/server/pii-engine');
  const bound = { productChannel: 'standalone', contentOptions: options() };
  for (const label of ['Name', 'First Name', 'Full Name', 'Vollständiger Name', 'Kontaktperson']) for (const text of [
    '| ' + label + ' | Other |\n| --- |\n| Qvx |',
    '| ' + label + ' | Other |\n| Unknown |\n| --- |\n| Qvx |',
    '| ' + label + ' | Other |\n| Unknown | Other |\n| --- | --- |\n| Qvx |']) {
    assert.ok(pii.scanResidual(text, 'general', [], bound).some(row => row.type === 'TABLE_STRUCTURE_AMBIGUOUS'), label);
    let registryReads = 0;
    const consumer = { ...bound }; Object.defineProperty(consumer, 'registry', { enumerable: true, get: () => { registryReads++; throw new Error('no aliases before structure'); } });
    assert.throws(() => pii.anonymize(text, 'general', consumer), { code: 'RESIDUAL_PII' });
    assert.equal(registryReads, 0, label);
    assert.throws(() => anonymizeMarkdown(text, 'general', bound), { code: 'RESIDUAL_PII' });
  }
});

testAsync('actual compact XLSX coordinates cannot hide a sensitive source header before residual privacy',async()=>{
  const {zipStore}=require('./lib/zip'),{opcControlEntries}=require('./lib/opc');
  const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
  const {anonymizeMarkdown}=require('../plugins/data-secure/server/gateway/compliance');
  const s='http://schemas.openxmlformats.org/spreadsheetml/2006/main',r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const bytes=zipStore([...opcControlEntries('xlsx'),
    ['xl/workbook.xml',`<workbook xmlns="${s}" xmlns:r="${r}"><sheets><sheet name="Quelle" sheetId="1" r:id="s"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="s" Type="${r}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml',`<worksheet xmlns="${s}"><sheetData><row r="5"><c r="C5" t="inlineStr"><is><t>Name</t></is></c></row><row r="9"><c r="C9" t="inlineStr"><is><t>Qvx</t></is></c></row></sheetData></worksheet>`]]);
  const converted=extractMarkdownBuffer(bytes,'.xlsx',{markdownOutput:'content-v1',partialExtraction:true});
  assert.match(converted.markdown,/Quellzeile/u);assert.match(converted.markdown,/C/u);
  const result=await extractSourceForPrivacy(bytes,'.xlsx',{contentOptions:options(),convertBuffer:async()=>source('xlsx',converted.markdown)});
  assert.doesNotMatch(result.markdown,/Spalte 3/u);assert.match(result.markdown,/Name/u);
  assert.ok(!anonymizeMarkdown(result.markdown,'general',{productChannel:'standalone',contentOptions:options()}).text.includes('Qvx'));
});

testAsync('nonuniform and vertical Word coordinate grids cannot authorize privacy without a complete field-owner model',async()=>{
  const {zipStore}=require('./lib/zip'),{opcControlEntries}=require('./lib/opc');
  const {extractMarkdownBuffer}=require('../plugins/data-secure/server/standalone/markdown-extractor');
  const w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const para=value=>`<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
  const cell=(value,props)=>`<w:tc><w:tcPr>${props}</w:tcPr>${para(value)}</w:tc>`;
  for(const body of [
    `<w:tr>${cell('Name','<w:gridSpan w:val="2"/>')}</w:tr><w:tr>${cell('Qvx','')}${cell('FHIR','')}</w:tr>`,
    `<w:tr>${cell('Name','<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>')}</w:tr><w:tr>${cell('Qvx','<w:gridSpan w:val="2"/><w:vMerge/>')}</w:tr>`]){
    const bytes=zipStore([...opcControlEntries('docx'),['word/document.xml',`<w:document xmlns:w="${w}"><w:body><w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>${body}</w:tbl></w:body></w:document>`]]);
    const converted=extractMarkdownBuffer(bytes,'.docx',{markdownOutput:'content-v1',partialExtraction:true});
    assert.match(converted.markdown,/Qvx/u,'plain conversion retains original context');
    assert.match(converted.markdown,/Tabelle mit verbundenen oder versetzten Zellen/u);
    assert.ok(converted.coverage.reason_codes.includes('OFFICE_TABLE_CONTEXT_UNVERIFIED'));
    await assert.rejects(extractSourceForPrivacy(bytes,'.docx',{contentOptions:options(),convertBuffer:async()=>source('docx',converted.markdown,options(),{coverage:converted.coverage})}),{code:'PARSER_COVERAGE_UNVERIFIED'});
  }
});

done();
