'use strict';

const fullwidth = (value) => value.replace(/[!-~]/gu, (character) => String.fromCharCode(character.charCodeAt(0) + 0xFEE0));
const profiles = ['general', 'contract', 'customer', 'applicant', 'personnel_profile'];
const professionalText = '😀 ﬁ m² ① ㍍ ＡＰＩ ｜ ［ＭＯＤＵＬ］';
const identifierCases = [
  { type: 'EMAIL', label: 'E-Mail: ', value: fullwidth('anna@example.de'), replacement: '[EMAIL_REDACTED]' },
  { type: 'EMAIL', label: 'E-Mail: ', value: 'anna＠example․de', replacement: '[EMAIL_REDACTED]' },
  { type: 'PHONE', label: 'Telefon: ', value: fullwidth('+49 30 12345678'), replacement: '[PHONE_REDACTED]' },
  { type: 'PHONE', label: fullwidth('Telefon:') + ' ', value: fullwidth('030 12 34 56 78'), replacement: '[PHONE_REDACTED]' },
  { type: 'IBAN', label: 'IBAN: ', value: fullwidth('DE89 3704 0044 0532 0130 00'), replacement: '[BANK_DATA_REDACTED]' },
  { type: 'CONTACT_URI', label: '', value: fullwidth('tel:03012345678'), replacement: '[CONTACT_REDACTED]' },
  { type: 'CONTACT_URI', label: '', value: fullwidth('mailto:anna@example.de'), replacement: '[CONTACT_REDACTED]' }
];
const originalDocument = [professionalText, ...identifierCases.map(({ label, value }) => label + value),
  'tel:03012345678.UnveraenderterFachtext'].join('\n');
const expectedDocument = [professionalText, ...identifierCases.map(({ label, replacement }) => label + replacement),
  '[CONTACT_REDACTED].UnveraenderterFachtext'].join('\n');

module.exports = { fullwidth, profiles, professionalText, identifierCases, originalDocument, expectedDocument };
