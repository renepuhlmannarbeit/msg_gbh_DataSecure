'use strict';
// Launch/clock/stream models execute actual parent code. These tests do not
// exhaust descriptors, start native converters or prove native pipe completion.
const { createSuite } = require('./helpers');
const { createParentModel } = require('./lib/conversion-parent-model.cjs');
const { testAsync, assert, done } = createSuite('Conversion parent lifetime (source models)');
const intact = model => assert.equal(model.original.toString(), 'bound original bytes');
const pending = model => assert.equal(model.copy().toString(), 'bound original bytes');
const disposed = model => { assert.ok(model.copy().every(byte => byte === 0)); intact(model); };
async function main() {
  for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'arm64'], ['darwin', 'x64']]) {
    const name = platform + '/' + arch, model = options => createParentModel({ platform, arch, ...options });
    for (const [code, expected] of [['EMFILE', 'CONVERSION_START_FAILED'], ['ENFILE', 'CONVERSION_START_FAILED'],
      ['EACCES', 'CONVERSION_EXECUTABLE_DENIED'], ['ENOEXEC', 'CONVERSION_ARCHITECTURE_INVALID']])
      await testAsync(name + ': asynchronous failed spawn without streams keeps ' + code, async () => {
        const m = model({ streams: false, spawned: false });
        const rejection = assert.rejects(m.promise, { code: expected });
        await new Promise(resolve => process.nextTick(() => { m.child.emit('error', Object.assign(Error('fixed'), { code })); resolve(); }));
        await rejection; assert.equal(m.killed(), 0); assert.equal(m.timers.size, 0); disposed(m);
      });
    await testAsync(name + ': a started child without the pipe contract is refused without a TypeError', async () => {
      const m = model({ streams: false });
      const rejection = assert.rejects(m.promise, { code: 'CONVERSION_RESPONSE_INVALID' });
      assert.equal(m.killed(), 1); m.close(0); await rejection; assert.equal(m.timers.size, 0); disposed(m);
    });
    await testAsync(name + ': prelaunch and synchronous launch refusals dispose only the independent copy', async () => {
      const primary = Object.freeze(Object.assign(Error('fixed'), { code: 'CONVERSION_RUNTIME_UNAVAILABLE' }));
      const early = model({ spawned: false, runtimeFailure: primary });
      await assert.rejects(early.promise, error => error === primary); assert.equal(early.spawnCalls(), 0); disposed(early);
      const spawn = model({ spawned: false, spawnFailure: Object.assign(Error('fixed'), { code: 'EMFILE' }) });
      await assert.rejects(spawn.promise, { code: 'CONVERSION_START_FAILED' }); assert.equal(spawn.killed(), 0); disposed(spawn);
    });
    await testAsync(name + ': a delayed write keeps exact bytes until its successful callback', async () => {
      const m = model({ flush: false }); pending(m); await new Promise(resolve => setImmediate(resolve)); pending(m);
      m.completeInput(); disposed(m);
      const rejection = assert.rejects(m.promise, { code: 'CONVERSION_RESPONSE_INVALID' });
      m.close(0); await rejection; // No stdout response was provided by this input-only model.
    });
    await testAsync(name + ': unconfirmed termination retains a still-owned input until actual stdin close', async () => {
      const m = model({ flush: false }), rejection = assert.rejects(m.promise, { code: 'CONVERSION_TERMINATION_UNCONFIRMED' });
      m.tick(1000); m.tick(m.graceMs); await rejection; pending(m); intact(m);
      m.closeInput(); disposed(m);
    });
    await testAsync(name + ': child close alone never disposes a pending input', async () => {
      const m = model({ flush: false }), rejection = assert.rejects(m.promise, { code: 'CONVERSION_RESPONSE_INVALID' });
      m.close(0); await rejection; pending(m); m.closeInput(); disposed(m);
    });
    await testAsync(name + ': error end callback and child close still wait for stdin ownership to end', async () => {
      const m = model({ flush: false }), rejection = assert.rejects(m.promise, { code: 'CONVERSION_INPUT_INCOMPLETE' });
      m.inputError('EIO', 'callback'); pending(m); m.close(0); await rejection; pending(m);
      m.closeInput(); disposed(m);
    });
    await testAsync(name + ': cancellation preserves pending bytes until stdin close', async () => {
      const m = model({ flush: false }), rejection = assert.rejects(m.promise, { code: 'REQUEST_CANCELLED' });
      m.controller.abort(); pending(m); m.close(0); await rejection; pending(m);
      m.closeInput(); disposed(m);
    });
  }
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
