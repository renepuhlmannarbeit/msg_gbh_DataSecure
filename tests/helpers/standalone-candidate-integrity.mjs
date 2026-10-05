import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const comparable = value => {
  let resolved = path.resolve(value);
  if (process.platform === 'win32') {
    if (resolved.startsWith('\\\\?\\UNC\\')) resolved = `\\\\${resolved.slice(8)}`;
    else if (resolved.startsWith('\\\\?\\')) resolved = resolved.slice(4);
    resolved = resolved.toLowerCase();
  }
  return resolved;
};

// The ZIP has already passed its platform verifier. Bind the *actual* native
// execution tree to those bytes too; checking the unchanged ZIP alone cannot
// detect an edited extracted executable, added module or redirected directory.
export function verifyExtractedCandidate(directory, entries, modes = new Map()) {
  const root = path.resolve(directory), expectedDirectories = new Set(['']);
  assert.ok(entries instanceof Map && entries.size > 0, 'CANDIDATE_INVENTORY_INVALID');
  for (const [name, bytes] of entries) {
    assert.ok(typeof name === 'string' && name && !/[\\:\u0000-\u001f\u007f]/u.test(name) &&
      name.split('/').every(part => part && part !== '.' && part !== '..') && Buffer.isBuffer(bytes),
    'CANDIDATE_PATH_INVALID');
    const pieces = name.split('/');
    for (let index = 1; index < pieces.length; index++) expectedDirectories.add(pieces.slice(0, index).join('/'));
  }
  const seen = new Set(), seenDirectories = new Set();
  const visit = (target, relative) => {
    const stat = fs.lstatSync(target);
    assert.ok(!stat.isSymbolicLink(), 'CANDIDATE_LINK_FORBIDDEN');
    assert.equal(comparable(fs.realpathSync.native(target)), comparable(target), 'CANDIDATE_PATH_REDIRECTED');
    if (stat.isDirectory()) {
      assert.ok(expectedDirectories.has(relative), `CANDIDATE_DIRECTORY_UNEXPECTED:${relative}`);
      seenDirectories.add(relative);
      for (const name of fs.readdirSync(target)) visit(path.join(target, name), relative ? `${relative}/${name}` : name);
      return;
    }
    assert.ok(stat.isFile(), 'CANDIDATE_FILE_TYPE_INVALID');
    assert.equal(stat.nlink, 1, 'CANDIDATE_HARDLINK_FORBIDDEN');
    assert.ok(entries.has(relative), `CANDIDATE_FILE_UNEXPECTED:${relative}`);
    assert.deepEqual(fs.readFileSync(target), entries.get(relative), `CANDIDATE_FILE_CHANGED:${relative}`);
    if (modes.has(relative)) {
      assert.equal(modes.get(relative) & 0o170000, 0o100000, `CANDIDATE_ARCHIVE_FILE_TYPE_INVALID:${relative}`);
    }
    if (process.platform !== 'win32' && modes.has(relative)) {
      assert.equal(stat.mode & 0o777, modes.get(relative) & 0o777, `CANDIDATE_MODE_CHANGED:${relative}`);
    }
    seen.add(relative);
  };
  visit(root, '');
  assert.deepEqual([...seen].sort(), [...entries.keys()].sort(), 'CANDIDATE_FILES_INCOMPLETE');
  assert.deepEqual([...seenDirectories].sort(), [...expectedDirectories].sort(), 'CANDIDATE_DIRECTORIES_INCOMPLETE');
}
