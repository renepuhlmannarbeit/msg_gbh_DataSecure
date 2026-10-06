'use strict';

// OCR confidence is a heuristic, not a probability of correctness. In
// particular a high page average can hide a changed contact value. This
// module only produces local warning locations; it never repairs, removes or
// logs source text and does not decide whether an identity is anonymized.
const CONTACT_LABEL = /\b(?:e[ -]?mail|kontakt|contact|telefon|tel\.?|phone|mobil(?:telefon)?|fax)\s*[:=]\s*\S/iu;
const EMAIL_SHAPE = /[^\s@]+@[^\s@]+/u;
const INTERNATIONAL_PHONE_SHAPE = /\+\d[\d ()./-]{6,}\d/u;
const LOW_WORD_CONFIDENCE = 90;
const comparable = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
const isContactLine = line => CONTACT_LABEL.test(line) || EMAIL_SHAPE.test(line) || INTERNATIONAL_PHONE_SHAPE.test(line);

function contactQuality(data, retainedText) {
  const scoredLines = new Map();
  const disagreements = new Set();
  for (const block of Array.isArray(data?.blocks) ? data.blocks : []) {
    for (const paragraph of Array.isArray(block?.paragraphs) ? block.paragraphs : []) {
      for (const line of Array.isArray(paragraph?.lines) ? paragraph.lines : []) {
        if (typeof line?.text !== 'string') continue;
        const scores = (Array.isArray(line.words) ? line.words : []).map(word => word?.confidence)
          .filter(score => Number.isFinite(score) && score >= 0 && score <= 100);
        const key = comparable(line.text), previous = scoredLines.get(key);
        if (line.contact_disagreement === true) disagreements.add(key);
        // Repeated identical lines use the least certain occurrence, not an
        // optimistic page average. Missing scores remain explicitly unknown.
        const confidence = scores.length ? scores.reduce((minimum, score) => Math.min(minimum, score), 100) : null;
        scoredLines.set(key, previous === undefined ? confidence
          : previous === null || confidence === null ? null : Math.min(previous, confidence));
      }
    }
  }
  const contact_lines = [], low_confidence_lines = [], unscored_contact_lines = [], disagreement_lines = [];
  for (const [index, line] of retainedText.split(/\r\n|\r|\n/u).entries()) {
    if (!isContactLine(line)) continue;
    const number = index + 1;
    contact_lines.push(number);
    if (disagreements.has(comparable(line))) disagreement_lines.push(number);
    const confidence = scoredLines.get(comparable(line));
    if (confidence === null || confidence === undefined) unscored_contact_lines.push(number);
    else if (confidence < LOW_WORD_CONFIDENCE) low_confidence_lines.push(number);
  }
  return { contact_lines, low_confidence_lines, unscored_contact_lines, disagreement_lines };
}

function qualityNotice(quality, page) {
  if (!quality.contact_lines.length) return '';
  const locations = quality.contact_lines.slice(0, 20).join(', ') +
    (quality.contact_lines.length > 20 ? ` und ${quality.contact_lines.length - 20} weitere` : '');
  const scope = page === undefined ? 'Bild' : `Seite ${page}`;
  const confidence = quality.low_confidence_lines.length
    ? ' Mindestens eine dieser Zeilen enthält Wörter mit geringer Erkennungssicherheit.' : '';
  const unavailable = quality.unscored_contact_lines.length
    ? ' Für mindestens eine dieser Zeilen fehlen vergleichbare Wortkonfidenzen.' : '';
  const disagreement = quality.disagreement_lines?.length
    ? ` Die geometrische Nachprüfung lieferte abweichende Lesarten in OCR-Zeile(n) ${quality.disagreement_lines.slice(0, 20).join(', ')}; ` +
      'die exakten Kontaktzeichen sind nicht bestätigt.' : '';
  return `> OCR-Hinweis (${scope}): Kontaktwerte in OCR-Zeile(n) ${locations} können Zeichenfehler enthalten. ` +
    'Vor einer Nutzung mit den Originalen vergleichen. Auch hohe OCR-Konfidenzen bestätigen keine exakte Erkennung.' +
    confidence + unavailable + disagreement;
}

module.exports = Object.freeze({ isContactLine, contactQuality, qualityNotice });
