import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { taggedPdfTextLayout, nativeTextSeparator, nativeColumnOrder } = require('../plugins/data-secure/server/standalone/pdf-text-layout');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfRoot = path.join(root, 'native/pdfjs/pilot/node_modules/pdfjs-dist');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
assert.equal(JSON.parse(fs.readFileSync(path.join(pdfRoot, 'package.json'))).version, '6.2.108');
assert.equal(sha(fs.readFileSync(path.join(pdfRoot, 'legacy/build/pdf.mjs'))), '842284e0d1d439e60701e3355c2128cd3016ebebf14220e27f512467682aad66');
const canvas = require('../native/ocr/pilot/node_modules/@napi-rs/canvas');
for (const key of ['DOMMatrix', 'Path2D', 'ImageData']) globalThis[key] = canvas[key];
const pdfjs = await import(pathToFileURL(path.join(pdfRoot, 'legacy/build/pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(pdfRoot, 'legacy/build/pdf.worker.mjs')).href;
let passed = 0;
async function test(name, body) { await body(); passed++; console.log('PASS ' + name); }
const mc = index => ({ type: 'content', id: `p3R_mc${index}` });
const paragraph = (...indices) => ({ role: 'P', children: indices.map(mc) });
const tree = (...blocks) => ({ role: 'Root', children: [{ role: 'Document', children: blocks }] });
function run(str, x, y, extra = {}) { return { str, dir: 'ltr', transform: [12, 0, 0, 12, x, y], width: Math.max(1, str.length * 5), height: 12, fontName: 'F1', hasEOL: true, ...extra }; }
function marked(index, ...text) { return [{ type: 'beginMarkedContentProps', id: `p3R_mc${index}`, tag: 'P' }, ...text, { type: 'endMarkedContent' }]; }
const options = (items, structureTree, extra = {}) => ({ items, structureTree, pageNumber: 1, pageRef: { num: 3, gen: 0 }, ...extra });
const text = items => items.filter(item => Object.hasOwn(item, 'str')).map(item => item.str);
function unchangedFallback(items, structureTree, extra) { const actual = taggedPdfTextLayout(options(items, structureTree, extra)); assert.equal(actual.applied, false); assert.strictEqual(actual.items, items); assert.deepEqual(actual.blocks, []); assert.ok(actual.reason_codes.length); return actual; }
function plain(items) { let out = '', previous; for (const item of items) { if (!Object.hasOwn(item, 'str')) continue; if (item.str.trim() && !out.endsWith('\n')) out += nativeTextSeparator(previous, item); out += item.str + (item.hasEOL ? '\n' : ''); if (item.hasEOL) previous = undefined; else if (item.str.trim()) previous = item; } return out; }
function modelMarkdown(layout) {
  // Fixed integration oracle: actual TH authority only, otherwise positional
  // cells. Main's Worker integration is deliberately outside this test file.
  const escape = value => value.replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/\r\n|\r|\n/gu, '<br>');
  return layout.blocks.map(block => {
    if (block.kind !== 'table') return plain(block.items).trim();
    if (!block.headerRow) return block.rows.flatMap(row => row.cells.map(cell => `Zeile ${cell.row}, Spalte ${cell.column}\n\n${plain(cell.items).trim()}`)).join('\n\n');
    const rows = block.rows.map(row => '| ' + row.cells.map(cell => escape(plain(cell.items).trim())).join(' | ') + ' |');
    rows.splice(1, 0, '| ' + block.rows[0].cells.map(() => '---').join(' | ') + ' |'); return rows.join('\n');
  }).join('\n\n');
}

await test('complete marked groups reorder whole paragraphs, preserving all object instances and whitespace/EOL', () => {
  const items = [...marked(1, run('Right', 230, 220), run(' ', 255, 220, { width: 0 })), ...marked(0, run('Left', 30, 220)), ...marked(2, run('', 30, 170, { width: 0 }), run('Tail\r\nÄÖÜß 😀', 30, 160))];
  const before = JSON.stringify(items), result = taggedPdfTextLayout(options(items, tree(paragraph(0), paragraph(1), paragraph(2))));
  assert.equal(result.applied, true); assert.deepEqual(text(result.items), ['Left', 'Right', ' ', '', 'Tail\r\nÄÖÜß 😀']);
  assert.equal(result.items.length, items.length); assert.deepEqual(new Set(result.items), new Set(items)); assert.equal(JSON.stringify(items), before);
  assert.deepEqual(result.items.filter(i => Object.hasOwn(i, 'str')).map(i => i.hasEOL), [true, true, true, true, true]); assert.equal(result.pageObjectId, 'p3R');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.items) && Object.isFrozen(result.blocks));
  assert.strictEqual(nativeColumnOrder(items), items, 'old unproven-geometry API remains unchanged');
});
await test('nonnested MCIDs can contain plain marked formatting wrappers without losing markers', () => {
  const items = marked(0, run('A', 20, 220)); items.splice(1, 0, { type: 'beginMarkedContent', tag: 'Span' }); items.splice(-1, 0, { type: 'endMarkedContent' });
  const result = taggedPdfTextLayout(options(items, tree(paragraph(0)))); assert.equal(result.applied, true); assert.deepEqual(result.items, items);
});
await test('identical text at distinct native positions stays distinct, and Alt/ActualText supplies no replacement', () => {
  const items = [...marked(0, run('Same', 20, 220)), ...marked(1, run('Same', 230, 220))], model = tree(paragraph(1), paragraph(0));
  model.children[0].children[0].alt = 'Name: Invented'; model.children[0].children[0].actualText = 'Other';
  const result = taggedPdfTextLayout(options(items, model)); assert.equal(result.applied, true); assert.deepEqual(text(result.items), ['Same', 'Same']);
  assert.strictEqual(result.blocks[0].textItems[0], items[4]); assert.strictEqual(result.blocks[1].textItems[0], items[1]);
  assert.doesNotMatch(plain(result.items), /Invented|Other/u);
});
await test('tagless pages retain exact original array and do not infer columns', () => {
  const items = [run('Name', 20, 200), run('Account', 200, 200), run('Anna', 20, 180), run('111', 200, 180)];
  const result = unchangedFallback(items, null); assert.deepEqual(result.reason_codes, ['PDF_TAGGED_ORDER_UNAVAILABLE']);
});
await test('cross-page, noncanonical and wrong generation identifiers are never repaired', () => {
  const items = marked(0, run('A', 20, 220));
  for (const id of ['p4R_mc0', 'p3R1_mc0', 'p3R_mc00', 'p3R_mc-1', 'p3R_mc2147483648']) unchangedFallback(items, tree({ role: 'P', children: [{ type: 'content', id }] }));
  unchangedFallback(items, tree(paragraph(0)), { pageRef: { num: 3, gen: 1 } });
});
await test('all native text and every subtree must be mapped exactly once', () => {
  const items = [...marked(0, run('A', 20, 220)), ...marked(1, run('B', 20, 180))];
  for (const model of [tree(paragraph(0)), tree(paragraph(0), paragraph(0)), tree(paragraph(0), paragraph(1), paragraph(2)), tree(paragraph(0), { role: 'P', children: [] }), tree(paragraph(0), { role: 'Figure', alt: 'Invented name', children: [mc(1)] }), tree(paragraph(0), { role: 'P', children: [{ type: 'object', id: '1R' }] })]) unchangedFallback(items, model);
  unchangedFallback([...items, run('unmarked', 30, 140)], tree(paragraph(0), paragraph(1)));
  unchangedFallback([...items, ...marked(0, run('same id', 30, 100))], tree(paragraph(0), paragraph(1)));
});
await test('empty, nested, broken, unmatched and unknown marked streams refuse reordering', () => {
  const a = marked(0, run('A', 20, 200));
  for (const items of [[a[0], a.at(-1)], a.slice(1), a.slice(0, -1), [...a, { type: 'endMarkedContent' }], [a[0], ...marked(1, run('B', 50, 220)), a[1], a[2]], [{ type: 'beginMarkedContentProps', id: null }, ...a, { type: 'endMarkedContent' }], [...a, { type: 'unexpected' }]]) unchangedFallback(items, tree(paragraph(0)));
});
await test('tree/item accessors, prototypes, sparse arrays and cycles have no new authority', () => {
  let reads = 0; const items = marked(0, run('A', 20, 200)); const getter = { role: 'P' }; Object.defineProperty(getter, 'children', { enumerable: true, get() { reads++; return [mc(0)]; } });
  unchangedFallback(items, tree(getter)); assert.equal(reads, 0);
  const cycle = { role: 'Div', children: [] }; cycle.children.push(cycle); unchangedFallback(items, tree(cycle));
  const child = paragraph(0); unchangedFallback(items, tree({ role: 'Div', children: [child, child] }));
  const inherited = Object.create({ role: 'P' }); inherited.children = [mc(0)]; unchangedFallback(items, tree(inherited));
  const sparse = [...items]; delete sparse[1]; unchangedFallback(sparse, tree(paragraph(0)));
  const altered = [...items]; altered[1] = { ...items[1] }; Object.defineProperty(altered[1], 'str', { enumerable: true, get() { reads++; return 'A'; } }); unchangedFallback(altered, tree(paragraph(0))); assert.equal(reads, 0);
});
await test('rotated/RTL/nonfinite/overlapping source positions cannot become inferred owners', () => {
  for (const extra of [{ dir: 'rtl' }, { transform: [0, 12, -12, 0, 20, 200] }, { transform: [12, 0, 0, 12, NaN, 200] }, { width: 0 }]) unchangedFallback(marked(0, run('A', 20, 200, extra)), tree(paragraph(0)));
  unchangedFallback([...marked(0, run('A', 20, 200)), ...marked(1, run('B', 21, 200))], tree(paragraph(1), paragraph(0)));
});
await test('native run order inside a paragraph cannot be changed by conflicting leaf order', () => {
  unchangedFallback([...marked(0, run('Name:', 20, 220)), ...marked(1, run('Qvx', 20, 180))], tree(paragraph(1, 0)));
});
await test('colon/equal and closed label values remain coupled across paragraph/MCID boundaries', () => {
  for (const label of ['Name:', 'Full Name (1) (2):', 'Company:', 'PIN:', 'Name', 'Personalnummer', 'BIC', 'Telefon', 'Geburtsdatum']) {
    const items = [...marked(0, run(label, 20, 220)), ...marked(1, run('Qvx', 20, 190)), ...marked(2, run('FHIR REST 123', 230, 190))];
    unchangedFallback(items, tree(paragraph(0), paragraph(2), paragraph(1)));
    // Adjacency alone does not authorize a newly generated P boundary inside
    // the native label/value corridor. A shared actual paragraph can retain it.
    unchangedFallback(items, tree(paragraph(2), paragraph(0), paragraph(1)));
    const safe = taggedPdfTextLayout(options(items, tree(paragraph(2), paragraph(0, 1)))); assert.equal(safe.applied, true, label);
  }
});
await test('split native inline field labels and values cannot be separated even by neutral tags', () => {
  const items = [...marked(0, run('Name:', 20, 220, { hasEOL: false })), ...marked(1, run('Qvx', 52, 220)), ...marked(2, run('FHIR', 230, 180))];
  unchangedFallback(items, tree(paragraph(0), paragraph(2), paragraph(1)));
});
await test('complete rectangle supports source TH/TD owner records without manufacturing headers', () => {
  const items = [...marked(2, run('Qvx / Qvy', 20, 200)), ...marked(0, run('Name', 20, 230)), ...marked(3, run('FHIR REST 123', 200, 200)), ...marked(1, run('Fachtext', 200, 230))];
  const cell = (role, id) => ({ role, children: [paragraph(id)] });
  const table = { role: 'Table', children: [{ role: 'THead', children: [{ role: 'TR', children: [cell('TH', 0), cell('TH', 1)] }] }, { role: 'TBody', children: [{ role: 'TR', children: [cell('TD', 2), cell('TD', 3)] }] }] };
  const result = taggedPdfTextLayout(options(items, tree(table))); assert.equal(result.applied, true); assert.equal(result.blocks[0].headerRow, 1);
  assert.deepEqual(result.blocks[0].rows.map(r => r.cells.map(c => [c.role, c.row, c.column])), [[['TH', 1, 1], ['TH', 1, 2]], [['TD', 2, 1], ['TD', 2, 2]]]);
  assert.equal(modelMarkdown(result), '| Name | Fachtext |\n| --- | --- |\n| Qvx / Qvy | FHIR REST 123 |');
  const noHeader = structuredClone(table); for (const c of noHeader.children[0].children[0].children) c.role = 'TD';
  noHeader.children[0].role = 'TBody';
  const neutral = taggedPdfTextLayout(options(items, tree(noHeader))); assert.equal(neutral.applied, true); assert.equal(neutral.blocks[0].headerRow, null); assert.doesNotMatch(modelMarkdown(neutral), /Geschützter Tabellenwert/u);
});
await test('bare initial TH row cannot invent column authority, and explicit source fields cannot cross generated cells', () => {
  const cell = (role, id) => ({ role, children: [paragraph(id)] });
  const table = { role: 'Table', children: [{ role: 'TR', children: [cell('TH', 0), cell('TH', 1)] }, { role: 'TR', children: [cell('TD', 2), cell('TD', 3)] }] };
  const items = [...marked(0, run('Name', 20, 230)), ...marked(1, run('Qvx', 200, 230)), ...marked(2, run('Other', 20, 200)), ...marked(3, run('FHIR', 200, 200))];
  const result = taggedPdfTextLayout(options(items, tree(table))); assert.equal(result.applied, true); assert.equal(result.blocks[0].headerRow, null);
  const explicit = structuredClone(items); explicit.find(i => i.str === 'Name').str = 'Name:'; explicit.find(i => i.str === 'Name:').hasEOL = false;
  unchangedFallback(explicit, tree(table));
});
await test('row spans, inconsistent counts, mixed/late headers and crossed geometric columns keep old path', () => {
  const cell = (role, id) => ({ role, children: [paragraph(id)] });
  const base = { role: 'Table', children: [{ role: 'TR', children: [cell('TH', 0), cell('TH', 1)] }, { role: 'TR', children: [cell('TD', 2), cell('TD', 3)] }] };
  const items = [...marked(0, run('Name', 20, 230)), ...marked(1, run('Fachtext', 200, 230)), ...marked(2, run('Qvx', 20, 200)), ...marked(3, run('FHIR', 200, 200))];
  for (const alter of [t => t.children[1].children.pop(), t => t.children[1].children[0].role = 'TH', t => t.children[0].children[0].role = 'TD', t => t.children.reverse()]) { const t = structuredClone(base); alter(t); unchangedFallback(items, tree(t)); }
  const shifted = structuredClone(items); shifted.find(i => i.str === 'Qvx').transform[4] = 205; unchangedFallback(shifted, tree(base));
});
await test('all optional model budgets fall back without changing source array or raising existing budgets', () => {
  const items = marked(0, run('A', 20, 220)); let deep = paragraph(0); for (let i = 0; i < 66; i++) deep = { role: 'Div', children: [deep] }; unchangedFallback(items, tree(deep));
  unchangedFallback(new Array(100001).fill(items[1]), tree(paragraph(0)));
  unchangedFallback(marked(0, run('A'.repeat(8 * 1024 * 1024 + 1), 20, 220, { width: 1 })), tree(paragraph(0)));
  unchangedFallback(marked(0, run('A' + '\n'.repeat(100001), 20, 220, { width: 1 })), tree(paragraph(0)));
});

function syntheticPdf(groups, structure, { pageGeneration = 0, unmarked = '' } = {}) {
  const pageRef = `3 ${pageGeneration} R`, objects = ['<< /Type /Catalog /Pages 2 0 R /MarkInfo << /Marked true >> /StructTreeRoot 6 0 R >>', '<< /Type /Pages /Kids [' + pageRef + '] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 400] /StructParents 0 /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '', '', ''];
  const parentTree = [];
  function addNode(model, parent) {
    const number = objects.push(''); const kids = [];
    for (const child of model.children) {
      if (Number.isInteger(child)) { kids.push(String(child)); parentTree[child] = `${number} 0 R`; }
      else kids.push(addNode(child, number) + ' 0 R');
    }
    objects[number - 1] = `<< /Type /StructElem /S /${model.role} /P ${parent} 0 R /Pg ${pageRef} /K [${kids.join(' ')}] >>`; return number;
  }
  const children = structure.map(model => addNode(model, 6));
  objects[5] = `<< /Type /StructTreeRoot /K [${children.map(n => n + ' 0 R').join(' ')}] /ParentTree 7 0 R /ParentTreeNextKey 1 >>`;
  objects[6] = `<< /Nums [0 [${Array.from({ length: parentTree.length }, (_, i) => parentTree[i] || 'null').join(' ')}]] >>`;
  const escape = value => value.replace(/[\\()]/gu, '\\$&');
  const stream = groups.map(g => `/P << /MCID ${g.id} >> BDC\nBT /F1 12 Tf 1 0 0 1 ${g.x} ${g.y} Tm (${escape(g.text)}) Tj ET\nEMC`).join('\n') + unmarked;
  objects[4] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  let output = '%PDF-1.7\n'; const offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output += `${i + 1} ${i === 2 ? pageGeneration : 0} obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset, i) => `${String(offset).padStart(10, '0')} ${String(i === 2 ? pageGeneration : 0).padStart(5, '0')} n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
async function actualPdf(bytes, body) {
  const before = Buffer.from(bytes), task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, enableXfa: false, stopAtErrors: true,
    disableAutoFetch: true, disableStream: true, disableRange: true, useWorkerFetch: false, useSystemFonts: false, verbosity: 0,
    standardFontDataUrl: path.join(pdfRoot, 'standard_fonts').replaceAll('\\', '/') + '/' });
  try { const document = await task.promise, page = await document.getPage(1); const content = await page.getTextContent({ disableNormalization: true, includeMarkedContent: true }), structureTree = await page.getStructTree();
    const result = taggedPdfTextLayout({ items: content.items, structureTree, pageNumber: page.pageNumber, pageRef: page.ref });
    await body({ bytes, page, content, structureTree, result }); assert.deepEqual(bytes, before);
  } finally { await task.destroy(); }
}
const P = (...ids) => ({ role: 'P', children: ids });
const doc = (...children) => [{ role: 'Document', children }];
const groups = [{ id: 1, text: 'Right', x: 260, y: 300 }, { id: 0, text: 'Left', x: 20, y: 300 }, { id: 2, text: 'Footer', x: 20, y: 180 }];
await test('actual pinned PDF.js page.ref, marked IDs and structure reorder bind original PDF bytes', async () => {
  await actualPdf(syntheticPdf(groups, doc(P(0), P(1), P(2))), ({ content, structureTree, result, page }) => {
    assert.deepEqual(page.ref, { num: 3, gen: 0 }); assert.equal(result.applied, true); assert.equal(structureTree.role, 'Root');
    assert.deepEqual(text(content.items).filter(Boolean), ['Right', 'Left', 'Footer']); assert.deepEqual(text(result.items).filter(Boolean), ['Left', 'Right', 'Footer']);
    assert.deepEqual(new Set(result.items), new Set(content.items)); assert.equal(result.items.length, content.items.length);
  });
});
await test('actual nonzero page reference generation is not guessed from pageNumber', async () => {
  await actualPdf(syntheticPdf(groups, doc(P(0), P(1), P(2)), { pageGeneration: 2 }), ({ content, result, page }) => {
    assert.deepEqual(page.ref, { num: 3, gen: 2 }); assert.equal(result.applied, true); assert.equal(result.pageObjectId, 'p3R2'); assert.ok(content.items.some(i => i.id === 'p3R2_mc0'));
  });
});
await test('actual unknown subtree and unmarked native search text preserve every original item', async () => {
  await actualPdf(syntheticPdf(groups, doc(P(0), { role: 'Figure', children: [1] }, P(2))), ({ content, result }) => { assert.equal(result.applied, false); assert.strictEqual(result.items, content.items); });
  await actualPdf(syntheticPdf(groups, doc(P(0), P(1), P(2)), { unmarked: '\nBT /F1 12 Tf 20 100 Td (Retained search text) Tj ET' }), ({ content, result }) => { assert.equal(result.applied, false); assert.strictEqual(result.items, content.items); assert.ok(text(result.items).includes('Retained search text')); });
});
const tableGroups = [{ id: 3, text: 'FHIR REST 123', x: 220, y: 250 }, { id: 2, text: 'Qvx / Qvy', x: 20, y: 250 }, { id: 1, text: 'Fachtext', x: 220, y: 300 }, { id: 0, text: 'Name', x: 20, y: 300 }];
const tableModel = doc({ role: 'Table', children: [{ role: 'THead', children: [{ role: 'TR', children: [{ role: 'TH', children: [P(0)] }, { role: 'TH', children: [P(1)] }] }] }, { role: 'TBody', children: [{ role: 'TR', children: [{ role: 'TD', children: [P(2)] }, { role: 'TD', children: [P(3)] }] }] }] });
await test('actual PDF.js TH/TD/MCID and nonoverlap geometry produce truthful field-bearing table model', async () => {
  await actualPdf(syntheticPdf(tableGroups, tableModel), ({ result }) => { assert.equal(result.applied, true); assert.equal(modelMarkdown(result), '| Name | Fachtext |\n| --- | --- |\n| Qvx / Qvy | FHIR REST 123 |'); });
});
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } = require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { replayTransformTrace } = require('../plugins/data-secure/server/privacy/transform-plan');
const { verifyAnonymizedPublication } = require('../plugins/data-secure/server/standalone/anonymized-artifact');
for (const markdownOutput of ['content-v1', 'notes-v1']) for (const profile of ['general', 'personnel_profile']) await test(`actual PDF model -> source contract -> prepare/finalize/trace/residual/Keep ${markdownOutput}/${profile}`, async () => {
  await actualPdf(syntheticPdf(tableGroups, tableModel), async ({ bytes, result }) => {
    assert.equal(result.applied, true); const markdown = modelMarkdown(result);
    const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput, scanOcr: false, imageOcr: false };
    const consumerOptions = { productChannel: 'standalone', contentOptions };
    const { extractSourceForPrivacy } = require('../plugins/data-secure/server/core/markdown-first-privacy');
    const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
    const extracted = await extractSourceForPrivacy(bytes, '.pdf', { contentOptions, convertBuffer: async () => createMarkdownExtraction({ source_type: 'pdf', markdown, coverage: { status: 'complete', reason_codes: [] }, content_options: contentOptions }) });
    const prepared = prepareTextPrivacyReview({ text: extracted.markdown, profile, productChannel: 'standalone', consumerOptions, registry: require('../plugins/data-secure/server/privacy/entities').makeRegistry(), captureTrace: true });
    const reviewed = await resolveTextPrivacyReview(prepared, null, { reviewPolicy: 'automatic-conservative' });
    const final = finalizeTextPrivacyReview(prepared, reviewed, { prefix: '', suffix: '' });
    assert.doesNotMatch(final.markdown, /Qvx|Qvy/u); assert.match(final.markdown, /FHIR REST 123/u); assert.equal(replayTransformTrace(final.transform_trace), final.markdown);
    const proof = { markdown: final.markdown, profile, content_options: contentOptions, source_extraction: extracted.sourceExtraction, dictionary: final.dictionary, strong_person_anchor: final.strong_person_anchor, reviewed_person_candidates: final.reviewed_person_candidates };
    assert.ok(verifyAnonymizedPublication(proof));
    const { initialEntities, applyEntityDecisions } = require('../plugins/data-secure/server/gateway/standalone-entity-review');
    const entities = initialEntities({ markdown: final.markdown, transform_trace: final.transform_trace }), target = entities.find(row => row.original.includes('Qvx')); assert.ok(target);
    const kept = applyEntityDecisions(final.markdown, entities, [{ entity_id: target.entity_id, decision: 'keep' }], Buffer.alloc(32, 7));
    const keepProof = require('../plugins/data-secure/server/privacy/residual-person-review').bindStandaloneDocumentKeeps(kept.markdown, [], kept.entities.filter(row => row.decision === 'keep').map(({ start, end }) => ({ start, end })));
    assert.throws(() => verifyAnonymizedPublication({ ...proof, markdown: kept.markdown, reviewed_person_candidates: keepProof }), { code: 'STANDALONE_PUBLICATION_INVALID' });
  });
});

const {taggedPdf}=require('./lib/rc176-tagged-pdf.cjs');
function nativePageMarkdown(items){
 let value='',previous;
 for(const item of items){
  if(!Object.hasOwn(item,'str'))continue;
  if(item.str.trim()&&!value.endsWith('\n')){
   const boundary=nativeTextSeparator(previous,item);
   if(boundary==='\n'||boundary&&!/\s/u.test(value.slice(-1))&&!/^\s/u.test(item.str))value+=boundary;
  }
  value+=item.str+(item.hasEOL?'\n':'');
  if(item.hasEOL)previous=undefined;else if(item.str.trim())previous=item;
 }
 return '## Seite 1\n\n'+require('../plugins/data-secure/server/standalone/readable-markdown').readableText(value).markdown;
}
const splitFields=[
 {name:'same native inline Name across P tags',
  bytes:taggedPdf([{id:0,text:'Name: Anna ',x:20,y:200},{id:1,text:'Berger',x:90,y:200}],doc(P(0),P(1))),
  sha256:'593f53cf71d41e56f82cb0715f59f5a56cdf4c532bca90e36a6cbf99efb401ef'},
 {name:'same native inline full name across actual table cells',
  bytes:taggedPdf([{id:1,text:'Status',x:90,y:300},{id:0,text:'Fachtext',x:20,y:300},{id:2,text:'Name: Anna',x:20,y:250},{id:3,text:'Berger',x:90,y:250}],
   doc({role:'Table',children:[{role:'THead',children:[{role:'TR',children:[{role:'TH',children:[P(0)]},{role:'TH',children:[P(1)]}]}]},
    {role:'TBody',children:[{role:'TR',children:[{role:'TD',children:[P(2)]},{role:'TD',children:[P(3)]}]}]}]}))}
];
await test('unlabelled native inline chain also retains raw source instead of gaining a new cell boundary, without a universal-name-detection oracle',async()=>{
 const bytes=taggedPdf([{id:1,text:'Status',x:70,y:300},{id:0,text:'Fachtext',x:20,y:300},{id:2,text:'Anna',x:20,y:250},{id:3,text:'Berger',x:70,y:250}],
  doc({role:'Table',children:[{role:'THead',children:[{role:'TR',children:[{role:'TH',children:[P(0)]},{role:'TH',children:[P(1)]}]}]},
   {role:'TBody',children:[{role:'TR',children:[{role:'TD',children:[P(2)]},{role:'TD',children:[P(3)]}]}]}]}));
 await actualPdf(bytes,({content,result})=>{assert.equal(result.applied,false);assert.strictEqual(result.items,content.items);assert.match(nativePageMarkdown(result.items),/Anna Berger/u);});
});
for(const fixture of splitFields)for(const markdownOutput of ['content-v1','notes-v1'])for(const profile of ['general','personnel_profile'])await test(`actual native inline owner fallback -> Source/Privacy/Trace/Publication/Keep ${fixture.name}/${markdownOutput}/${profile}`,async()=>{
 const before=sha(fixture.bytes);if(fixture.sha256)assert.equal(before,fixture.sha256,'unchanged original independent-review RED source');
 await actualPdf(fixture.bytes,async({bytes,content,result})=>{
  assert.equal(result.applied,false,'no new paragraph/cell boundary through an intact native inline chain');
  assert.strictEqual(result.items,content.items);assert.deepEqual(result.blocks,[]);
  // Same fallback entrance as production: every original native TextContent
  // object is retained, not a repaired name, guessed label or source subset.
  const markdown=nativePageMarkdown(content.items);
  assert.match(markdown,/Anna Berger/u);
  const contentOptions={schema:'datasecure-content-options/1',markdownOutput,scanOcr:false,imageOcr:false};
  const {extractSourceForPrivacy}=require('../plugins/data-secure/server/core/markdown-first-privacy'),{createMarkdownExtraction}=require('../plugins/data-secure/server/standalone/markdown-contract');
  const source=await extractSourceForPrivacy(bytes,'.pdf',{contentOptions,convertBuffer:async()=>createMarkdownExtraction({source_type:'pdf',markdown,content_options:contentOptions,coverage:{status:'incomplete',reason_codes:['SOURCE_COVERAGE_UNVERIFIED']}})});
  const prepared=prepareTextPrivacyReview({text:source.markdown,profile,productChannel:'standalone',consumerOptions:{productChannel:'standalone',contentOptions},registry:require('../plugins/data-secure/server/privacy/entities').makeRegistry(),captureTrace:true});
  const reviewed=await resolveTextPrivacyReview(prepared,null,{reviewPolicy:'automatic-conservative'}),final=finalizeTextPrivacyReview(prepared,reviewed,{prefix:'',suffix:''});
  assert.doesNotMatch(final.markdown,/Anna|Berger/u);assert.equal(replayTransformTrace(final.transform_trace),final.markdown);
  if(fixture.name.includes('table cells'))for(const fact of ['Status','Fachtext'])assert.match(final.markdown,new RegExp(fact,'u'));
  const proof={markdown:final.markdown,profile,content_options:contentOptions,source_extraction:source.sourceExtraction,dictionary:final.dictionary,strong_person_anchor:final.strong_person_anchor,reviewed_person_candidates:final.reviewed_person_candidates};assert.ok(verifyAnonymizedPublication(proof));
  const {initialEntities,applyEntityDecisions}=require('../plugins/data-secure/server/gateway/standalone-entity-review'),entities=initialEntities({markdown:final.markdown,transform_trace:final.transform_trace});
  const target=entities.find(entity=>entity.original.includes('Anna')&&entity.original.includes('Berger'));assert.ok(target,'complete actual native name remains one trace entity');
  const kept=applyEntityDecisions(final.markdown,entities,[{entity_id:target.entity_id,decision:'keep'}],Buffer.alloc(32,7));
  assert.throws(()=>verifyAnonymizedPublication({...proof,markdown:kept.markdown,reviewed_person_candidates:require('../plugins/data-secure/server/privacy/residual-person-review').bindStandaloneDocumentKeeps(kept.markdown,[],kept.entities.filter(entity=>entity.decision==='keep').map(({start,end})=>({start,end})))}),{code:'STANDALONE_PUBLICATION_INVALID'});
 });
 assert.equal(sha(fixture.bytes),before);
});
console.log(`\n${passed} tagged PDF structure groups passed; actual pinned PDF.js, no desktop/target-host UAT claim`);
