'use strict';

const { createSuite } = require('./helpers');
const { PASSWORD_CANCELLED, MAX_PASSWORD_BYTES, passwordPromptCommands, secretFromOutput, withLocalPassword } = require('../plugins/data-secure/server/companion/local-password');
const { uiProcessPolicy } = require('../plugins/data-secure/server/companion/ui-process-policy');

const { test, done, assert } = createSuite('Local password transport');

test('native prompts never place a password in command arguments or an environment contract', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    for (const spec of passwordPromptCommands({ platform, env: { SystemRoot: 'C:\\Windows' } })) {
      assert.strictEqual(typeof spec.command, 'string');
      assert.ok(Array.isArray(spec.args));
      assert.doesNotMatch(`${spec.command} ${spec.args.join(' ')}`, /--password=|password123|https?:/i);
    }
  }
  assert.deepStrictEqual(uiProcessPolicy('password_prompt'), {
    input_class: 'user_entered_secret', output_class: 'ephemeral_secret_buffer', raw_content: false,
    os_network_sandbox_required: true, os_network_sandbox_verified: false
  });
  assert.match(passwordPromptCommands({ platform: 'win32', env: { SystemRoot: 'C:\\Windows' } })[0].args.join(' '), /UseSystemPasswordChar = \$true/);
});

test('a child output buffer is copied then wiped and cancellation is explicit', () => {
  const output = Buffer.from('very-local-secret\r\n');
  const secret = secretFromOutput(output);
  assert.strictEqual(secret.toString(), 'very-local-secret');
  assert.ok(output.every((byte) => byte === 0));
  secret.fill(0);
  assert.throws(() => secretFromOutput(Buffer.from(PASSWORD_CANCELLED)), (error) => error.code === 'LOCAL_PASSWORD_CANCELLED');
  assert.throws(() => secretFromOutput('cannot be wiped'), /sicheren Binärwert/);
  const tooLong = Buffer.alloc(MAX_PASSWORD_BYTES + 1, 65);
  assert.throws(() => secretFromOutput(tooLong), /zu lang/);
  assert.ok(tooLong.every((byte) => byte === 0));
});

test('the consumer sees an ephemeral Buffer that is wiped after success and failure', async () => {
  let observed;
  const result = await withLocalPassword(async (password) => { observed = password; return password.length; }, {
    platform: 'linux', runner: () => ({ status: 0, stdout: Buffer.from('abc') })
  });
  assert.strictEqual(result, 3);
  assert.ok(observed.every((byte) => byte === 0));
  await assert.rejects(() => withLocalPassword(async (password) => {
    observed = password; throw new Error('decrypter rejected');
  }, { platform: 'linux', runner: () => ({ status: 0, stdout: Buffer.from('abc') }) }), /decrypter rejected/);
  assert.ok(observed.every((byte) => byte === 0));
});

test('a failed password helper cannot authenticate partial stdout', async () => {
  const partial = Buffer.from('partial-secret');
  let consumed = false;
  await assert.rejects(() => withLocalPassword(async () => {
    consumed = true;
  }, {
    platform: 'linux', runner: () => ({ status: 2, stdout: partial })
  }), (error) => error.code === 'LOCAL_PASSWORD_CANCELLED');
  assert.strictEqual(consumed, false);
  assert.ok(partial.every((byte) => byte === 0));
});

test('timeout and startup errors wipe every partial password byte', async () => {
  for (const code of ['ETIMEDOUT', 'EIO', 'ENOENT']) {
    const partial = Buffer.from(`partial-${code}`);
    await assert.rejects(() => withLocalPassword(async () => assert.fail('no consumer'), {
      platform: 'linux', runner: () => ({ error: { code }, stdout: partial })
    }));
    assert.ok(partial.every((byte) => byte === 0), `${code} must wipe child output`);
  }
});

done();
