'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { createPrivateArtifactCrypto } = require('../../plugins/data-secure/server/gateway/private-artifact-crypto');

function createTestPrivateArtifactCrypto(privateRoot) {
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const key = Buffer.alloc(32, 0x6d);
  const artifactCrypto = createPrivateArtifactCrypto({
    privateRoot,
    secretStore: {
      ensureReady() {
        return { available: true, backend: 'test-memory', keyId: crypto.createHash('sha256').update(key).digest('hex').slice(0, 32), generation: 1 };
      },
      prepareWrite() {
        return {
          key: Buffer.from(key),
          keyId: crypto.createHash('sha256').update(key).digest('hex').slice(0, 32),
          generation: 1,
          commit() {},
          abort() {}
        };
      },
      resolveRead() { return Buffer.from(key); }
    }
  });
  const readyCrypto = Object.freeze({ ...artifactCrypto, ensureReady: () => ({ available: true }) });
  return readyCrypto;
}

function installBatchPrivateArtifactCrypto(batchTestApi, privateRoot) {
  const readyCrypto = createTestPrivateArtifactCrypto(privateRoot);
  batchTestApi.setPrivateArtifactCryptoProviderForTests(() => readyCrypto);
  return readyCrypto;
}

module.exports = { createTestPrivateArtifactCrypto, installBatchPrivateArtifactCrypto };
