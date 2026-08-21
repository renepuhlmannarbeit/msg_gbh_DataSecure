'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { createSuite } = require('./helpers');
const { SafeError, convertDocument, validateParserResult } = require('../plugins/data-secure/server/runtime');

const { testAsync, test, done, assert } = createSuite('Isolated parser process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-parser-isolation-'));

function source(name = 'private-customer-name.txt') {
  const file = path.join(root, name);
  fs.writeFileSync(file, 'sensitive marker');
  return file;
}

function fakeChild(action) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  queueMicrotask(() => action(child));
  return child;
}

async function main() {
  await testAsync('worker receives the source only as inherited fd and starts with restrictive flags', async () => {
    const file = source();
    let invocation;
    const result = await convertDocument(file, {
      spawn(command, args, options) {
        invocation = { command, args, options };
        return fakeChild((child) => {
          child.stdout.end(JSON.stringify({
            schema: 'data-secure-parser-result/1', ok: true,
            result: { markdown: 'safe', attachments: [], warnings: [] }
          }));
          child.emit('close', 0);
        });
      }
    });
    assert.strictEqual(result.markdown, 'safe');
    assert.ok(invocation.args.includes('--permission'));
    assert.ok(invocation.args.includes('--disable-proto=throw'));
    assert.strictEqual(invocation.options.shell, false);
    assert.deepStrictEqual(invocation.options.env, {});
    assert.strictEqual(typeof invocation.options.stdio[3], 'number');
    assert.doesNotMatch(JSON.stringify(invocation), /private-customer-name|sensitive marker/i);
  });

  await testAsync('hung parser is terminated at the deadline and returns a fixed SafeError', async () => {
    let child;
    await assert.rejects(
      convertDocument(source('timeout.txt'), { timeoutMs: 5, spawn: () => (child = fakeChild(() => {})) }),
      (error) => error instanceof SafeError && /Zeitlimit/.test(error.message)
    );
    assert.strictEqual(child.killed, true);
  });

  await testAsync('malformed or multiple worker output fails closed', async () => {
    await assert.rejects(convertDocument(source('malformed.txt'), {
      spawn: () => fakeChild((child) => {
        child.stdout.end('{not-json}\n{"raw":"sensitive marker"}');
        child.emit('close', 0);
      })
    }), (error) => error instanceof SafeError && !/sensitive marker/.test(error.message));
  });

  test('worker result validator rejects oversized or structurally forged assets', () => {
    assert.throws(() => validateParserResult({
      markdown: 'safe', warnings: [],
      attachments: [{ type: 'image', mimeType: 'image/png', data: 'AAAA', name: 'x', extension: 'png', source_part: 'x', extra: true }]
    }), /Asset/);
    assert.throws(() => validateParserResult({ markdown: 'x'.repeat(20_000_001), attachments: [], warnings: [] }), /gültiges Ergebnis/);
  });

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  done();
}

main();
