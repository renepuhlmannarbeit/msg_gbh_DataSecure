'use strict';

// Privileged test oracle for synthetic packages. Standalone exposes no
// Cowork model-read capability; its public UI reads through its own result
// store. This helper checks bytes directly without entering a product build.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { isUtf8 } = require('node:buffer');

function reader(server, channel) {
  if (channel !== 'standalone') return require(path.join(server, 'gateway/package-store')).readOutput;
  const { safeResolvePackage, readVerifiedFile } = require(path.join(server, 'gateway/package-files'));
  return (packageId, capability, offset = 0, maxChars = 30000) => {
    assert.equal(capability, undefined, 'Standalone must not mint Cowork read grants');
    const { p, m } = safeResolvePackage(packageId);
    const bytes = readVerifiedFile(p, m.document, 32 * 1024 * 1024);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), m.document_sha256);
    assert.ok(isUtf8(bytes));
    const body = bytes.toString('utf8');
    const start = Math.max(0, Math.min(body.length, offset));
    const end = Math.min(body.length, start + maxChars);
    return { text: body.slice(start, end), next_offset: end, has_more: end < body.length,
      total_chars: body.length };
  };
}

module.exports = { reader };
