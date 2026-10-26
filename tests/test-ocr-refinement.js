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
const lines = data => data.blocks[0].paragraphs[0].lines;
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function assertPrimary(result, data, before) {
  assert.equal(JSON.stringify(data), before, 'source OCR data must not be mutated');
  assert.equal(result.text, data.text, 'the full primary text is byte-for-byte retained');
  assert.equal(lines(result).length, lines(data).length);
  for (let index = 0; index < lines(data).length; index++) {
    const actual = lines(result)[index], original = lines(data)[index];
    assert.equal(actual.text, original.text);
    assert.equal(actual.bbox, original.bbox, 'the original line box remains attached');
    assert.equal(actual.words, original.words, 'word text, original scores and pixel boxes remain attached');
  }
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
test('ordinary rereads retain the existing pass, crop and total-pixel bounds', () => {
  const data = source(Array(100).fill('Service Level'));
  assert.equal(refinementPlan(data, 500, 5000).length, 32);
  for (const line of lines(data)) line.bbox.x1 = 4000;
  const plan = refinementPlan(data, 4100, 5000);
  const pixels = entry => (entry.box.x1 - entry.box.x0 + 24) * (entry.box.y1 - entry.box.y0 + 24);
  assert.equal(plan.length, 11);
  assert.ok(plan.every(entry => pixels(entry) <= 200000));
  assert.ok(plan.reduce((sum, entry) => sum + pixels(entry), 0) <= 2000000);
  assert.ok(plan.reduce((sum, entry) => sum + pixels(entry), 0) + pixels(plan[0]) > 2000000);
  for (const line of lines(data)) line.bbox.x1 = 5000;
  assert.deepEqual(refinementPlan(data, 5100, 5000), []);
});
test('only explicit contactOnly true filters ordinary entries before they can consume contact budgets', () => {
  const data = source([...Array(40).fill('Service Level'), 'Kontakt: qa12@quality.example.invalid']);
  assert.equal(refinementPlan(data, 500, 2000).length, 32);
  const contacts = refinementPlan(data, 500, 2000, { contactOnly: true });
  assert.equal(contacts.length, 1); assert.equal(contacts[0].contact, true);
  assert.equal(contacts[0].start, data.text.indexOf('Kontakt:'));
  assert.deepEqual(contacts[0].margins, [8, 12]);
  const ordinary = source(['Service Level']);
  for (const options of [undefined, null, {}, true, { contactOnly: false }, { contactOnly: 1 }, { contactOnly: 'true' }]) {
    assert.equal(refinementPlan(ordinary, 500, 200, options).length, 1);
  }
  assert.deepEqual(refinementPlan(ordinary, 500, 200, { contactOnly: true }), []);
  const manyContacts = refinementPlan(source(Array(100).fill('Kontakt: qa12@quality.example.invalid')), 500, 5000, { contactOnly: true });
  assert.equal(manyContacts.length, 16);
  assert.ok(manyContacts.every(entry => entry.contact && entry.margins.length === 2));
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
test('ordinary exact or spacing-only agreement always returns original primary bytes', () => {
  const entry = { contact: false, target: 'Service  Level' };
  assert.equal(refinedValue(entry, ['Service  Level\n']), entry.target);
  assert.equal(refinedValue(entry, ['Service Level']), entry.target);
  assert.equal(refinedValue(entry, ['Service\tLevel']), entry.target);
  assert.equal(refinedValue(entry, ['ServiceLevel']), null);
  assert.equal(refinedValue(entry, ['Service\u00a0Level']), null);
});
for (const [label, primary, alternate] of [
  ['one changed digit', 'Datum 14.05.2030', 'Datum 19.05.2030'],
  ['same-count role spelling', 'Rolle Risikoprüfer', 'Rolle Innendienst'],
  ['an apparently better alternate', 'Service Leve1', 'Service Level'],
  ['a good fragment mixed with a changed number', 'Status-Marke 14.05.2030', 'Status-Marker 19.05.2030'],
  ['case', 'Name Musterwert', 'Name musterwert'],
  ['German characters', 'Straße Größe', 'Strasse Groesse'],
  ['canonical Unicode spelling', 'Name Andre\u0301', 'Name André'],
  ['amount punctuation', 'Wert 1.234,56', 'Wert 1234.56'],
  ['a word boundary', 'Karl Heinz', 'KarlHeinz'],
  ['punctuation only', 'Service Level.', 'Service Level'],
]) test(`crop ${label} cannot gain lexical replacement authority`, () => {
  assert.equal(refinedValue({ contact: false, target: primary }, [alternate]), null);
});
test('empty, multiline, overlong or differently shaped crop responses cannot replace text', () => {
  const entry = { contact: false, target: 'Service Level' };
  for (const readings of [[], [''], [null], ['\n'], ['Service\nLevel'], ['x'.repeat(241)],
    ['Service Level', 'Service Level'], ['Service Level More']]) assert.equal(refinedValue(entry, readings), null);
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
    assert.equal(lines(result)[0].reading_disagreement, true);
    assert.equal(lines(result)[0].contact_disagreement, true);
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
    assert.equal(lines(result)[0].reading_disagreement, true);
    assert.deepEqual(contactQuality(result, result.text).disagreement_lines, [1]);
  });
  await testAsync('matching primary or spacing-only crop keeps the exact data object and no disagreement', async () => {
    for (const reading of ['Service  Level\n', 'Service Level\n']) {
      const data = freeze(source(['Service  Level'])), before = JSON.stringify(data), parameters = [];
      const worker = { setParameters: async value => parameters.push(value), recognize: async () => ({ data: { text: reading } }) };
      const result = await refineOcr(data, canvas, worker, createCanvas);
      assert.equal(result, data); assertPrimary(result, data, before);
      assert.equal(lines(result)[0].reading_disagreement, undefined);
      assert.deepEqual(parameters, [{ tessedit_pageseg_mode: '7' }, { tessedit_pageseg_mode: '6' }]);
    }
  });
  await testAsync('matching contact crops preserve original text, words and unverified quality without a new disagreement', async () => {
    const data = freeze(source()), before = JSON.stringify(data); let calls = 0;
    const worker = { setParameters: async () => {}, recognize: async () => { calls++; return { data: { text: 'qa12@quality.example.invalid\n' } }; } };
    const result = await refineOcr(data, canvas, worker, createCanvas);
    assert.equal(calls, 2); assert.equal(result, data); assertPrimary(result, data, before);
    assert.equal(lines(result)[0].reading_disagreement, undefined);
    assert.equal(lines(result)[0].contact_disagreement, undefined);
    assert.deepEqual(contactQuality(result, result.text).contact_lines, [1]);
  });
  await testAsync('contact-only work keeps both eligible contact crops and cannot fabricate an ordinary disagreement', async () => {
    for (const disagreement of [false, true]) {
      const data = freeze(source(['Service Level', 'Kontakt: qa12@quality.example.invalid'])), before = JSON.stringify(data);
      const parameters = []; let calls = 0;
      const worker = { setParameters: async value => parameters.push(value), recognize: async () => {
        calls++; return { data: { text: disagreement ? 'ga12@quality.example.invalid\n' : 'qa12@quality.example.invalid\n' } };
      } };
      const result = await refineOcr(data, canvas, worker, createCanvas, { contactOnly: true });
      assert.equal(calls, 2); assertPrimary(result, data, before);
      assert.equal(lines(result)[0], lines(data)[0]);
      assert.equal(lines(result)[0].reading_disagreement, undefined);
      assert.equal(lines(result)[1].reading_disagreement, disagreement ? true : undefined);
      assert.equal(lines(result)[1].contact_disagreement, disagreement ? true : undefined);
      assert.deepEqual(parameters, [{ tessedit_pageseg_mode: '7' }, { tessedit_pageseg_mode: '6' }]);
    }
  });
  await testAsync('contact-only no-contact work neither starts crops nor reports agreement or disagreement', async () => {
    const data = freeze(source(['Service Level'])), before = JSON.stringify(data);
    const worker = { setParameters: async () => { throw new Error('unexpected parameter change'); },
      recognize: async () => { throw new Error('unexpected crop recognition'); } };
    const result = await refineOcr(data, canvas, worker, () => { throw new Error('unexpected crop'); }, { contactOnly: true });
    assert.equal(result, data); assertPrimary(result, data, before);
    assert.equal(lines(result)[0].reading_disagreement, undefined);
  });
  await testAsync('undefined and nontrue options preserve default ordinary consistency rereads', async () => {
    for (const options of [undefined, null, {}, true, { contactOnly: false }, { contactOnly: 1 }, { contactOnly: 'true' }]) {
      const data = freeze(source(['Service Level'])), before = JSON.stringify(data); let calls = 0;
      const worker = { setParameters: async () => {}, recognize: async () => { calls++; return { data: { text: 'Service Leve1\n' } }; } };
      const result = await refineOcr(data, canvas, worker, createCanvas, options);
      assert.equal(calls, 1); assertPrimary(result, data, before); assert.equal(lines(result)[0].reading_disagreement, true);
    }
  });
  await testAsync('ordinary changed readings preserve all primary metadata and add only a disagreement flag', async () => {
    for (const [primary, reading, score] of [
      ['Datum 14.05.2030', 'Datum 19.05.2030\n', 91],
      ['Rolle Risikoprüfer', 'Rolle Innendienst\n', 8],
      ['Service Leve1', 'Service Level\n', 90],
      ['Straße Größe', 'Strasse Groesse\n', 90],
      ['😀 Name Andre\u0301', '😀 Name André\n', 90],
    ]) {
      const data = source([primary]); lines(data)[0].text += '\n';
      for (const word of lines(data)[0].words) word.confidence = score;
      freeze(data); const before = JSON.stringify(data);
      const worker = { setParameters: async () => {}, recognize: async () => ({ data: { text: reading, confidence: 100 } }) };
      const result = await refineOcr(data, canvas, worker, createCanvas);
      assertPrimary(result, data, before);
      assert.deepEqual(lines(result)[0], { ...lines(data)[0], reading_disagreement: true });
      assert.equal(result.text.includes(reading.trim()), false);
      assert.equal(lines(result)[0].contact_disagreement, undefined);
    }
  });
  await testAsync('repeated primary lines retain UTF-16 and CRLF positions and flag only the actual differing occurrence', async () => {
    const data = source(['Service Level', 'Service Level']);
    data.text = '😀 Header\r\nService Level\r\nService Level\r';
    const plan = refinementPlan(data, canvas.width, canvas.height);
    assert.equal(plan[0].start, data.text.indexOf('Service Level'));
    assert.equal(plan[1].start, data.text.lastIndexOf('Service Level'));
    freeze(data); const before = JSON.stringify(data); let calls = 0;
    const worker = { setParameters: async () => {}, recognize: async () => ({ data: { text: ++calls === 1 ? 'Service Level\n' : 'Service Leve1\n' } }) };
    const result = await refineOcr(data, canvas, worker, createCanvas);
    assert.equal(calls, 2); assertPrimary(result, data, before);
    assert.equal(lines(result)[0], lines(data)[0]);
    assert.deepEqual(lines(result)[1], { ...lines(data)[1], reading_disagreement: true });
    assert.equal(refinementPlan(result, canvas.width, canvas.height)[1].start, plan[1].start);
  });
  await testAsync('noncomparable crop text is retained as a disagreement instead of replacing or erasing primary words', async () => {
    for (const reading of ['', 'Service\nLevel\n', 'x'.repeat(241), 'Service Level More']) {
      const data = freeze(source(['Service Level'])), before = JSON.stringify(data);
      const worker = { setParameters: async () => {}, recognize: async () => ({ data: { text: reading } }) };
      const result = await refineOcr(data, canvas, worker, createCanvas);
      assertPrimary(result, data, before); assert.equal(lines(result)[0].reading_disagreement, true);
    }
  });
  await testAsync('high-score and unbound primary lines start no reread and fabricate no disagreement', async () => {
    for (const unbound of [false, true]) {
      const data = source(['Service Level']);
      if (unbound) data.text = 'A different primary page\n';
      else for (const word of lines(data)[0].words) word.confidence = 99;
      freeze(data); const before = JSON.stringify(data);
      const worker = { setParameters: async () => { throw new Error('unexpected parameters'); }, recognize: async () => { throw new Error('unexpected reread'); } };
      const result = await refineOcr(data, canvas, worker, () => { throw new Error('unexpected crop'); });
      assert.equal(result, data); assertPrimary(result, data, before);
      assert.equal(lines(result)[0].reading_disagreement, undefined);
    }
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
  await testAsync('cancelled or malformed crop OCR remains a failure and releases crops with PSM restored', async () => {
    for (const mode of ['cancel', 'malformed']) {
      const failure = Object.assign(new Error('cancelled'), { code: 'CONVERSION_CANCELLED' });
      const parameters = [], data = freeze(source(['Service Level'])), before = JSON.stringify(data);
      const worker = { setParameters: async value => parameters.push(value), recognize: async () => {
        if (mode === 'cancel') throw failure;
        return { data: { text: 123 } };
      } };
      await assert.rejects(refineOcr(data, canvas, worker, createCanvas), cause => mode === 'cancel'
        ? cause === failure : cause.code === 'CONVERSION_OCR_FAILED');
      assert.equal(JSON.stringify(data), before);
      assert.deepEqual(parameters.at(-1), { tessedit_pageseg_mode: '6' });
      assert.ok(crops.every(crop => crop.width === 1 && crop.height === 1));
    }
  });
  await testAsync('crop construction or initial PSM failure still restores the existing worker mode', async () => {
    for (const mode of ['crop', 'parameter']) {
      const failure = new Error(mode), parameters = [];
      const worker = { setParameters: async value => { parameters.push(value); if (mode === 'parameter' && value.tessedit_pageseg_mode === '7') throw failure; },
        recognize: async () => { throw new Error('unexpected OCR'); } };
      await assert.rejects(refineOcr(source(['Service Level']), canvas, worker, () => { throw failure; }), cause => cause === failure);
      assert.deepEqual(parameters, [{ tessedit_pageseg_mode: '7' }, { tessedit_pageseg_mode: '6' }]);
    }
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(done);
