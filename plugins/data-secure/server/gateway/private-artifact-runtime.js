'use strict';

const { roots } = require('./common');
const { createPrivateArtifactCrypto } = require('./private-artifact-crypto');
const { createInstallationSecretStore } = require('./installation-secret-store');

const cached = new Map();

function createProductPrivateArtifactCrypto(options = {}) {
  const privateRoot = options.privateRoot || roots().root;
  const secretStore = options.secretStore || createInstallationSecretStore({
    privateRoot,
    Entry: options.Entry,
    load: options.load,
    vendorDir: options.vendorDir,
    fs: options.fs,
    randomBytes: options.randomBytes
  });
  const crypto = createPrivateArtifactCrypto({
    privateRoot,
    secretStore,
    fs: options.fs,
    platform: options.platform,
    randomBytes: options.randomBytes,
    maxBytes: options.maxBytes
  });
  return Object.freeze({ ...crypto, ensureReady: () => secretStore.ensureReady() });
}

function productPrivateArtifactCrypto(privateRoot = roots().root) {
  const root = require('path').resolve(privateRoot);
  if (!cached.has(root)) cached.set(root, createProductPrivateArtifactCrypto({ privateRoot: root }));
  return cached.get(root);
}

function resetProductPrivateArtifactCryptoForTests() {
  cached.clear();
}

module.exports = Object.freeze({
  createProductPrivateArtifactCrypto,
  productPrivateArtifactCrypto,
  resetProductPrivateArtifactCryptoForTests
});
