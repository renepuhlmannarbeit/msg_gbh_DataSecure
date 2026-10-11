import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { hocrChoiceGroups } from '../scripts/lib/hocr-choice-groups.mjs';
const group = text => `<span class='ocrx_cinfo' id='lstm_choices_1'>${text}</span>`;
const choice = text => `<span class='ocrx_cinfo' id='choice_1' title='x_confs 88'>${text}</span>`;
assert.deepEqual(hocrChoiceGroups(`<div>${group(`${choice('q')}\n${choice('g')}`)}${group(choice('&amp;'))}</div>`), [['q', 'g'], ['&']]);
assert.deepEqual(hocrChoiceGroups(group(choice('&#xFC;'))), [['ü']]);
assert.deepEqual(hocrChoiceGroups(group(choice('&amp;#65;'))), [['&#65;']], 'Decode exactly one entity layer');
assert.deepEqual(hocrChoiceGroups(group(choice('&#1114112;'))), [['&#1114112;']]);
assert.deepEqual(hocrChoiceGroups(group(choice('&#55296;'))), [['&#55296;']]);
assert.deepEqual(hocrChoiceGroups(group(choice('A')).replaceAll("'", '"')), [['A']]);
assert.deepEqual(hocrChoiceGroups(group(choice('x')).slice(0, -7)), [], 'Unclosed groups are not evidence');
assert.deepEqual(hocrChoiceGroups(choice('x')), [], 'No alternatives outside a choice group');
assert.throws(() => hocrChoiceGroups('<span>'.repeat(129)), /HOCR_DIAGNOSTIC_LIMIT/u);
assert.throws(() => hocrChoiceGroups('x'.repeat(16 * 1024 * 1024 + 1)), /HOCR_DIAGNOSTIC_LIMIT/u);
// Run the malformed nested counterexample in its own bounded process. The old
// regex already exceeded a second at ~1.8 KiB; this 1 MiB case must settle.
const parserUrl = new URL('../scripts/lib/hocr-choice-groups.mjs', import.meta.url).href;
const probe = spawnSync(process.execPath, ['--input-type=module', '-e',
  `import { hocrChoiceGroups } from ${JSON.stringify(parserUrl)};
   const prefix = "<span class='ocrx_cinfo' id='lstm_choices_1'>";
   const child = "<span class='ocrx_cinfo' id='choice_1' title='x_confs 88'>x</span>";
   const result = hocrChoiceGroups(prefix + child.repeat(16000));
   if (result.length) process.exit(1);`], { timeout: 5000, windowsHide: true, encoding: 'utf8' });
assert.equal(probe.error, undefined, probe.error?.message);
assert.equal(probe.status, 0, probe.stderr);
console.log('Engineering hOCR parser: exact alternatives, one-layer decoding, bounds and isolated malformed-input regression PASS');
