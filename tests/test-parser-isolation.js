'use strict';

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');
const { SafeError, convertDocument, validateParserResult, nativeParserStatus } = require('../plugins/data-secure/server/runtime');

const { testAsync, test, done, assert } = createSuite('Isolated parser process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-parser-isolation-'));
const launcherBytes = Buffer.alloc(512);
launcherBytes.writeUInt16LE(0x5a4d, 0);
launcherBytes.writeUInt32LE(0x80, 0x3c);
launcherBytes.write('PE\0\0', 0x80, 'ascii');
launcherBytes.writeUInt16LE(0x8664, 0x84);
const nativeOptions = {
  platform: 'win32', arch: 'x64', launcherPath: process.execPath,
  launcherBytes,
  launcherExpectedSha256: crypto.createHash('sha256').update(launcherBytes).digest('hex')
};

function source(name = 'private-customer-name.txt') {
  const file = path.join(root, name);
  fs.writeFileSync(file, 'sensitive marker');
  return file;
}

function fakeChild(action) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)); return true; };
  queueMicrotask(() => action(child));
  return child;
}

async function main() {
  await testAsync('renamed PDFs are blocked from text parsers before any worker starts', async () => {
    let spawned = 0;
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF', 'ascii');
    for (const extension of ['txt', 'md', 'csv']) {
      const file = path.join(root, `renamed.${extension}`);
      fs.writeFileSync(file, pdf);
      await assert.rejects(
        () => convertDocument(file, { ...nativeOptions, spawn() { spawned++; throw new Error('must not run'); } }),
        (error) => error instanceof SafeError && error.code === 'PDF_COVERAGE_UNVERIFIED'
      );
    }
    for (const offset of [900, 1019, 1020, 1023]) {
      const leadingJunk = path.join(root, `leading-junk-${offset}.txt`);
      fs.writeFileSync(leadingJunk, Buffer.concat([Buffer.alloc(offset, 0x20), pdf]));
      await assert.rejects(
        () => convertDocument(leadingJunk, { ...nativeOptions, spawn() { spawned++; throw new Error('must not run'); } }),
        (error) => error instanceof SafeError && error.code === 'PDF_COVERAGE_UNVERIFIED'
      );
    }
    assert.strictEqual(spawned, 0);

    const lateMention = path.join(root, 'late-pdf-mention.txt');
    // Offset 1024 is outside the PDF header contract and may be ordinary text.
    fs.writeFileSync(lateMention, `${'A'.repeat(1024)}%PDF- wird hier nur dokumentiert.`);
    const result = await convertDocument(lateMention, {
      ...nativeOptions,
      spawn() {
        spawned++;
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
    assert.strictEqual(spawned, 1);
  });

  test('the packaged parser worker has no direct PDF implementation', () => {
    const worker = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'parser-worker.js');
    const result = childProcess.spawnSync(process.execPath, [
      '--permission', `--allow-fs-read=${path.dirname(worker)}`, '--disable-proto=throw', worker, '.pdf', '0'
    ], {
      input: Buffer.from('%PDF-1.4\n%%EOF', 'ascii'), encoding: 'utf8', env: {}, windowsHide: true
    });
    const response = JSON.parse(result.stdout);
    assert.strictEqual(result.status, 2);
    assert.deepStrictEqual(response, { schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' });
  });

  await testAsync('Windows worker starts only through the native launcher with inherited stdin', async () => {
    const file = source();
    let invocation;
    const result = await convertDocument(file, {
      ...nativeOptions,
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
    assert.strictEqual(invocation.command, process.execPath);
    assert.deepStrictEqual(invocation.args.slice(0, 8), [
      '--memory-mib', '768', '--cpu-ms', '40000', '--wall-ms', '45000', '--', process.execPath
    ]);
    assert.ok(invocation.args.includes('--permission'));
    assert.ok(invocation.args.includes('--disable-proto=throw'));
    assert.strictEqual(invocation.args.at(-1), '0');
    assert.strictEqual(invocation.options.shell, false);
    assert.deepStrictEqual(invocation.options.env, {});
    assert.strictEqual(typeof invocation.options.stdio[0], 'number');
    assert.strictEqual(invocation.options.stdio.length, 3);
    assert.doesNotMatch(JSON.stringify(invocation), /private-customer-name|sensitive marker/i);
  });

  await testAsync('Windows never falls back when the native launcher is missing', async () => {
    let spawned = false;
    await assert.rejects(convertDocument(source('missing-launcher.txt'), {
      ...nativeOptions, launcherPath: 'C:\\missing\\datasecure-sandbox.exe',
      existsSync: () => false,
      spawn() { spawned = true; throw new Error('must not run'); }
    }), (error) => error instanceof SafeError && /Parserbegrenzung/.test(error.message));
    assert.strictEqual(spawned, false);
    await assert.rejects(convertDocument(source('unsupported-arch.txt'), {
      ...nativeOptions, arch: 'arm64',
      spawn() { spawned = true; throw new Error('must not run'); }
    }), (error) => error instanceof SafeError && error.code === 'PARSER_ISOLATION_FAILED');
    assert.strictEqual(spawned, false);
  });

  await testAsync('Windows never starts a launcher whose checksum is wrong', async () => {
    let spawned = false;
    await assert.rejects(convertDocument(source('corrupt-launcher.txt'), {
      ...nativeOptions,
      launcherExpectedSha256: '0'.repeat(64),
      spawn() { spawned = true; throw new Error('must not run'); }
    }), (error) => error instanceof SafeError && error.code === 'PARSER_ISOLATION_FAILED' && /beschädigt/.test(error.message));
    assert.strictEqual(spawned, false);
  });

  await testAsync('unsupported platforms and matching non-PE launchers fail closed before spawn', async () => {
    let spawned = false;
    await assert.rejects(convertDocument(source('unsupported-platform.txt'), {
      ...nativeOptions, platform: 'linux',
      spawn() { spawned = true; throw new Error('must not run'); }
    }), (error) => error instanceof SafeError && error.code === 'PARSER_ISOLATION_FAILED');
    const notPe = Buffer.from('matching but not a PE executable');
    await assert.rejects(convertDocument(source('not-pe.txt'), {
      ...nativeOptions, launcherBytes: notPe,
      launcherExpectedSha256: crypto.createHash('sha256').update(notPe).digest('hex'),
      spawn() { spawned = true; throw new Error('must not run'); }
    }), (error) => error instanceof SafeError && error.code === 'PARSER_ISOLATION_FAILED' && /x64-Format/.test(error.message));
    assert.strictEqual(spawned, false);
  });

  test('status probes the native host and blocks x64 emulation on ARM64', () => {
    assert.deepStrictEqual(nativeParserStatus({ ...nativeOptions, hostProbeStatus: 126 }), {
      available: false, mode: 'unavailable', reason: 'unsupported_host_architecture'
    });
    assert.deepStrictEqual(nativeParserStatus({ ...nativeOptions, hostProbeStatus: 0 }), {
      available: true, mode: 'windows_job_object', reason: 'ok'
    });
  });

  await testAsync('native resource and setup exits become fixed content-free codes', async () => {
    const run = (exitCode) => convertDocument(source(`native-${exitCode}.txt`), {
      ...nativeOptions,
      spawn: () => fakeChild((child) => child.emit('close', exitCode))
    });
    await assert.rejects(run(125), (error) =>
      error instanceof SafeError && error.code === 'PARSER_RESOURCE_LIMIT' && !/native-125/.test(error.message));
    await assert.rejects(run(123), (error) =>
      error instanceof SafeError && error.code === 'PARSER_ISOLATION_FAILED' && !/native-123/.test(error.message));
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
    assert.throws(() => validateParserResult({ markdown: 'x'.repeat(8_000_001), attachments: [], warnings: [] }), /gültiges Ergebnis/);
  });

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  done();
}

main();
