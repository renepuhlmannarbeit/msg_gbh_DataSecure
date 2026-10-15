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

done();
