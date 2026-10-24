import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';
import { writeConversionRuntime } from '../scripts/lib/standalone-conversion-runtime.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';
import { fromMarkdown } from '../native/markdown/pilot/node_modules/mdast-util-from-markdown/index.js';
import { parseFragment } from '../native/markdown/pilot/node_modules/parse5/dist/index.js';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { zipStore, crc32 } = require('./lib/zip');
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

function office(type, media, relationship = 'internal', sensitiveTable = false, sourceText = nativeText) {
  const root = { docx: 'word', xlsx: 'xl', pptx: 'ppt' }[type];
  const imageRows = media.map((item, index) => [`img${index}`, relationship === 'wrong-type' ? 'hyperlink' : 'image',
    relationship === 'external' ? 'https://never-read.invalid/private.png' : `${type === 'docx' ? '' : '../'}media/image${index}.${item.ext}`,
    relationship === 'external' ? 'External' : undefined]);
  const wordTable = sensitiveTable ? '<w:tbl>' + ['Name', 'Qvx'].map(text =>
    `<w:tr><w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc></w:tr>`).join('') + '</w:tbl>' : '';
  const sheetRows = (sensitiveTable ? ['Name', 'Qvx', sourceText] : [sourceText]).map((text, index) =>
    `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t>${text}</t></is></c></row>`).join('');
  const slideTable = sensitiveTable ? '<p:graphicFrame><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>' + ['Name', 'Qvx'].map(text =>
    `<a:tr><a:tc><a:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody></a:tc></a:tr>`).join('') +
    '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>' : '';
  const entries = type === 'docx' ? [
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:a="${A}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>${sourceText}</w:t></w:r></w:p>${wordTable}${media.map((_, index) => `<w:p><w:r><w:drawing><a:blip r:embed="img${index}"/></w:drawing></w:r></w:p>`).join('')}</w:body></w:document>`],
    ...(relationship === 'orphan' ? [] : [['word/_rels/document.xml.rels', relations(imageRows)]])
  ] : type === 'xlsx' ? [
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Tabelle" sheetId="1" r:id="s1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', relations([['s1', 'worksheet', 'worksheets/sheet1.xml']])],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}" xmlns:r="${R}"><sheetData>${sheetRows}</sheetData><drawing r:id="d1"/></worksheet>`],
    ['xl/worksheets/_rels/sheet1.xml.rels', relations([['d1', 'drawing', '../drawings/drawing1.xml']])],
    ['xl/drawings/drawing1.xml', `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${A}" xmlns:r="${R}">${media.map((_, index) => `<xdr:pic><a:blip r:embed="img${index}"/></xdr:pic>`).join('')}</xdr:wsDr>`],
    ...(relationship === 'orphan' ? [] : [['xl/drawings/_rels/drawing1.xml.rels', relations(imageRows)]])
  ] : [
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', relations([['s1', 'slide', 'slides/slide1.xml']])],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${sourceText}</a:t></a:r></a:p></p:txBody></p:sp>${slideTable}${media.map((_, index) => `<p:pic><a:blip r:embed="img${index}"/></p:pic>`).join('')}</p:spTree></p:cSld></p:sld>`],
    ...(relationship === 'orphan' ? [] : [['ppt/slides/_rels/slide1.xml.rels', relations(imageRows)]])
  ];
  const controls = type === 'xlsx' ? { additionalOverrides: [{ part: 'xl/worksheets/sheet1.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' }] } : {};
  return zipStore([...opcControlEntries(type, controls), ...entries, ...media.map((item, index) => [`${root}/media/image${index}.${item.ext}`, item.bytes])]);
}

let passed = 0;
async function check(label, fn) { await fn(); passed++; process.stdout.write(`PASS ${label}\n`); }
const tiny = encodePng({ width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) });
const transparentSamples = ['iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAAAAADRSSBWAAAAAnRSTlMAAHaTzTgAAAALSURBVHicY2D4DwABAgEAQr68aAAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAABnRSTlMAAAAAAABupgeRAAAAD0lEQVR4nGNgYGD4//8/AAYBAv4CsjmuAAAAAElFTkSuQmCC'].map(value => Buffer.from(value, 'base64'));
function whiteKeyPng({ width, height, rgba }) {
  const chunk = (type, data) => {
    const name = Buffer.from(type), out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length);
    name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length); return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height); let offset = 0;
  for (let y = 0; y < height; y++) { raw[offset++] = 0; for (let x = 0; x < width; x++) {
    const pixel = (y * width + x) * 4; for (let channel = 0; channel < 3; channel++) raw[offset++] = rgba[pixel + channel];
  } }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR', header), chunk('tRNS', Buffer.from([0,255,0,255,0,255])),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const type of ['docx', 'xlsx', 'pptx']) await check(`${type}: only internal image relationships expose media to OCR`, () => {
  const input = office(type, [{ ext: 'png', bytes: tiny }]);
  const own = extractOfficeMarkdownAndMedia(input, `.${type}`, { markdownOutput: 'content-v1' });
  assert.equal(own.attachments.length, 1); assert.match(own.extraction.markdown, /NATIVE ORIGINAL/u);
  assert.equal(Object.hasOwn(own.extraction, 'attachments'), false);
  assert.deepEqual(extractMarkdownBuffer(input, `.${type}`, { markdownOutput: 'content-v1' }), own.extraction);
  if (type === 'xlsx') {
    const { readZip } = require('../plugins/data-secure/server/zip-reader');
    const worksheetType = '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    for (const declaredType of ['', worksheetType.replace('application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml', 'application/xml')]) {
      const entries = readZip(input), original = hash(input), contentTypes = entries.get('[Content_Types].xml').toString('utf8');
      assert.ok(contentTypes.includes(worksheetType));
      entries.set('[Content_Types].xml', Buffer.from(contentTypes.replace(worksheetType, declaredType)));
      assert.throws(() => extractOfficeMarkdownAndMedia(zipStore([...entries]), '.xlsx', { markdownOutput: 'content-v1' }),
        { code: 'XLSX_STRUCTURE_UNSAFE' });
      assert.equal(hash(input), original, 'the missing/wrong worksheet-MIME negative cannot modify its valid source');
    }
  }
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
await check('tRNS pixels survive actual Office relationships and Markdown media mapping without coordinate changes', () => {
  for (const bytes of transparentSamples) {
    for (const type of ['docx','xlsx','pptx']) {
      const own = extractOfficeMarkdownAndMedia(office(type, [{ ext: 'png', bytes }]), `.${type}`, { markdownOutput: 'content-v1' });
      const plan = prepareOfficeImagePlan(own.attachments);
      assert.deepEqual([plan[0].width, plan[0].height, plan[0].ordinal], [2,1,1]);
      assert.deepEqual([...decodePng(plan[0].bytes).rgba], [0,0,0,0,255,255,255,255]); plan[0].bytes.fill(0);
    }
    const source = `😀 Caption ![Literal](data:image/png;base64,${bytes.toString('base64')}) after`;
    const mapped = extractMarkdownImageMedia(source, readers), plan = prepareOfficeImagePlan(mapped.media);
    assert.equal(mapped.markdown, '😀 Caption Literal after');
    assert.equal(mapped.media[0].start, '😀 Caption Literal'.length);
    assert.deepEqual([...decodePng(plan[0].bytes).rgba], [0,0,0,0,255,255,255,255]); plan[0].bytes.fill(0);
  }
});
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
    for(const type of ['docx','xlsx','pptx'])await check(`${target}: actual ${type} chartEx cache conversion is source-bound in both modes`,async()=>{
      const fixture=require('./lib/office-chartex-fixtures.cjs');
      const bytes=fixture.source(`.${type}`,fixture.chart({dimensions:fixture.dim('cat',[[0,'North'],[1,'South']],{name:'Region'})+fixture.dim('val',[[1,'200'],[0,'100']],{numeric:true}),seriesXml:fixture.series(17,{layout:'treemap'})}),{chartsheet:true}),before=hash(bytes);
      for(const markdownOutput of ['content-v1','notes-v1']){
        const result=await convertBuffer(bytes,`.${type}`,{contentOptions:{...options(false),markdownOutput}});
        assert.match(result.markdown,/\| 0 \| North \| 100 \|/u);assert.match(result.markdown,/\| 1 \| South \| 200 \|/u);assert.doesNotMatch(result.markdown,/\| 0 \| North \| 200 \||\| 1 \| South \| 100 \|/u);assert.match(result.markdown,/treemap/u);assert.notEqual(result.coverage.status,'complete');
      }
      assert.equal(hash(bytes),before);
    });
    // Independent text oracle specified before rendering. It is not derived
    // from an OCR result and no mocked raster/recognition data is used.
    // Own the native addon lifetime in a completed fixture subprocess, so the
    // Windows test can clean its exact runtime scope without a DLL lock.
    const rasterFixture = `const { createCanvas, GifEncoder } = require(process.argv[1]);
      const canvas = createCanvas(1500, 450), context = canvas.getContext('2d');
      context.fillStyle = 'white'; context.fillRect(0, 0, 1500, 450); context.fillStyle = 'black'; context.font = '62px Arial';
      context.fillText('RASTER ORIGINAL', 60, 100); context.fillText('E-Mail: qa77@quality.example.invalid', 60, 220);
      context.fillText('Telefon: +49 30 555 1077', 60, 340);
      const encoder=new GifEncoder(1500,450,{repeat:1}),pixels=new Uint8Array(context.getImageData(0,0,1500,450).data);
      let gif;try{encoder.addFrame(pixels,1500,450);encoder.addFrame(pixels,1500,450);gif=Buffer.from(encoder.finish()).toString('base64');}finally{encoder.dispose();}
      process.stdout.write(JSON.stringify({ png: canvas.toBuffer('image/png').toString('base64'),gif,
        webp:canvas.toBuffer('image/webp').toString('base64'),jpg: canvas.toBuffer('image/jpeg').toString('base64') }));`;
    const generated = JSON.parse(childProcess.execFileSync(process.execPath,
      ['-e', rasterFixture, path.join(runtime, 'node_modules/@napi-rs/canvas')],
      { windowsHide: true, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
    const png = Buffer.from(generated.png, 'base64'), jpg = Buffer.from(generated.jpg, 'base64'), bmp = encodeBmp(decodePng(png));
    const raster=decodePng(png),tagRows=[[256,4,raster.width],[257,4,raster.height],[258,3,8],[259,3,1],[262,3,1],
      [273,4,146],[274,3,1],[277,3,1],[278,4,raster.height],[279,4,raster.width*raster.height],[284,3,1]];
    const tif=Buffer.alloc(146+raster.width*raster.height);tif.write('II');tif.writeUInt16LE(42,2);tif.writeUInt32LE(8,4);tif.writeUInt16LE(tagRows.length,8);
    for(const [index,[tag,type,value]] of tagRows.entries()){const pos=10+index*12;tif.writeUInt16LE(tag,pos);tif.writeUInt16LE(type,pos+2);tif.writeUInt32LE(1,pos+4);if(type===3)tif.writeUInt16LE(value,pos+8);else tif.writeUInt32LE(value,pos+8);}
    for(let index=0;index<raster.width*raster.height;index++)tif[146+index]=raster.rgba[index*4];
    const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="450"><rect width="1500" height="450" fill="white"/><text x="60" y="100" font-size="62">VECTOR ORIGINAL</text><text x="60" y="220" font-size="62">E-Mail: qa77@quality.example.invalid</text><text x="60" y="340" font-size="62">Telefon: +49 30 555 1077</text></svg>');
    for(const type of ['docx','xlsx','pptx'])for(const [ext,bytes,expected,copies] of [
      ['svg',svg,'VECTOR ORIGINAL',1],['webp',Buffer.from(generated.webp,'base64'),'RASTER ORIGINAL',1],
      ['gif',Buffer.from(generated.gif,'base64'),'RASTER ORIGINAL',2],['tiff',tif,'RASTER ORIGINAL',1]]){
      await check(`${target}: actual ${type} ${ext} decoder feeds OCR and unchanged privacy positions`,async()=>{
        const original=office(type,[{ext,bytes}]),before=hash(original);
        const result=await convertBuffer(original,`.${type}`,{contentOptions:options(true)});
        assert.equal(hash(original),before);assert.match(result.markdown,/NATIVE ORIGINAL/u);
        assert.equal(result.markdown.split(expected).length-1,copies);assert.ok(result.ocr_contacts?.length>=copies*2);
        assert.ok(!result.coverage.reason_codes.some(code=>/FORMAT_.*_UNSUPPORTED/u.test(code)));
        if(copies>1){assert.match(result.markdown,/Teil 1 von 2/u);assert.match(result.markdown,/Teil 2 von 2/u);}
        for(const contact of result.ocr_contacts)assert.ok(result.markdown.slice(contact.start,contact.end).includes(contact.kind==='email'?'@':'555'));
        const {extractSourceForPrivacy}=require(path.join(server,'core/markdown-first-privacy'));
        const {automaticallyRedactOcrContacts}=require(path.join(server,'gateway/bound-content-input'));
        const privateText=await extractSourceForPrivacy(original,`.${type}`,{contentOptions:options(true),convertBuffer:async()=>result});
        const masked=automaticallyRedactOcrContacts({original_text:privateText.markdown,source_type:type,contacts:privateText.ocrContacts});
        assert.doesNotMatch(masked.text,/@|555/u);assert.match(masked.text,/NATIVE ORIGINAL/u);
      });
    }
    await check(`${target}: actual worker composes tRNS against white on direct Office and Markdown routes`, async () => {
      for (const bytes of transparentSamples) {
        diagnostics = '';
        await assert.rejects(convertBuffer(bytes, '.png', { contentOptions: options(true) }), { code: 'CONVERSION_OCR_TEXT_EMPTY' });
        for (const type of ['docx','xlsx','pptx']) {
          const converted = await convertBuffer(office(type, [{ ext: 'png', bytes }]), `.${type}`, { contentOptions: options(true) });
          assert.match(converted.markdown, /NATIVE ORIGINAL/u); assert.equal(converted.ocr_contacts, undefined);
        }
        const converted = await convertBuffer(Buffer.from(`😀 Caption ![Literal](data:image/png;base64,${bytes.toString('base64')}) after`), '.md', { contentOptions: options(true) });
        assert.equal(converted.markdown, '😀 Caption Literal after');
        assert.doesNotMatch(diagnostics, /CONVERSION_OCR_(?:STARTING|READY)/u, 'invisible black is not contrasting OCR input');
      }
      const transparent = whiteKeyPng(decodePng(png)), original = decodePng(png), changed = decodePng(transparent);
      assert.deepEqual([changed.width, changed.height], [original.width, original.height]);
      for (let index = 0; index < changed.rgba.length; index += 4) for (let c = 0; c < 3; c++) {
        const a = changed.rgba[index + 3];
        assert.equal(Math.round((changed.rgba[index+c]*a+255*(255-a))/255), original.rgba[index+c]);
      }
      const visible = await convertBuffer(office('docx', [{ ext: 'png', bytes: transparent }]), '.docx', { contentOptions: options(true) });
      assert.match(visible.markdown, /RASTER ORIGINAL/u); assert.ok(visible.ocr_contacts?.length >= 2);
      for (const contact of visible.ocr_contacts) {
        assert.ok(visible.markdown.slice(contact.start, contact.end).length > 0); assert.equal(contact.page, 1);
        if (contact.image) assert.deepEqual([contact.image.source_width, contact.image.source_height], [1500,450]);
      }
    });
    for (const type of ['docx', 'xlsx', 'pptx']) for (const [ext, bytes] of [['png', png], ['jpg', jpg], ['bmp', bmp]]) {
      await check(`${target}: real ${type} ${ext} raster OCR and exact private contact spans`, async () => {
        const source = office(type, [{ ext, bytes }]), before = hash(source);
        const result = await convertBuffer(source, `.${type}`, { contentOptions: options(true) });
        assert.equal(result.source_type, type); assert.equal(result.anonymized, false);
        assert.match(result.markdown, /NATIVE ORIGINAL/u); assert.match(result.markdown, /RASTER ORIGINAL/u);
        assert.doesNotMatch(result.markdown, /data:image|image0|Zusätzlicher|Dokumentinformationen/u);
        assert.match(result.markdown,/### Bildtext · (?:Dokumentabschnitt|Arbeitsblatt|Folie) 1 · Grafik 1/u,'actual reached owner remains identified');
        assert.equal(hash(source), before); assert.ok(result.ocr_contacts?.length >= 2);
        assert.ok(result.ocr_contacts.some(contact => contact.image?.png_base64));
        for (const contact of result.ocr_contacts) {
          assert.equal(contact.page, 1); assert.ok(result.markdown.slice(contact.start, contact.end).length > 0);
          assert.doesNotMatch(result.markdown.slice(contact.start, contact.end), /[\r\n]/u);
        }
      });
    }
    for (const type of ['docx', 'xlsx', 'pptx']) await check(`${target}: actual ${type} table promotion preserves two-image OCR provenance for guided and fast paths`, async () => {
      const { extractSourceForPrivacy } = require(path.join(server, 'core/markdown-first-privacy'));
      const { buildContactDraft, applyContactAnswer } = require(path.join(server, 'core/ocr-contact-review'));
      const { automaticallyRedactOcrContacts } = require(path.join(server, 'gateway/bound-content-input'));
      const bytes = office(type, [{ ext: 'png', bytes: png }, { ext: 'png', bytes: png }], 'internal', true), before = hash(bytes);
      const converted = await convertBuffer(bytes, '.' + type, { contentOptions: options(true) });
      assert.match(converted.markdown, /Spalte 1/u, 'fixture must exercise an actual synthetic table header');
      assert.ok(converted.ocr_contacts?.length >= 4);
      const originalValues = converted.ocr_contacts.map(item => converted.markdown.slice(item.start, item.end));
      assert.ok(originalValues.every(value => value.includes('@') || value.includes('555')), 'actual OCR recognized contact values');
      const result = await extractSourceForPrivacy(bytes, '.' + type, { contentOptions: options(true), convertBuffer: async () => converted });
      assert.doesNotMatch(result.markdown, /Spalte 1/u);
      assert.match(result.markdown, /\| Name \|/u); assert.match(result.markdown, /\| Qvx \|/u);
      assert.deepEqual(result.ocrContacts.map(item => result.markdown.slice(item.start, item.end)), originalValues);
      assert.deepEqual(result.ocrContacts.map(item => [item.page, item.line, item.kind, item.image]),
        converted.ocr_contacts.map(item => [item.page, item.line, item.kind, item.image]));
      const input = { original_text: result.markdown, source_type: type, contacts: result.ocrContacts }, draft = buildContactDraft(input);
      assert.equal(applyContactAnswer(input, { action: 'reviewed', redactions: [], decisions: draft.ambiguities.map(item =>
        ({ ambiguity_id: item.ambiguity_id, decision: 'confirm_contact' })) }), result.markdown);
      const masked = automaticallyRedactOcrContacts(input);
      assert.match(masked.text, /NATIVE ORIGINAL/u); assert.match(masked.text, /Qvx/u);
      assert.doesNotMatch(masked.text, /@|555/u);
      assert.equal((masked.text.match(/\[EMAIL_REDACTED\]/gu) || []).length, 2);
      assert.equal((masked.text.match(/\[PHONE_REDACTED\]/gu) || []).length, 2);
      assert.equal(hash(bytes), before);
    });
    for(const type of ['docx','xlsx','pptx'])await check(`${target}: actual ${type} chartEx plus two images preserves indexed facts and private OCR provenance`,async()=>{
      const fixture=require('./lib/office-chartex-fixtures.cjs'),{readZip}=require('../plugins/data-secure/server/zip-reader');
      const entries=readZip(fixture.source(`.${type}`)),family={docx:'word',xlsx:'xl',pptx:'ppt'}[type];
      const owner={docx:'word/document.xml',xlsx:'xl/drawings/drawing1.xml',pptx:'ppt/slides/slide1.xml'}[type];
      const rel=owner.replace(/\/([^/]+)$/u,'/_rels/$1.rels');
      const shapes=[0,1].map(index=>type==='docx'?`<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="img${index}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`:type==='pptx'?`<p:pic><p:blipFill><a:blip r:embed="img${index}"/></p:blipFill></p:pic>`:`<xdr:absoluteAnchor><xdr:pic><xdr:blipFill><a:blip r:embed="img${index}"/></xdr:blipFill></xdr:pic></xdr:absoluteAnchor>`).join('');
      const close={docx:'</w:body>',xlsx:'</xdr:wsDr>',pptx:'</p:spTree>'}[type];
      entries.set(owner,Buffer.from(entries.get(owner).toString('utf8').replace(close,shapes+close)));
      entries.set(rel,Buffer.from(entries.get(rel).toString('utf8').replace('</Relationships>',[0,1].map(index=>`<Relationship Id="img${index}" Type="${R}/image" Target="${type==='docx'?'':'../'}media/image${index}.png"/>`).join('')+'</Relationships>')));
      entries.set('[Content_Types].xml',Buffer.from(entries.get('[Content_Types].xml').toString('utf8').replace('</Types>',[0,1].map(index=>`<Override PartName="/${family}/media/image${index}.png" ContentType="image/png"/>`).join('')+'</Types>')));
      for(const index of [0,1])entries.set(`${family}/media/image${index}.png`,png);
      const bytes=zipStore([...entries]),before=hash(bytes),result=await convertBuffer(bytes,`.${type}`,{contentOptions:options(true)});
      assert.match(result.markdown,/\| 0 \| North \| 100 \|/u);assert.match(result.markdown,/\| 1 \| South \| 200 \|/u);assert.equal((result.markdown.match(/RASTER ORIGINAL/gu)||[]).length,2);
      assert.deepEqual([...new Set(result.ocr_contacts.map(item=>item.page))],[1,2]);
      for(const contact of result.ocr_contacts)assert.ok(result.markdown.slice(contact.start,contact.end).includes(contact.kind==='email'?'@':'555'));
      const {extractSourceForPrivacy}=require(path.join(server,'core/markdown-first-privacy')),{automaticallyRedactOcrContacts}=require(path.join(server,'gateway/bound-content-input'));
      const privateText=await extractSourceForPrivacy(bytes,`.${type}`,{contentOptions:options(true),convertBuffer:async()=>result});
      const masked=automaticallyRedactOcrContacts({original_text:privateText.markdown,source_type:type,contacts:privateText.ocrContacts});
      assert.doesNotMatch(masked.text,/@|555/u);assert.equal((masked.text.match(/\[EMAIL_REDACTED\]/gu)||[]).length,2);assert.equal((masked.text.match(/\[PHONE_REDACTED\]/gu)||[]).length,2);assert.match(masked.text,/North/u);assert.equal(hash(bytes),before);
    });
    await check(`${target}: two office images retain separate crop coordinates and global Markdown offsets`, async () => {
      const result = await convertBuffer(office('docx', [{ ext: 'png', bytes: png }, { ext: 'png', bytes: png }]), '.docx', { contentOptions: options(true) });
      assert.ok(result.ocr_contacts.some(item => item.page === 1)); assert.ok(result.ocr_contacts.some(item => item.page === 2));
      assert.equal((result.markdown.match(/RASTER ORIGINAL/gu) || []).length, 2);
      for (const contact of result.ocr_contacts) assert.ok(result.markdown.slice(contact.start, contact.end).includes(contact.kind === 'email' ? '@' : '555'));
    });
    for (const type of ['docx','xlsx','pptx']) await check(`${target}: ${type} mixed unsupported and damaged pictures preserve native text and later OCR provenance`, async () => {
      const source = office(type, [{ext:'emf',bytes:Buffer.from('unsupported EMF')},
        {ext:'png',bytes:Buffer.from('damaged PNG')},{ext:'png',bytes:png},
        {ext:'svg',bytes:Buffer.from('<svg/>')},{ext:'png',bytes:png}]);
      const before = hash(source);
      const result = await convertBuffer(source,`.${type}`,{contentOptions:options(true)});
      assert.equal(hash(source),before); assert.match(result.markdown,/NATIVE ORIGINAL/u);
      assert.equal((result.markdown.match(/RASTER ORIGINAL/gu)||[]).length,2);
      for (const code of ['OFFICE_IMAGE_FORMAT_SVG_UNSUPPORTED','IMAGE_CONTENT_DAMAGED'])
        assert.ok(result.coverage.reason_codes.includes(code),code);
      assert.deepEqual([...new Set(result.ocr_contacts.map(item=>item.page))],[3,5]);
      for (const contact of result.ocr_contacts) assert.ok(result.markdown.slice(contact.start,contact.end).includes(contact.kind==='email'?'@':'555'));
      const { extractSourceForPrivacy } = require(path.join(server,'core/markdown-first-privacy'));
      const privateText = await extractSourceForPrivacy(source,`.${type}`,{contentOptions:options(true),convertBuffer:async()=>result});
      assert.equal(privateText.sourceExtractionCoverage.status,'incomplete');
      assert.ok(privateText.sourceExtractionCoverage.reason_codes.includes('IMAGE_CONTENT_DAMAGED'));
      assert.equal(privateText.ocrContacts.length,result.ocr_contacts.length);
    });
    await check(`${target}: completed native Office sections survive the unchanged 8M document budget and reach the checkpoint pipe`, async () => {
      const body = 'N'.repeat(7_900_000), footer = 'F'.repeat(200_000);
      const source = zipStore([...opcControlEntries('docx',{additionalOverrides:[
        {part:'word/footer1.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'}]}),
        ['word/document.xml',`<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p><w:sectPr><w:footerReference w:type="default" r:id="f1"/></w:sectPr></w:body></w:document>`],
        ['word/_rels/document.xml.rels',relations([['f1','footer','footer1.xml']])],
        ['word/footer1.xml',`<w:ftr xmlns:w="${W}"><w:p><w:r><w:t>${footer}</w:t></w:r></w:p></w:ftr>`]
      ]), before = hash(source);
      const result = await convertBuffer(source,'.docx',{contentOptions:options(true)});
      assert.equal(result.markdown.length,body.length); assert.ok(/^N+$/u.test(result.markdown));
      assert.ok(result.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
      assert.equal(result.coverage.status,'incomplete'); assert.equal(result.ocr_contacts,undefined);
      await assert.rejects(convertBuffer(source,'.docx'),{code:'TEXT_TOO_LARGE'});
      assert.equal(hash(source),before);
    });
    await check(`${target}: generated notes never rescue omitted native sections but actual later image text still can`, async () => {
      const make = image => zipStore([...opcControlEntries('pptx'),
        ['ppt/presentation.xml',`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
        ['ppt/_rels/presentation.xml.rels',relations([['s1','slide','slides/slide1.xml']])],
        ['ppt/slides/slide1.xml',`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${'N'.repeat(8_000_000)}</a:t></a:r></a:p></p:txBody></p:sp>${image ? '<p:pic><a:blip r:embed="i1"/></p:pic>' : ''}</p:spTree></p:cSld></p:sld>`],
        ...(image ? [['ppt/slides/_rels/slide1.xml.rels',relations([['i1','image','../media/image1.png']])],
          ['ppt/media/image1.png',image]] : [])
      ]);
      const source = make(png), before = hash(source), opts = { ...options(true),markdownOutput:'notes-v1' };
      await assert.rejects(convertBuffer(source,'.pptx',{contentOptions:{...opts,imageOcr:false}}),{code:'TEXT_TOO_LARGE'});
      const result = await convertBuffer(source,'.pptx',{contentOptions:opts});
      assert.match(result.markdown,/RASTER ORIGINAL/u);
      assert.doesNotMatch(result.markdown,/N{32}|Lokal erkannter Bildtext/u);
      assert.ok(result.coverage.reason_codes.includes('TEXT_LIMIT_PARTIAL'));
      assert.equal(result.coverage.status,'incomplete');
      await assert.rejects(convertBuffer(make(tiny),'.pptx',{contentOptions:opts}),{code:'CONVERSION_OCR_TEXT_EMPTY'});
      await assert.rejects(convertBuffer(make(null),'.pptx',{contentOptions:opts}),{code:'TEXT_TOO_LARGE'});
      assert.equal(hash(source),before);
    });
    await check(`${target}: image-only slides need real OCR text; parser-owned slide labels cannot become successful content`, async () => {
      for (const markdownOutput of ['content-v1','notes-v1']) {
        const opts = {...options(true),markdownOutput};
        const emf = office('pptx',[{ext:'emf',bytes:Buffer.from('unsupported EMF')}],'internal',false,'');
        const before = hash(emf);
        await assert.rejects(convertBuffer(emf,'.pptx',{contentOptions:opts}),{code:'CONVERSION_OCR_TEXT_EMPTY'});
        await assert.rejects(convertBuffer(emf,'.pptx',{contentOptions:{...opts,imageOcr:false}}),{code:'CONVERSION_EXTRACTION_FAILED'});
        await assert.rejects(convertBuffer(office('pptx',[{ext:'png',bytes:tiny}],'internal',false,''),'.pptx',
          {contentOptions:opts}),{code:'CONVERSION_OCR_TEXT_EMPTY'});
        const result = await convertBuffer(office('pptx',[{ext:'png',bytes:png}],'internal',false,''),'.pptx',{contentOptions:opts});
        assert.match(result.markdown,/RASTER ORIGINAL/u);
        assert.doesNotMatch(result.markdown,/# Folie/u);
        assert.ok(result.ocr_contacts?.length);
        assert.equal(hash(emf),before);
      }
    });
    await check(`${target}: disabled Office OCR and unsafe relationships never start Tesseract`, async () => {
      diagnostics = '';
      for (const type of ['docx', 'xlsx', 'pptx']) {
        const result = await convertBuffer(office(type, [{ ext: 'png', bytes: png }]), `.${type}`, { contentOptions: options(false) });
        assert.match(result.markdown, /NATIVE ORIGINAL/u); assert.doesNotMatch(result.markdown, /RASTER ORIGINAL/u);
        const orphan = await convertBuffer(office(type, [{ ext: 'png', bytes: png }], 'orphan'), `.${type}`, { contentOptions: options(true) });
        assert.doesNotMatch(orphan.markdown, /RASTER ORIGINAL/u);
      }
      const partial = await convertBuffer(office('docx', [{ ext: 'svg', bytes: Buffer.from('<svg/>') }]), '.docx', { contentOptions: options(true) });
      assert.match(partial.markdown, /NATIVE ORIGINAL/u);
      assert.ok(partial.coverage.reason_codes.includes('OFFICE_IMAGE_FORMAT_SVG_UNSUPPORTED'));
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
