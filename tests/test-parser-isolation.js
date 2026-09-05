'use strict';

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');
const {
  SafeError,
  convertDocument,
  validateParserResult,
  nativeParserStatus,
  PARSER_TIMEOUT_MS,
  PARSER_JOB_WALL_MS,
  PARSER_JOB_MEMORY_MIB,
  PARSER_JOB_CPU_MS
} = require('../plugins/data-secure/server/runtime');
const { createContentGraph } = require('../plugins/data-secure/server/content-graph');

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
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.killed = false;
  child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)); return true; };
  // A real process cannot finish reading stdin before the local stream has
  // flushed. Let stream callbacks run first, including when a test resumes
  // from an awaited promise; a microtask-only fake races Node's nextTick queue.
  setImmediate(() => { if (!child.killed) action(child); });
  return child;
}

function parserResult(markdown) {
  const attachments = [];
  return {
    markdown, attachments, warnings: [],
    content_graph: createContentGraph(markdown, attachments, '.txt')
  };
}

async function main() {
  await testAsync('worker source-format substitution is rejected on Windows, macOS and Linux launch paths', async () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      await assert.rejects(convertDocument('opaque-private-artifact', {
        ...nativeOptions, platform, nodeVersion: '22.13.0',
        inputBuffer: Buffer.from('synthetic source'), sourceName: 'source.txt',
        spawn: () => fakeChild((child) => {
          const result = parserResult('safe');
          result.content_graph.source_format = 'docx';
          child.stdout.end(JSON.stringify({ schema: 'data-secure-parser-result/1', ok: true, result }));
          child.emit('close', 0);
        })
      }), (error) => error instanceof SafeError && error.code === 'PARSE_FAILED' && /Content-Graph/.test(error.message));
    }
  });

  await testAsync('authenticated in-memory input reaches the isolated parser through stdin without a plaintext path', async () => {
    const secret = Buffer.from('sensitive marker', 'utf8');
    let invocation;
    let received = Buffer.alloc(0);
    const result = await convertDocument('opaque-private-artifact', {
      ...nativeOptions,
      inputBuffer: secret,
      sourceName: 'source.txt',
      spawn(command, args, options) {
        const child = fakeChild((fake) => {
          fake.stdout.end(JSON.stringify({
            schema: 'data-secure-parser-result/1', ok: true,
            result: parserResult('safe-buffer')
          }));
          fake.emit('close', 0);
        });
        child.stdin.on('data', (chunk) => { received = Buffer.concat([received, chunk]); });
        invocation = { command, args, options };
        return child;
      }
    });
    assert.strictEqual(result.markdown, 'safe-buffer');
    assert.deepStrictEqual(received, secret);
    assert.deepStrictEqual(invocation.options.stdio, ['pipe', 'pipe', 'ignore']);
    assert.doesNotMatch(JSON.stringify(invocation), /opaque-private-artifact|sensitive marker|source\.txt/u);
  });

  await testAsync('a partial or failed authenticated stdin transfer can never release parser output', async () => {
    const secret = Buffer.from('sensitive marker that must arrive completely', 'utf8');
    await assert.rejects(
      () => convertDocument('opaque-private-artifact', {
        ...nativeOptions,
        inputBuffer: secret,
        sourceName: 'source.txt',
        spawn() {
          const child = fakeChild((fake) => {
            fake.stdout.end(JSON.stringify({
              schema: 'data-secure-parser-result/1', ok: true,
              result: parserResult('must-not-release')
            }));
            fake.emit('close', 0);
          });
          child.stdin.end = () => { queueMicrotask(() => child.stdin.emit('error', new Error('EPIPE'))); };
          return child;
        }
      }),
      (error) => error instanceof SafeError && error.code === 'PARSER_INPUT_INCOMPLETE'
    );
  });

  await testAsync('renamed PDFs are blocked from text parsers before any worker starts', async () => {
    let spawned = 0;
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF', 'ascii');
    for (const extension of ['txt', 'md', 'markdown', 'csv']) {
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
            result: parserResult('safe')
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

  await testAsync('real isolated CSV parser distinguishes valid input from a confirmed permanent rejection', async () => {
    // No conversion/worker mock: exercise the actual parser, permission/network
    // boundary and, on Windows, the native launcher with in-memory input only.
    const valid = await convertDocument('opaque-private-artifact', {
      inputBuffer: Buffer.from('Feld,Wert\nRolle,Entwicklung\n'), sourceName: 'synthetic.csv'
    });
    assert.ok(valid.markdown.includes('Entwicklung'));
    const invalid = Buffer.from('Name,Wert\nBeispiel,"nicht abgeschlossen\n');
    const original = Buffer.from(invalid);
    await assert.rejects(convertDocument('opaque-private-artifact', {
      inputBuffer: invalid, sourceName: 'synthetic.csv'
    }), (error) => error instanceof SafeError && error.code === 'PARSE_FAILED' &&
      !/synthetic|Beispiel|nicht abgeschlossen/u.test(error.message));
    assert.deepStrictEqual(invalid, original);
  });

  await testAsync('only the exact rejected-worker envelope and exit code become PARSE_FAILED', async () => {
    const rejected = { schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' };
    for (const platform of ['win32', 'darwin', 'linux']) {
      for (const [exitCode, response, expected] of [
        [2, rejected, 'PARSE_FAILED'],
        [0, rejected, undefined],
        [1, rejected, undefined],
        [null, rejected, undefined],
        [2, { ...rejected, extra: 'PRIVATE-SENTINEL' }, undefined],
        [2, { ...rejected, schema: 'foreign/1' }, undefined],
        [2, { ...rejected, ok: 'false' }, undefined],
        [2, { ...rejected, error: 'PRIVATE-SENTINEL' }, undefined],
        [2, undefined, undefined]
      ]) {
        await assert.rejects(convertDocument('opaque-private-artifact', {
          ...nativeOptions, platform, nodeVersion: '22.13.0',
          inputBuffer: Buffer.from('synthetic'), sourceName: 'source.csv',
          spawn: () => fakeChild((child) => {
            if (response !== undefined) child.stdout.end(JSON.stringify(response));
            child.emit('close', exitCode);
          })
        }), (error) => error instanceof SafeError && error.code === expected &&
          !/PRIVATE-SENTINEL|synthetic|source/u.test(error.message));
      }
    }
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
            result: parserResult('safe')
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
      ...nativeOptions, platform: 'freebsd',
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

  await testAsync('macOS and Linux use the stable Node permission process without a native launcher', async () => {
    for (const platform of ['darwin', 'linux']) {
      let invocation;
      const result = await convertDocument(source(`portable-${platform}.txt`), {
        platform, nodeVersion: '22.13.0',
        spawn(command, args, options) {
          invocation = { command, args, options };
          return fakeChild((child) => {
            child.stdout.end(JSON.stringify({
              schema: 'data-secure-parser-result/1', ok: true,
              result: parserResult('portable-safe')
            }));
            child.emit('close', 0);
          });
        }
      });
      assert.strictEqual(result.markdown, 'portable-safe');
      assert.strictEqual(invocation.command, process.execPath);
      assert.ok(invocation.args.includes('--permission'));
      assert.ok(invocation.args.includes('--max-old-space-size=384'));
      assert.ok(invocation.args.some((item) => item.startsWith('--allow-fs-read=')));
      assert.ok(!invocation.args.includes('--allow-net'));
      assert.ok(!invocation.args.includes('--allow-child-process'));
      assert.deepStrictEqual(invocation.options.env, {});
      assert.strictEqual(typeof invocation.options.stdio[0], 'number');
    }
  });

  test('the parser budgets are explicit and internally consistent on every active platform', () => {
    assert.strictEqual(PARSER_TIMEOUT_MS, 50_000);
    assert.strictEqual(PARSER_JOB_WALL_MS, 45_000);
    assert.strictEqual(PARSER_JOB_MEMORY_MIB, 768);
    assert.strictEqual(PARSER_JOB_CPU_MS, 40_000);
    assert.ok(PARSER_JOB_WALL_MS < PARSER_TIMEOUT_MS);
  });

  test('status probes the native host and blocks x64 emulation on ARM64', () => {
    assert.deepStrictEqual(nativeParserStatus({ ...nativeOptions, hostProbeStatus: 126 }), {
      available: false,
      mode: 'unavailable',
      reason: 'unsupported_host_architecture',
      resource_boundary: 'unavailable',
      hard_process_limits: false
    });
    assert.deepStrictEqual(nativeParserStatus({ ...nativeOptions, hostProbeStatus: 0 }), {
      available: true,
      mode: 'windows_job_object',
      reason: 'ok',
      resource_boundary: 'windows_job_object',
      hard_process_limits: true
    });
    assert.deepStrictEqual(nativeParserStatus({ platform: 'darwin', nodeVersion: '22.13.0' }), {
      available: true, mode: 'node_permission_process', reason: 'ok',
      resource_boundary: 'node_heap_and_parent_timeout', hard_process_limits: false
    });
    assert.deepStrictEqual(nativeParserStatus({ platform: 'linux', nodeVersion: '22.12.0' }), {
      available: false, mode: 'unavailable', reason: 'node_permission_model_too_old',
      resource_boundary: 'unavailable', hard_process_limits: false
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
    await assert.rejects(convertDocument(source('posix-setup.txt'), {
      platform: 'linux', nodeVersion: '22.13.0',
      spawn: () => fakeChild((child) => child.emit('close', 123))
    }), (error) => error instanceof SafeError && error.code === 'PARSER_ISOLATION_FAILED' &&
      !/posix-setup/.test(error.message));
  });

  await testAsync('hung parser is terminated at the deadline and returns a fixed SafeError', async () => {
    let child;
    await assert.rejects(
      convertDocument(source('timeout.txt'), { timeoutMs: 5, spawn: () => (child = fakeChild(() => {})) }),
      (error) => error instanceof SafeError && error.code === 'PARSER_TIMEOUT' && /Zeitlimit/.test(error.message)
    );
    assert.strictEqual(child.killed, true);
  });

  await testAsync('an AbortSignal terminates the isolated parser and returns a content-free cancellation', async () => {
    const controller = new AbortController();
    let child;
    const pending = convertDocument(source('cancel-parser.txt'), {
      ...nativeOptions,
      signal: controller.signal,
      spawn: () => (child = fakeChild(() => {}))
    });
    controller.abort();
    await assert.rejects(
      pending,
      (error) => error instanceof SafeError && error.code === 'REQUEST_CANCELLED' &&
        !/cancel-parser|sensitive marker/i.test(error.message)
    );
    assert.strictEqual(child.killed, true);
  });

  await testAsync('malformed or multiple worker output fails closed', async () => {
    await assert.rejects(convertDocument(source('malformed.txt'), {
      spawn: () => fakeChild((child) => {
        child.stdout.end('{not-json}\n{"raw":"sensitive marker"}');
        child.emit('close', 0);
      })
    }), (error) => error instanceof SafeError && error.code === undefined && !/sensitive marker/.test(error.message));
  });

  test('worker result validator rejects oversized or structurally forged assets', () => {
    assert.throws(() => validateParserResult({
      markdown: 'safe', warnings: [],
      attachments: [{ type: 'image', mimeType: 'image/png', data: 'AAAA', name: 'x', extension: 'png', source_part: 'x', extra: true }]
    }), (error) => error instanceof SafeError && error.code === 'PARSE_FAILED' && /Asset/u.test(error.message));
    assert.throws(() => validateParserResult({ markdown: 'x'.repeat(8_000_001), attachments: [], warnings: [] }),
      (error) => error instanceof SafeError && error.code === 'PARSE_FAILED' && /gültiges Ergebnis/u.test(error.message));
    assert.throws(() => validateParserResult({ ...parserResult('safe'), warnings: ['\u0000'] }),
      (error) => error instanceof SafeError && error.code === 'PARSE_FAILED' && /Warnungen/u.test(error.message));
  });

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  done();
}

main();
