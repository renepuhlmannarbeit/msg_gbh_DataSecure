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
  { type: 'CONTACT_URI', label: '', value: fullwidth('mailto:anna@example.de'), replacement: '[CONTACT_REDACTED]' },
  { type: 'CREDIT_CARD', label: 'Kreditkarte: ', value: fullwidth('4111 1111 1111 1111'), replacement: '[BANK_DATA_REDACTED]' },
  { type: 'DE_TAX_ID', label: 'Steuer-ID: ', value: fullwidth('26954371827'), replacement: '[ID_REDACTED]' },
  { type: 'DE_SOCIAL_SECURITY', label: 'SV: ', value: fullwidth('12 010180 A 123'), replacement: '[ID_REDACTED]' },
  { type: 'REFERENCE_ID', label: 'Kundennummer: ', value: fullwidth('AB-12345'), replacement: '[ID_REDACTED]' },
  { type: 'DATE_OF_BIRTH', label: 'Geburtsdatum: ', value: fullwidth('01.01.1980'), replacement: '[DATE_REDACTED]' },
  { type: 'VEHICLE_PLATE', label: 'Kennzeichen: ', value: fullwidth('B-AB 1234'), replacement: '[ID_REDACTED]' },
  { type: 'IP', label: 'IP: ', value: fullwidth('192.168.1.1'), replacement: '[IP_REDACTED]' },
  { type: 'IPV6', label: 'IPv6: ', value: fullwidth('2001:db8::1'), replacement: '[IP_REDACTED]' }
];
const originalDocument = [professionalText, ...identifierCases.map(({ label, value }) => label + value),
  'tel:03012345678.UnveraenderterFachtext'].join('\n');
const expectedDocument = [professionalText, ...identifierCases.map(({ label, replacement }) => label + replacement),
  '[CONTACT_REDACTED].UnveraenderterFachtext'].join('\n');

module.exports = { fullwidth, profiles, professionalText, identifierCases, originalDocument, expectedDocument };
