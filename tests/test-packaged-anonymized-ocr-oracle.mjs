import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPackagedAnonymizedOcrMarkdown } from './helpers/standalone-packaged-anonymized-ocr-oracle.mjs';

// Independent source expectation: conversion-fixtures.mjs image() draws only
// Max Mustermann, Nordstern GmbH, Projektmanager Software Tester.
const job = 'Projektmanager Software Tester';
const baseline = '[PERSON_1]\n[UNTERNEHMEN_1]\nProjektmanager Software Tester\n';
const rejected = value => assert.throws(() => assertPackagedAnonymizedOcrMarkdown(value),
  { code: 'ERR_ASSERTION' });

test('packaged anonymized OCR oracle accepts pseudonyms and the full real source ending', () => {
  for (const value of [
    baseline,
    '## Seite 1\n\n' + baseline,
    '[PERSON_1]\n[UNTERNEHMEN_1]\nProjekt**manager** Software Tester\n',
    '[PERSON_1]\n[UNTERNEHMEN_1]\nProjektmanager **Software** \x60Tester\x60\n',
    '[PERSON_1]\n[UNTERNEHMEN_1]\nProjektmanager&#32;Software&nbsp;Tester\n'
  ]) assert.doesNotThrow(() => assertPackagedAnonymizedOcrMarkdown(value));
});

test('packaged anonymized OCR oracle refuses original identities across syntax and whitespace', () => {
  for (const identity of [
    'Max Mustermann', 'Nordstern GmbH',
    'Max&#32;Mustermann', 'Nordstern&#x20;GmbH',
    'Max&nbsp;Mustermann', 'Nordstern&#160;GmbH',
    'Max\nMustermann', 'Max  \nMustermann', 'Nordstern \t\r\n GmbH',
    'Ma**x**&#32;Muster**mann**', 'Nord**stern**&Tab;Gm**bH**',
    'Max&#32;Muste\nrmann', 'Nordstern Gm\nbH',
    '\x60Max&#32;Mustermann\x60', 'Nordstern&amp;#32;GmbH'
  ]) rejected(identity + '\n\n' + baseline);
});

test('packaged anonymized OCR oracle refuses each lost or reordered part of the factual line', () => {
  for (const changed of [
    'Projektmanager', 'Software Tester', 'Projektmanager Software',
    'Projektmanager Tester', 'Software Tester Projektmanager'
  ]) rejected(baseline.replace(job, changed));
});

test('packaged anonymized OCR oracle retains raw and encoded embedded-image refusals', () => {
  for (const artifact of [
    'data:image/png;base64,AAAA', 'base64,AAAA', '![fixture](source.png)',
    '<img src="source.png">', 'data&#58;image/png'
  ]) rejected(artifact + '\n\n' + baseline);
});
