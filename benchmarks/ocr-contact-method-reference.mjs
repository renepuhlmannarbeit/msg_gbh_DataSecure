// Independent literal ground truth. No detector, OCR output, learned registry,
// postprocessor or production reference generator defines these expectations.
// Development/holdout assignment is frozen before running either reader.
export const contactMethodCases = Object.freeze([
  ['q-lower', 'Kontakt: qa18@quality.example.invalid', 'arial'],
  ['g-real', 'Kontakt: ga82@garden.example.invalid', 'times'],
  ['d-real', 'E-Mail: dora@dquality.example.invalid', 'consolas'],
  ['dot-plus', 'E-Mail: lena.quast+team@office.example.invalid', 'arial'],
  ['hyphen', 'Kontakt: kai-ahlert@north-west.example.invalid', 'times'],
  ['upper', 'E-Mail: Q.GROVE@SERVICE.EXAMPLE.INVALID', 'consolas'],
  ['bare', 'greta.quill@contacts.example.invalid', 'times'],
  ['long', 'E-Mail: quay-long-address@department.branch.example.invalid', 'arial'],
  ['digits', 'E-Mail: gq0123456789@d0main.example.invalid', 'consolas'],
  ['underscore', 'Kontakt: q_group@garden.example.invalid', 'arial'],
  ['phone', 'Telefon: +49 (030) 9876 54321', 'times'],
  ['no-at', 'E-Mail: lea.quast contact.example.invalid', 'consolas'],
  ['split', 'E-Mail: lea.quast @ contact.example.invalid', 'times'],
  ['two', 'E-Mail: qara@one.example.invalid; gunnar@two.example.invalid', 'arial'],
  ['negative-label', 'Kontakt: nicht angegeben', 'consolas'],
  ['negative-prose', 'Service Level und Fail Closed bleiben Sachbegriffe.', 'times'],
  // Held-out families: no tuning after observing these eight cases.
  ['hold-qg', 'Kontakt: quagga.gq@query-garden.example.invalid', 'times'],
  ['hold-d', 'E-Mail: dagmar.d@delta.example.invalid', 'arial'],
  ['hold-plus', 'E-Mail: robin.quell+g7@sub.long-domain.example.invalid', 'consolas'],
  ['hold-nolabel', 'gitta@dahlia.example.invalid', 'arial'],
  ['hold-empty', 'E-Mail: —', 'times'],
  ['hold-phone', 'Mobil: +49 170 123 4567', 'consolas'],
  ['hold-noat', 'Kontakt: gerd.quast garden.example.invalid', 'times'],
  ['hold-boundary', 'E-Mail: müller@büro.example.invalid', 'arial']
].map(([id, line, font], index) => Object.freeze({ id, line, font,
  split: index < 16 ? 'development' : 'holdout',
  // Semantic annotation is independent of the production line detector.
  // Exact contact-line metrics include labels/spaces, not only email addresses.
  kind: ['negative-label', 'negative-prose', 'hold-empty'].includes(id) ? 'negative'
    : ['phone', 'hold-phone'].includes(id) ? 'phone'
    : ['no-at', 'split', 'hold-noat'].includes(id) ? 'damaged-email' : 'email',
  expected_lines: id === 'negative-prose' ? [] : [line],
  noncontact: 'FHIR und Kubernetes bleiben unverändert.',
  boundary: id === 'hold-boundary' })));
