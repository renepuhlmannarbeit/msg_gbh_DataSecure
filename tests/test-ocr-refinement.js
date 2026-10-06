'use strict';
const { createSuite } = require('./helpers');
const { refinementPlan, refinedValue, refineOcr } = require('../plugins/data-secure/server/standalone/ocr-refinement');
const { contactQuality, qualityNotice } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { test, testAsync, done, assert } = createSuite('Bounded OCR geometric re-segmentation (unit contracts)');
function source(texts = ['Kontakt: qa12@quality.example.invalid']) {
  return { text: texts.join('\n') + '\n', blocks: [{ paragraphs: [{ lines: texts.map((text, index) => ({ text,
    bbox: { x0: 5, y0: 10 + index * 40, x1: 400, y1: 30 + index * 40 },
    words: text.split(' ').map((word, wordIndex) => ({ text: word, confidence: 90,
      bbox: { x0: 5 + wordIndex * 90, y0: 10 + index * 40, x1: 85 + wordIndex * 90, y1: 30 + index * 40 } }))
  })) }] }] };
}
test('repeated text is tied to separate exact page occurrences, not globally replaced', () => {
  const data = source(['Service Level', 'Service Level']);
  const plan = refinementPlan(data, 500, 200);
  assert.equal(plan.length, 2); assert.equal(plan[0].start, 0); assert.equal(plan[1].start, 14);
  assert.deepEqual(plan[0].margins, [12]);
});
test('contact words use the original word box, not their label, and two bounded passes', () => {
  const data = source(), plan = refinementPlan(data, 500, 200);
  assert.equal(plan.length, 1); assert.deepEqual(plan[0].margins, [8, 12]);
  assert.deepEqual(plan[0].box, data.blocks[0].paragraphs[0].lines[0].words[1].bbox);
  assert.equal(plan[0].offset, 9);
  const phone = source(['Telefon: +49 30 555 1011']);
  assert.deepEqual(refinementPlan(phone, 500, 200), []);
});
test('page confidence, malformed boxes, overlapping neighbours and excessive crops cannot bypass bounds', () => {
  const data = source(['Service Level']); data.confidence = 1;
  for (const word of data.blocks[0].paragraphs[0].lines[0].words) word.confidence = 99;
  assert.deepEqual(refinementPlan(data, 500, 200), []);
  data.blocks[0].paragraphs[0].lines[0].bbox.x1 = 501;
  assert.deepEqual(refinementPlan(data, 500, 200), []);
  data.blocks[0].paragraphs[0].lines[0].bbox.x1 = 100000;
  assert.deepEqual(refinementPlan(data, 100000, 200), []);
  const contact = source(), line = contact.blocks[0].paragraphs[0].lines[0];
  line.words[0].bbox.x1 = 100;
  assert.deepEqual(refinementPlan(contact, 500, 200), []);
});
test('extra recognition count stays bounded even for many contact lines', () => {
  const data = source(Array(100).fill('Kontakt: qa12@quality.example.invalid'));
  assert.equal(refinementPlan(data, 500, 5000).length, 16);
});
test('consensus is never guessed from different readings or malformed/multiline contact output', () => {
  const entry = refinementPlan(source(), 500, 200)[0];
  assert.equal(refinedValue(entry, ['qa12@quality.example.invalid\n', 'qa12@quality.example.invalid\n']), entry.target);
  assert.equal(refinedValue(entry, ['ga12@quality.example.invalid', 'qa12@quality.example.invalid']), null);
  assert.equal(refinedValue(entry, ['ga12@quality.example.invalid', 'ga12@quality.example.invalid']), null,
    'two matching alternate readings do not establish correctness');
  assert.equal(refinedValue(entry, ['extra qa12@quality.example.invalid', 'extra qa12@quality.example.invalid']), null);
  assert.equal(refinedValue(entry, ['qa12 quality example invalid', 'qa12 quality example invalid']), null);
  const ordinary = refinementPlan(source(['Service Level']), 500, 200)[0];
  assert.equal(refinedValue(ordinary, ['Service\nLevel']), null);
  assert.equal(refinedValue(ordinary, ['Service Level More']), null);
});
async function main() {
  const canvas = { width: 500, height: 200 }, crops = [];
  const createCanvas = (width, height) => {
    const crop = { width, height, getContext: () => ({ fillRect() {}, drawImage() {} }), toBuffer: () => Buffer.alloc(1) };
    crops.push(crop); return crop;
  };
  await testAsync('matching alternate contacts retain the page surface and report uncertainty without touching original data', async () => {
    const data = source(); data.blocks[0].paragraphs[0].lines[0].words[1].confidence = 53;
    const before = JSON.stringify(data), parameters = [];
    const worker = { setParameters: async value => parameters.push(value), recognize: async () => ({ data: { text: 'ga12@quality.example.invalid\n' } }) };
    const result = await refineOcr(data, canvas, worker, createCanvas);
    assert.equal(JSON.stringify(data), before);
    assert.equal(result.text, data.text);
    const quality = contactQuality(result, result.text);
    assert.deepEqual(quality.disagreement_lines, [1]); assert.deepEqual(quality.low_confidence_lines, [1]);
    assert.match(qualityNotice(quality), /abweichende Lesarten/u);
    assert.doesNotMatch(qualityNotice(quality), /ga12|qa12|quality.example/u);
    assert.deepEqual(parameters, [{ tessedit_pageseg_mode: '7' }, { tessedit_pageseg_mode: '6' }]);
    assert.ok(crops.every(crop => crop.width === 1 && crop.height === 1));
  });
  await testAsync('two conflicting contact readings retain the initial surface and report uncertainty', async () => {
    const data = source(); let calls = 0;
    const worker = { setParameters: async () => {}, recognize: async () => ({ data: { text: ++calls === 1
      ? 'qa12@quality.example.invalid' : 'ga12@quality.example.invalid' } }) };
    const result = await refineOcr(data, canvas, worker, createCanvas);
    assert.equal(result.text, data.text);
    assert.deepEqual(contactQuality(result, result.text).disagreement_lines, [1]);
  });
  await testAsync('inconsistent word/line contact metadata never inserts an absent address or starts a crop', async () => {
    const data = source(['Kontakt: original@example.invalid']);
    data.blocks[0].paragraphs[0].lines[0].words[1].text = 'different@example.invalid';
    const before = JSON.stringify(data);
    assert.deepEqual(refinementPlan(data, 500, 200), []);
    const worker = { setParameters: async () => { throw new Error('unexpected parameter change'); },
      recognize: async () => { throw new Error('unexpected recognition'); } };
    const result = await refineOcr(data, canvas, worker, () => { throw new Error('unexpected crop'); });
    assert.equal(result.text, data.text); assert.equal(JSON.stringify(data), before);
    assert.deepEqual(contactQuality(result, result.text).contact_lines, [1]);
    assert.doesNotMatch(result.text, /different@example/u);
  });
  await testAsync('failed OCR frees the owned crop and restores page parameters instead of silently passing', async () => {
    const parameters = [];
    const worker = { setParameters: async value => parameters.push(value), recognize: async () => { throw new Error('OCR failed'); } };
    await assert.rejects(refineOcr(source(), canvas, worker, createCanvas), /OCR failed/u);
    assert.deepEqual(parameters.at(-1), { tessedit_pageseg_mode: '6' });
    assert.ok(crops.every(crop => crop.width === 1 && crop.height === 1));
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(done);
