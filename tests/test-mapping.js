'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { csvField, appendMapping, mappingPath } = require('../plugins/data-secure/server/gateway/mapping');

const { test, done, assert } = createSuite('Local mapping CSV');

test('formula-looking fields are neutralized even after leading spreadsheet whitespace', () => {
  for (const value of ['=1+1', '+1', '-1', '@cmd', ' =1+1', '\t=1+1', ' \t@cmd', '\u00A0=1+1', '\uFEFF@cmd']) {
    assert.ok(csvField(value).startsWith('"\''), `${JSON.stringify(value)} must be quoted as literal text`);
  }
  assert.strictEqual(csvField(' normal.txt'), '" normal.txt"');
  assert.strictEqual(csvField('normal.txt'), '"normal.txt"');
});

test('a linked mapping target is refused before external content can be read or replaced', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-'));
  const roots = () => ({ exports: exportsRoot });
  const target = mappingPath({ roots });
  const linkedFs = Object.create(fs);
  linkedFs.lstatSync = (candidate) => candidate === target
    ? { isFile: () => true, isSymbolicLink: () => true }
    : fs.lstatSync(candidate);
  try {
    fs.writeFileSync(target, 'external content');
    assert.throws(() => appendMapping('normal.txt', 'package_1', 'freigegeben', { roots, fs: linkedFs }),
      /Zuordnungsexport konnte nicht sicher gelesen werden/u);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'external content');
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

test('a redirected mapping export directory is refused before a local CSV is written', () => {
  const exportsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-mapping-root-'));
  const roots = () => ({ exports: exportsRoot });
  const redirectedFs = Object.create(fs);
  redirectedFs.lstatSync = (candidate) => candidate === exportsRoot
    ? { isDirectory: () => true, isSymbolicLink: () => true }
    : fs.lstatSync(candidate);
  try {
    assert.throws(() => appendMapping('normal.txt', 'package_1', 'freigegeben', { roots, fs: redirectedFs }),
      /Zuordnungsexport konnte nicht sicher gelesen werden/u);
    assert.strictEqual(fs.existsSync(mappingPath({ roots })), false);
  } finally { fs.rmSync(exportsRoot, { recursive: true, force: true }); }
});

done();
