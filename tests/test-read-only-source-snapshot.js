'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const {
  copySourceToPrivateWork,
  readSourceToPrivateMemory
} = require('../plugins/data-secure/server/gateway/read-only-source-snapshot');

const { test, done, assert } = createSuite('Read-only source snapshot boundary');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-readonly-'));

function fixture(name, content = 'Kunde: Max Mustermann\nIBAN: DE89370400440532013000') {
  const source = path.join(root, name);
  fs.writeFileSync(source, content, { encoding: 'utf8', mode: 0o400 });
  return source;
}

function identity(file) {
  const stat = fs.lstatSync(file);
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  };
}

function assertSameSource(file, before) {
  assert.deepStrictEqual(identity(file), before);
}

test('copies a read-only source without changing path, identity, bytes or mtime', () => {
  const source = fixture('readonly.txt');
  const before = identity(source);
  const destination = path.join(root, 'private-copy.txt');
  const result = copySourceToPrivateWork({ source, destination, expectedStat: fs.lstatSync(source) });
  assert.deepStrictEqual(result, { privatePath: destination, sourceMutated: false });
  assert.strictEqual(fs.readFileSync(destination, 'utf8'), fs.readFileSync(source, 'utf8'));
  assertSameSource(source, before);
});

test('binds a sealed source to its expected SHA-256', () => {
  const source = fixture('sealed.csv', 'Name;Rolle\nErika Beispiel;Testmanagerin');
  const before = identity(source);
  const destination = path.join(root, 'sealed-private.csv');
  copySourceToPrivateWork({
    source,
    destination,
    expectedStat: fs.lstatSync(source),
    expectedSha256: before.sha256
  });
  assertSameSource(source, before);
  assert.strictEqual(identity(destination).sha256, before.sha256);
});

test('direct picker reads an identity-bound in-memory snapshot without a plaintext work file', () => {
  const source = fixture('memory.txt', 'Kontakt: Synthetische Person 815');
  const before = identity(source);
  const result = readSourceToPrivateMemory({ source, expectedStat: fs.lstatSync(source) });
  try {
    assert.strictEqual(result.privateBytes.toString('utf8'), fs.readFileSync(source, 'utf8'));
    assert.strictEqual(result.sourceMutated, false);
    assert.deepStrictEqual(fs.readdirSync(root).filter((name) => name.includes('memory')), ['memory.txt']);
    assertSameSource(source, before);
  } finally { result.privateBytes.fill(0); }
});

test('a stale identity stops before creating a private copy', () => {
  const source = fixture('stale.md', '# Profil\nMax Mustermann');
  const before = identity(source);
  const stat = fs.lstatSync(source);
  const destination = path.join(root, 'stale-private.md');
  assert.throws(
    () => copySourceToPrivateWork({
      source,
      destination,
      expectedStat: { ...stat, size: stat.size + 1 }
    }),
    /während der Übergabe verändert/u
  );
  assert.strictEqual(fs.existsSync(destination), false);
  assertSameSource(source, before);
});

test('a sealed hash mismatch removes only the incomplete private copy', () => {
  const source = fixture('hash-mismatch.docx', 'synthetic ooxml placeholder');
  const before = identity(source);
  const destination = path.join(root, 'hash-mismatch-private.docx');
  assert.throws(
    () => copySourceToPrivateWork({
      source,
      destination,
      expectedStat: fs.lstatSync(source),
      expectedSha256: '0'.repeat(64)
    }),
    (error) => error.code === 'BATCH_SNAPSHOT_CHANGED'
  );
  assert.strictEqual(fs.existsSync(destination), false);
  assertSameSource(source, before);
});

test('an existing private destination is never overwritten', () => {
  const source = fixture('exclusive.txt', 'Telefon: +49 170 1234567');
  const before = identity(source);
  const destination = path.join(root, 'occupied.txt');
  fs.writeFileSync(destination, 'keep me', 'utf8');
  assert.throws(
    () => copySourceToPrivateWork({ source, destination, expectedStat: fs.lstatSync(source) }),
    /EEXIST/u
  );
  assert.strictEqual(fs.readFileSync(destination, 'utf8'), 'keep me');
  assertSameSource(source, before);
});

test('directories and missing identity metadata fail closed', () => {
  const destination = path.join(root, 'invalid-private.txt');
  assert.throws(
    () => copySourceToPrivateWork({ source: root, destination, expectedStat: fs.lstatSync(root) }),
    /während der Übergabe verändert/u
  );
  assert.throws(
    () => copySourceToPrivateWork({ source: root, destination, expectedStat: null }),
    /Identitätsbindung/u
  );
  assert.strictEqual(fs.existsSync(destination), false);
});

for (const [label, firstWrite] of [['zero write', 0], ['partial then zero write', 3]]) {
  test(`${label} stops without hanging and removes the private copy`, () => {
    const source = fixture(`write-${firstWrite}.txt`, 'abcdefghijklmnopqrstuvwxyz');
    const before = identity(source);
    const destination = path.join(root, `write-${firstWrite}-private.txt`);
    const originalWrite = fs.writeSync;
    let calls = 0;
    fs.writeSync = (fd, buffer, offset, length, position) => {
      calls++;
      if (calls === 1 && firstWrite > 0) return originalWrite(fd, buffer, offset, firstWrite, position);
      return 0;
    };
    try {
      assert.throws(
        () => copySourceToPrivateWork({
          source,
          destination,
          expectedStat: fs.lstatSync(source),
          expectedSha256: before.sha256
        }),
        /nicht vollständig geschrieben/u
      );
    } finally {
      fs.writeSync = originalWrite;
    }
    assert.strictEqual(fs.existsSync(destination), false);
    assertSameSource(source, before);
  });
}

for (const [label, failingClose] of [['destination close', 1], ['source close', 2]]) {
  test(`${label} fails closed and removes the completed private copy`, () => {
    const source = fixture(`close-${failingClose}.txt`, 'close-boundary');
    const before = identity(source);
    const destination = path.join(root, `close-${failingClose}-private.txt`);
    const originalClose = fs.closeSync;
    let calls = 0;
    fs.closeSync = (fd) => {
      calls++;
      originalClose(fd);
      if (calls === failingClose) throw new Error('injected close failure');
    };
    try {
      assert.throws(
        () => copySourceToPrivateWork({
          source,
          destination,
          expectedStat: fs.lstatSync(source),
          expectedSha256: before.sha256
        }),
        (error) => error.code === 'PRIVATE_COPY_CLOSE_FAILED'
      );
    } finally {
      fs.closeSync = originalClose;
    }
    assert.strictEqual(fs.existsSync(destination), false);
    assertSameSource(source, before);
  });
}

test('cleanup failure is explicit and never mutates the source', () => {
  const source = fixture('cleanup-failure.txt', 'cleanup-boundary');
  const before = identity(source);
  const destination = path.join(root, 'cleanup-failure-private.txt');
  const originalClose = fs.closeSync;
  const originalUnlink = fs.unlinkSync;
  let closeCalls = 0;
  fs.closeSync = (fd) => {
    closeCalls++;
    originalClose(fd);
    if (closeCalls === 1) throw new Error('injected close failure');
  };
  fs.unlinkSync = (target) => {
    if (target === destination) throw new Error('injected unlink failure');
    return originalUnlink(target);
  };
  try {
    assert.throws(
      () => copySourceToPrivateWork({
        source,
        destination,
        expectedStat: fs.lstatSync(source),
        expectedSha256: before.sha256
      }),
      (error) => error.code === 'PRIVATE_COPY_CLEANUP_FAILED'
    );
  } finally {
    fs.closeSync = originalClose;
    fs.unlinkSync = originalUnlink;
  }
  assert.strictEqual(fs.existsSync(destination), true, 'recovery-visible private artifact remains');
  fs.unlinkSync(destination);
  assertSameSource(source, before);
});

test('an equal-length mutation between local sealing and copy is detected', () => {
  const source = fixture('same-length-race.txt', 'AAAAAAAAAAAAAAAA');
  fs.chmodSync(source, 0o600);
  const stat = fs.lstatSync(source);
  const destination = path.join(root, 'same-length-race-private.txt');
  const originalRead = fs.readSync;
  let reads = 0;
  fs.readSync = (fd, buffer, offset, length, position) => {
    reads++;
    if (reads === 2) {
      fs.writeFileSync(source, 'BBBBBBBBBBBBBBBB', 'utf8');
      fs.utimesSync(source, stat.atime, stat.mtime);
    }
    return originalRead(fd, buffer, offset, length, position);
  };
  try {
    assert.throws(
      () => copySourceToPrivateWork({ source, destination, expectedStat: stat }),
      (error) => error.code === 'SOURCE_SNAPSHOT_CHANGED'
    );
  } finally {
    fs.readSync = originalRead;
  }
  assert.strictEqual(fs.existsSync(destination), false);
  assert.strictEqual(fs.readFileSync(source, 'utf8'), 'BBBBBBBBBBBBBBBB');
});

try {
  done();
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
