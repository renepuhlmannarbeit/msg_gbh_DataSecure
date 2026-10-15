import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from '../scripts/lib/standalone-conversion-runtime.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
import { fromMarkdown } from '../native/markdown/pilot/node_modules/mdast-util-from-markdown/index.js';
import { parseFragment } from '../native/markdown/pilot/node_modules/parse5/dist/index.js';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { encodePng, decodePng } = require('../plugins/data-secure/server/images/png');
const { encodeBmp } = require('../plugins/data-secure/server/images/bmp');
const { extractOfficeMarkdownAndMedia, extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { prepareOfficeImagePlan, imageSize } = require('../plugins/data-secure/server/standalone/office-image-ocr');
const { extractMarkdownImageMedia, markdownImageContent } = require('../plugins/data-secure/server/standalone/markdown-image-content');
const options = imageOcr => ({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const nativeText = 'NATIVE ORIGINAL § € ± →';
const relations = rows => `<Relationships xmlns="${PR}">${rows.map(([id, kind, target, mode]) =>
  `<Relationship Id="${id}" Type="${R}/${kind}" Target="${target}"${mode ? ` TargetMode="${mode}"` : ''}/>`).join('')}</Relationships>`;

function office(type, media, relationship = 'internal') {
  const root = { docx: 'word', xlsx: 'xl', pptx: 'ppt' }[type];
  const imageRows = media.map((item, index) => [`img${index}`, relationship === 'wrong-type' ? 'hyperlink' : 'image',
    relationship === 'external' ? 'https://never-read.invalid/private.png' : `${type === 'docx' ? '' : '../'}media/image${index}.${item.ext}`,
    relationship === 'external' ? 'External' : undefined]);
  const entries = type === 'docx' ? [
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:a="${A}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>${nativeText}</w:t></w:r></w:p>${media.map((_, index) => `<w:p><w:r><w:drawing><a:blip r:embed="img${index}"/></w:drawing></w:r></w:p>`).join('')}</w:body></w:document>`],
    ...(relationship === 'orphan' ? [] : [['word/_rels/document.xml.rels', relations(imageRows)]])
  ] : type === 'xlsx' ? [
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Tabelle" sheetId="1" r:id="s1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', relations([['s1', 'worksheet', 'worksheets/sheet1.xml']])],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}" xmlns:r="${R}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${nativeText}</t></is></c></row></sheetData><drawing r:id="d1"/></worksheet>`],
    ['xl/worksheets/_rels/sheet1.xml.rels', relations([['d1', 'drawing', '../drawings/drawing1.xml']])],
    ['xl/drawings/drawing1.xml', `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${A}" xmlns:r="${R}">${media.map((_, index) => `<xdr:pic><a:blip r:embed="img${index}"/></xdr:pic>`).join('')}</xdr:wsDr>`],
    ...(relationship === 'orphan' ? [] : [['xl/drawings/_rels/drawing1.xml.rels', relations(imageRows)]])
  ] : [
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', relations([['s1', 'slide', 'slides/slide1.xml']])],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${nativeText}</a:t></a:r></a:p></p:txBody></p:sp>${media.map((_, index) => `<p:pic><a:blip r:embed="img${index}"/></p:pic>`).join('')}</p:spTree></p:cSld></p:sld>`],
    ...(relationship === 'orphan' ? [] : [['ppt/slides/_rels/slide1.xml.rels', relations(imageRows)]])
  ];
  return zipStore([...opcControlEntries(type), ...entries, ...media.map((item, index) => [`${root}/media/image${index}.${item.ext}`, item.bytes])]);
}

let passed = 0;
async function check(label, fn) { await fn(); passed++; process.stdout.write(`PASS ${label}\n`); }
const tiny = encodePng({ width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) });
for (const type of ['docx', 'xlsx', 'pptx']) await check(`${type}: only internal image relationships expose media to OCR`, () => {
  const input = office(type, [{ ext: 'png', bytes: tiny }]);
  const own = extractOfficeMarkdownAndMedia(input, `.${type}`, { markdownOutput: 'content-v1' });
  assert.equal(own.attachments.length, 1); assert.match(own.extraction.markdown, /NATIVE ORIGINAL/u);
  assert.equal(Object.hasOwn(own.extraction, 'attachments'), false);
  assert.deepEqual(extractMarkdownBuffer(input, `.${type}`, { markdownOutput: 'content-v1' }), own.extraction);
  for (const role of ['external', 'orphan', 'wrong-type']) {
    const rejected = extractOfficeMarkdownAndMedia(office(type, [{ ext: 'png', bytes: tiny }], role), `.${type}`, { markdownOutput: 'content-v1' });
    assert.equal(rejected.attachments.length, 0, role);
    assert.equal(rejected.extraction.coverage.status, 'incomplete');
  }
  const plan = prepareOfficeImagePlan(own.attachments); assert.equal(plan.length, 1);
  assert.deepEqual([plan[0].width, plan[0].height], [1, 1]); plan[0].bytes.fill(0);
});
await check('office image plan rejects unsupported media and aggregate pixel budget before OCR allocation', () => {
  const attachment = { type: 'image', mimeType: 'image/svg+xml', extension: 'svg', source_part: 'word/media/a.svg', data: Buffer.from('<svg/>').toString('base64') };
  assert.throws(() => prepareOfficeImagePlan([attachment]), { code: 'OFFICE_IMAGE_OCR_UNAVAILABLE' });
  assert.throws(() => prepareOfficeImagePlan([{ ...attachment, extension: '__proto__', mimeType: undefined }]), { code: 'OFFICE_IMAGE_OCR_UNAVAILABLE' });
  assert.throws(() => prepareOfficeImagePlan([{ ...attachment, extension: 'png', mimeType: 'image/png', data: tiny.toString('base64').replace(/=+$/u, '') }]), { code: 'CONVERSION_IMAGE_INVALID' });
  const large = Buffer.from(tiny); large.writeUInt32BE(4000, 16); large.writeUInt32BE(4000, 20);
  const raster = index => ({ type: 'image', mimeType: 'image/png', extension: 'png', source_part: `word/media/${index}.png`, data: large.toString('base64') });
  assert.throws(() => prepareOfficeImagePlan([raster(1), raster(2)]), { code: 'CONVERSION_PIXEL_LIMIT' });
  assert.throws(() => prepareOfficeImagePlan(Array.from({ length: 151 }, (_, index) => raster(index))), { code: 'INPUT_FORMAT_LIMIT' });
  assert.throws(() => imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xda]), 'jpeg'), { code: 'CONVERSION_IMAGE_INVALID' });
});
const readers = { fromMarkdown, parseFragment };
const tinyUri = `data:image/png;base64,${tiny.toString('base64')}`;
await check('actual Markdown AST/HTML nodes yield only canonical embedded raster media; captions and code stay intact', () => {
  for (const source of [
    `Vor ![Alt](${tinyUri} "Titel") Nach`,
    `![Alt][Bild]\n\n[Bild]: ${tinyUri} "Titel"`,
    `<figure><img src="${tinyUri}" alt="Alt" title="Titel"><figcaption>Caption 42</figcaption></figure>`,
    `<img srcset="${tinyUri} 1x" alt="Alt">`,
    `<picture><source srcset="${tinyUri} 1x"><img src="${tinyUri}" alt="Alt"></picture>`,
    `<svg><image href="${tinyUri}"/><text>Alt</text></svg>`
  ]) {
    const transformed = extractMarkdownImageMedia(source, readers);
    assert.ok(transformed.media.length > 0); assert.doesNotMatch(transformed.markdown, /data:image|base64/u);
    assert.match(transformed.markdown, /Alt/u);
    for (const media of transformed.media) {
      assert.equal(media.extension, 'png'); assert.equal(media.data, tiny.toString('base64'));
      assert.equal(media.start, media.end); assert.ok(media.start <= transformed.markdown.length);
    }
  }
  const shared = extractMarkdownImageMedia(`![Alt][Bild] [Quelle][Bild]\n\n[Bild]: ${tinyUri} "Titel"`, readers);
  assert.match(shared.markdown, /Alt.*Titel.*Quelle.*Titel/u); assert.doesNotMatch(shared.markdown, /data:image|\[Bild\]:/u);
  const code = `\`![Literal](${tinyUri})\`\n\n\`<img src="https://never-read.invalid/private.png">\``;
  const untouched = extractMarkdownImageMedia(code, readers);
  assert.equal(untouched.markdown, code); assert.equal(untouched.media.length, 0);
  assert.equal(markdownImageContent(`![Alt](${tinyUri})`, readers).media, undefined, 'ordinary presentation never exposes a private media plan');
});
await check('mixed external, path, unsupported and noncanonical embedded media are rejected from actual image nodes', () => {
  for (const value of ['https://never-read.invalid/p.png', 'file:///C:/private.png', '../private.png',
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,AAAA=', 'data:image/png;base64,AA%2BA']) {
    assert.throws(() => extractMarkdownImageMedia(`![first](${tinyUri})\n\n![second](${value})`, readers), { code: 'MARKDOWN_IMAGE_OCR_UNAVAILABLE' });
  }
  assert.throws(() => extractMarkdownImageMedia(`<picture><source srcset="${tinyUri} 1x, https://never-read.invalid/p.png 2x"><img src="${tinyUri}"></picture>`, readers), { code: 'MARKDOWN_IMAGE_OCR_UNAVAILABLE' });
  assert.throws(() => extractMarkdownImageMedia(Array.from({ length: 151 }, () => '![Bild][r]').join('\n\n') + `\n\n[r]: ${tinyUri}`, readers), { code: 'INPUT_FORMAT_LIMIT' });
  const largeUri = `data:image/png;base64,${Buffer.alloc(1024 * 1024).toString('base64')}`;
  assert.throws(() => extractMarkdownImageMedia(Array.from({ length: 31 }, () => '![Bild][r]').join('\n\n') + `\n\n[r]: ${largeUri}`, readers), { code: 'INPUT_FORMAT_LIMIT' });
});
await check('identical img/picture alternative URIs are one physical raster; separate image nodes are never globally deduplicated', () => {
  for (const source of [
    `<img src="${tinyUri}" srcset="${tinyUri} 1x" alt="Caption">`,
    `<picture><source srcset="${tinyUri} 1x"><img src="${tinyUri}" srcset="${tinyUri} 1x" alt="Caption"></picture>`,
    `<svg><foreignObject><picture><source srcset="${tinyUri} 1x"><img src="${tinyUri}" alt="Caption"></picture></foreignObject></svg>`
  ]) {
    const result = extractMarkdownImageMedia(source, readers);
    assert.equal(result.media.length, 1); assert.match(result.markdown, /Caption/u);
  }
  for (const source of [
    `![One](${tinyUri}) ![Two](${tinyUri})`,
    `<img src="${tinyUri}"><img src="${tinyUri}">`,
    `<picture><img src="${tinyUri}"></picture><picture><img src="${tinyUri}"></picture>`,
    `<svg><image href="${tinyUri}"/><image href="${tinyUri}"/></svg>`
  ]) assert.equal(extractMarkdownImageMedia(source, readers).media.length, 2);
  assert.throws(() => extractMarkdownImageMedia(`<picture><source srcset="https://never-read.invalid/x"><img src="${tinyUri}"></picture>`, readers), { code: 'MARKDOWN_IMAGE_OCR_UNAVAILABLE' });
});

if (process.argv.includes('--source-only')) {
  process.stdout.write(`${passed} source-only policy groups passed; native OCR explicitly not run\n`);
} else {
  const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
    : process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch) ? `macos-${process.arch}`
      : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64-glibc' : null;
  if (!target) throw new Error('CONVERSION_TEST_HOST_UNSUPPORTED');
  const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-office-ocr-'));
  const server = path.join(scope, 'server'), runtime = path.join(server, 'standalone', 'conversion-runtime');
  const originalSpawn = childProcess.spawn, children = [];
  let diagnostics = '';
  childProcess.spawn = (...args) => {
    const child = originalSpawn(...args); let closed = false;
    const done = new Promise(resolve => child.once('close', () => { closed = true; resolve(); }));
    child.stderr?.on('data', bytes => { diagnostics += bytes.toString(); });
    children.push({ child, done, closed: () => closed }); return child;
  };
  try {
    writeStandaloneRuntime(path.join(repo, 'plugins', 'data-secure', 'server'), server, target);
    writeConversionRuntime(repo, runtime, target);
    const { convertBuffer } = require(path.join(server, 'standalone/conversion-worker'));
    // Independent text oracle specified before rendering. It is not derived
    // from an OCR result and no mocked raster/recognition data is used.
    // Own the native addon lifetime in a completed fixture subprocess, so the
    // Windows test can clean its exact runtime scope without a DLL lock.
    const rasterFixture = `const { createCanvas } = require(process.argv[1]);
      const canvas = createCanvas(1500, 450), context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, 1500, 450); context.fillStyle = 'black'; context.font = '62px Arial';
      context.fillText('RASTER ORIGINAL', 60, 100); context.fillText('E-Mail: qa77@quality.example.invalid', 60, 220);
      context.fillText('Telefon: +49 30 555 1077', 60, 340);
      process.stdout.write(JSON.stringify({ png: canvas.toBuffer('image/png').toString('base64'),
        jpg: canvas.toBuffer('image/jpeg').toString('base64') }));`;
    const generated = JSON.parse(childProcess.execFileSync(process.execPath,
      ['-e', rasterFixture, path.join(runtime, 'node_modules/@napi-rs/canvas')],
      { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
    const png = Buffer.from(generated.png, 'base64'), jpg = Buffer.from(generated.jpg, 'base64'), bmp = encodeBmp(decodePng(png));
    for (const type of ['docx', 'xlsx', 'pptx']) for (const [ext, bytes] of [['png', png], ['jpg', jpg], ['bmp', bmp]]) {
      await check(`${target}: real ${type} ${ext} raster OCR and exact private contact spans`, async () => {
        const source = office(type, [{ ext, bytes }]), before = hash(source);
        const result = await convertBuffer(source, `.${type}`, { contentOptions: options(true) });
        assert.equal(result.source_type, type); assert.equal(result.anonymized, false);
        assert.match(result.markdown, /NATIVE ORIGINAL/u); assert.match(result.markdown, /RASTER ORIGINAL/u);
        assert.doesNotMatch(result.markdown, /data:image|image0|Bildtext|Zusätzlicher|Dokumentinformationen/u);
        assert.equal(hash(source), before); assert.ok(result.ocr_contacts?.length >= 2);
        assert.ok(result.ocr_contacts.some(contact => contact.image?.png_base64));
        for (const contact of result.ocr_contacts) {
          assert.equal(contact.page, 1); assert.ok(result.markdown.slice(contact.start, contact.end).length > 0);
          assert.doesNotMatch(result.markdown.slice(contact.start, contact.end), /[\r\n]/u);
        }
      });
    }
    await check(`${target}: two office images retain separate crop coordinates and global Markdown offsets`, async () => {
      const result = await convertBuffer(office('docx', [{ ext: 'png', bytes: png }, { ext: 'png', bytes: png }]), '.docx', { contentOptions: options(true) });
      assert.ok(result.ocr_contacts.some(item => item.page === 1)); assert.ok(result.ocr_contacts.some(item => item.page === 2));
      assert.equal((result.markdown.match(/RASTER ORIGINAL/gu) || []).length, 2);
      for (const contact of result.ocr_contacts) assert.ok(result.markdown.slice(contact.start, contact.end).includes(contact.kind === 'email' ? '@' : '555'));
    });
    await check(`${target}: disabled Office OCR and unsafe relationships never start Tesseract`, async () => {
      diagnostics = '';
      for (const type of ['docx', 'xlsx', 'pptx']) {
        const result = await convertBuffer(office(type, [{ ext: 'png', bytes: png }]), `.${type}`, { contentOptions: options(false) });
        assert.match(result.markdown, /NATIVE ORIGINAL/u); assert.doesNotMatch(result.markdown, /RASTER ORIGINAL/u);
        const orphan = await convertBuffer(office(type, [{ ext: 'png', bytes: png }], 'orphan'), `.${type}`, { contentOptions: options(true) });
        assert.doesNotMatch(orphan.markdown, /RASTER ORIGINAL/u);
      }
      await assert.rejects(convertBuffer(office('docx', [{ ext: 'svg', bytes: Buffer.from('<svg/>') }]), '.docx', { contentOptions: options(true) }), { code: 'OFFICE_IMAGE_OCR_UNAVAILABLE' });
      assert.doesNotMatch(diagnostics, /CONVERSION_OCR_(?:STARTING|READY)/u);
    });
    await check(`${target}: empty decorative raster does not erase native Office prose or invent image text`, async () => {
      diagnostics = '';
      const result = await convertBuffer(office('docx', [{ ext: 'png', bytes: tiny }]), '.docx', { contentOptions: options(true) });
      assert.match(result.markdown, /NATIVE ORIGINAL/u);
      assert.ok(!result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'), 'a decorative empty image is not an empty document');
      assert.equal(result.coverage.status, 'incomplete');
      assert.ok(result.coverage.reason_codes.includes('VISUAL_CONTENT_NOT_EXTRACTED'));
      assert.equal(result.ocr_contacts, undefined);
      assert.doesNotMatch(result.markdown, /Bildtext|Zusätzlicher/u);
      assert.doesNotMatch(diagnostics, /CONVERSION_OCR_(?:STARTING|READY)/u, 'uniform raster uses an exact contrast fact, not a hallucinated OCR transcript');
    });
    await check(`${target}: requested MD external image OCR is explicit, code-only syntax never triggers image reads`, async () => {
      diagnostics = '';
      for (const markdownOutput of ['content-v1', 'notes-v1']) {
        const opts = { ...options(true), markdownOutput };
        for (const source of ['![Titel](https://never-read.invalid/private.png)', '<img src="file:///private.png" alt="Titel">']) {
          await assert.rejects(convertBuffer(Buffer.from(source), '.md', { contentOptions: opts }), { code: 'MARKDOWN_IMAGE_OCR_UNAVAILABLE' });
        }
        const source = '`![Code](private.png)`\n\nText § € ± →';
        const result = await convertBuffer(Buffer.from(source), '.md', { contentOptions: opts });
        assert.equal(result.markdown, source);
      }
      const result = await convertBuffer(Buffer.from('![Bildtitel](private.png)\n\nText'), '.md', { contentOptions: options(false) });
      assert.match(result.markdown, /Bildtitel/u); assert.doesNotMatch(result.markdown, /private\.png/u);
      assert.doesNotMatch(diagnostics, /CONVERSION_OCR_(?:STARTING|READY)/u);
    });
    for (const [mime, bytes] of [['png', png], ['jpeg', jpg], ['bmp', bmp]]) await check(`${target}: real MD canonical ${mime} data URI OCR retains captions and private contact crops`, async () => {
      const uri = `data:image/${mime};base64,${bytes.toString('base64')}`;
      const source = `# Original MD\n\n${nativeText}\n\n![Fachliche Caption](${uri} "Grafiktitel")\n\n\`![Code](private.png)\``;
      const before = hash(Buffer.from(source));
      const result = await convertBuffer(Buffer.from(source), '.md', { contentOptions: options(true) });
      assert.match(result.markdown, /Fachliche Caption.*Grafiktitel/u); assert.match(result.markdown, /RASTER ORIGINAL/u);
      assert.match(result.markdown, /`!\[Code\]\(private\.png\)`/u); assert.equal(hash(Buffer.from(source)), before);
      assert.doesNotMatch(result.markdown, /data:image|base64|Zusätzlicher Bildtext/u);
      assert.ok(result.ocr_contacts?.length >= 2); assert.ok(result.ocr_contacts.some(item => item.image?.png_base64));
      for (const contact of result.ocr_contacts) { assert.equal(contact.page, 1); assert.ok(result.markdown.slice(contact.start, contact.end).length > 0); }
    });
    await check(`${target}: actual HTML/picture and used Markdown definitions supply raster OCR without changing table rows`, async () => {
      const uri = `data:image/png;base64,${png.toString('base64')}`;
      for (const source of [
        `![Caption][Grafik]\n\n[Grafik]: ${uri} "Grafiktitel"`,
        `<figure><picture><source srcset="${uri} 1x"><img src="${uri}" alt="Caption"></picture><figcaption>Textcaption 42</figcaption></figure>`,
        `| Wert | Bildtext |\n| --- | --- |\n| Original 42 | ![Caption](${uri}) |\n\nNachfolgetext`
      ]) {
        const result = await convertBuffer(Buffer.from(source), '.md', { contentOptions: options(true) });
        assert.match(result.markdown, /Caption/u); assert.match(result.markdown, /RASTER ORIGINAL/u);
        assert.doesNotMatch(result.markdown, /data:image|base64/u);
        assert.equal((result.markdown.match(/RASTER ORIGINAL/gu) || []).length, 1, 'one physical picture, not two OCR transcripts from alternatives');
        if (source.startsWith('|')) {
          assert.ok(result.markdown.startsWith('| Wert | Bildtext |\n| --- | --- |\n| Original 42 | Caption |\n\nNachfolgetext'));
          const rendered = require('markdown-it')({ html: false }).render(result.markdown);
          assert.match(rendered, /<table>/u); assert.match(rendered, /Original 42/u);
        }
        for (const contact of result.ocr_contacts || []) assert.ok(result.markdown.slice(contact.start, contact.end).length > 0);
      }
    });
    await check(`${target}: two separate canonical MD image nodes keep two transcripts and separate private locators`, async () => {
      const uri = `data:image/png;base64,${png.toString('base64')}`;
      const result = await convertBuffer(Buffer.from(`![One](${uri})\n\n![Two](${uri})`), '.md', { contentOptions: options(true) });
      assert.equal((result.markdown.match(/RASTER ORIGINAL/gu) || []).length, 2);
      assert.ok(result.ocr_contacts.some(item => item.page === 1)); assert.ok(result.ocr_contacts.some(item => item.page === 2));
    });
    await check(`${target}: later external MD image prevents all OCR; malformed raster stops before OCR initialization`, async () => {
      diagnostics = '';
      const uri = `data:image/png;base64,${png.toString('base64')}`;
      for (const source of [`![First](${uri})\n\n![Second](https://never-read.invalid/private.png)`,
        `<img src="${uri}"><img src="file:///C:/private.png">`,
        `<picture><source srcset="https://never-read.invalid/private.png"><img src="${uri}"></picture>`]) {
        await assert.rejects(convertBuffer(Buffer.from(source), '.md', { contentOptions: options(true) }), { code: 'MARKDOWN_IMAGE_OCR_UNAVAILABLE' });
      }
      await assert.rejects(convertBuffer(Buffer.from('![Bad](data:image/png;base64,AAAA)'), '.md', { contentOptions: options(true) }), { code: 'CONVERSION_IMAGE_INVALID' });
      assert.doesNotMatch(diagnostics, /CONVERSION_OCR_(?:STARTING|READY)/u);
    });
    process.stdout.write(`${passed} Office/MD groups passed; actual native host ${target}\n`);
  } catch (failure) {
    // The product never persists parser stderr. In this synthetic CI fixture,
    // emit only the supervisor's fixed setup phase (and numeric errno) so an
    // intermittent macOS isolation failure can be diagnosed without paths or
    // document text from Node, OCR or other vendor processes.
    const phases = [...diagnostics.matchAll(/datasecure-sandbox setup_failure phase=([a-z-]+)(?: errno=(\d+))?/gu)];
    if (phases.length) {
      const [, phase, errno] = phases.at(-1);
      process.stderr.write(`DATASECURE_SUPERVISOR_SETUP_PHASE=${phase}${errno ? ` ERRNO=${errno}` : ''}\n`);
    }
    throw failure;
  } finally {
    childProcess.spawn = originalSpawn;
    for (const entry of children) if (!entry.closed()) entry.child.kill('SIGTERM');
    await Promise.all(children.map(entry => entry.done));
    removePackageSmokeScope(repo, scope);
  }
}
