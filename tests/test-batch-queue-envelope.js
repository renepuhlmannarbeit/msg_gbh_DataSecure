'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createSuite } = require('./helpers');
const {
  LOCAL_QUEUE_SCHEMA_INVALID,
  validateBatchQueueEnvelope
} = require('../plugins/data-secure/server/gateway/batch-queue-envelope');

const { test, assert, done } = createSuite('Batch queue envelope');
const source = path.resolve(__dirname, 'private-source.txt');
const valid = () => [{
  name: path.basename(source), full: source, sourceBytes: 12, sourceLabel: 'folder/private-source.txt'
}];

function rejects(queue) {
  assert.throws(() => validateBatchQueueEnvelope(queue), (error) =>
    error.code === LOCAL_QUEUE_SCHEMA_INVALID && error.message === LOCAL_QUEUE_SCHEMA_INVALID);
}

test('the real normalized queue shape is accepted without touching the source', () => {
  const queue = valid();
  assert.strictEqual(validateBatchQueueEnvelope(queue), queue);
});

test('malformed or ambiguous envelopes fail before worker acknowledgement', () => {
  rejects([]);
  rejects([{ sourcePath: source, sourceBytes: 12 }]);
  rejects([{ ...valid()[0], full: 'relative.txt' }]);
  rejects([{ ...valid()[0], name: 'different.txt' }]);
  rejects([{ ...valid()[0], sourceBytes: 0 }]);
  rejects([{ ...valid()[0], sourceLabel: '../private-source.txt' }]);
  rejects([valid()[0], valid()[0]]);
});

test('the queue limits are enforced before private IPC', () => {
  rejects(Array.from({ length: 101 }, (_, index) => ({
    name: `file-${index}.txt`, full: path.resolve(__dirname, `file-${index}.txt`),
    sourceBytes: 1, sourceLabel: `file-${index}.txt`
  })));
  rejects([{ ...valid()[0], sourceBytes: 500 * 1024 * 1024 + 1 }]);
});

test('product tests cannot replace the picker adapter with an identity mock', () => {
  const testRoot = __dirname;
  const sourceText = fs.readdirSync(testRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.m?js$/u.test(entry.name) && entry.name !== path.basename(__filename))
    .map((entry) => fs.readFileSync(path.join(testRoot, entry.name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(sourceText,
    /batchQueueFromSelection\s*(?::|=)\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*\1\b/u,
    'an identity mock would hide descriptor-to-queue schema drift');
});

done();
