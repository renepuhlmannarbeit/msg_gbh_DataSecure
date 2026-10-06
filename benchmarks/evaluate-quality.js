'use strict';

// Independent reference-bound evaluator. No production detector imports.
// DP operates on occurrences, not global string presence. Exact unchanged
// tokens inside a sensitive range count as partial leaks, even after OCR.
function renderedText(value) {
  return String(value).replace(/&#(x[\da-f]+|\d+);/giu, (all, code) => {
    const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : all;
  }).replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replace(/\\([\\`*_[\]{}()#+.!|])/gu, '$1').normalize('NFKC');
}

function tokens(value) {
  const text = renderedText(value);
  return { text, words: [...text.matchAll(/\[(?:PERSON|UNTERNEHMEN|ORG|EMAIL|PHONE|IBAN|REDACTED)[A-Z0-9_]*\]|[\p{L}\p{N}]+/gu)]
    .map(match => ({ value: match[0], start: match.index, end: match.index + match[0].length })) };
}

// Leading/trailing presentation metadata may be inserted, but edits inside
// the aligned document body are charged. No fuzzy equality/diacritic removal.
function align(left, right) {
  const n = left.length, m = right.length;
  if ((n + 1) * (m + 1) > 4_000_000) throw new Error('QUALITY_ALIGNMENT_LIMIT');
  const costs = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = 1; i <= n; i++) costs[at(i, 0)] = i;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    costs[at(i, j)] = Math.min(costs[at(i - 1, j)] + 1, costs[at(i, j - 1)] + 1,
      costs[at(i - 1, j - 1)] + (left[i - 1] === right[j - 1] ? 0 : 1));
  }
  let end = m;
  for (let j = m - 1; j >= 0; j--) if (costs[at(n, j)] < costs[at(n, end)]) end = j;
  let i = n, j = end;
  const mapping = Array(n).fill(null), equal = Array(n).fill(false);
  while (i > 0) {
    if (j > 0 && costs[at(i, j)] === costs[at(i - 1, j - 1)] + (left[i - 1] === right[j - 1] ? 0 : 1)) {
      mapping[i - 1] = j - 1; equal[i - 1] = left[i - 1] === right[j - 1]; i--; j--;
    } else if (costs[at(i, j)] === costs[at(i - 1, j)] + 1) i--;
    else j--;
  }
  return { mapping, equal, edits: costs[at(n, end)], start: j, end };
}

function editDistance(a, b) {
  const left = [...a], right = [...b];
  if (left.length * right.length > 4_000_000) throw new Error('QUALITY_ALIGNMENT_LIMIT');
  let row = Uint32Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const next = new Uint32Array(right.length + 1); next[0] = i;
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1,
      row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    row = next;
  }
  return row[right.length];
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;
function bindReference(sample, extracted) {
  if (!sample || typeof sample.reference !== 'string' || !Array.isArray(sample.entities) || !Array.isArray(sample.preserve)) {
    throw new Error('QUALITY_REFERENCE_INVALID');
  }
  const privacyRedactions = sample.privacy_redactions ?? [];
  if (!Array.isArray(privacyRedactions)) throw new Error('QUALITY_PRIVACY_REFERENCE_INVALID');
  for (const range of [...sample.entities, ...sample.preserve, ...privacyRedactions]) {
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end <= range.start ||
        sample.reference.slice(range.start, range.end) !== range.value) throw new Error('QUALITY_REFERENCE_RANGE_INVALID');
  }
  for (const [index, range] of privacyRedactions.entries()) {
    const person = sample.entities.find(entity => entity.type === 'PERSON' &&
      entity.start === range.person_start && entity.end === range.person_end);
    // Only explicitly declared DS-012 salutations at this exact person may
    // be removed. Intervening qualifications must be independent preserve
    // controls; arbitrary prose/newlines cannot become a privacy exemption.
    if (range.policy !== 'DS-012' || range.category !== 'gendered_salutation' ||
        !['Frau', 'Herr', 'Mr.', 'Mrs.', 'Ms.'].includes(range.value) || !person ||
        person.start <= range.end || person.start - range.end > 96 ||
        sample.entities.some(entity => overlaps(entity, range)) || sample.preserve.some(control => overlaps(control, range)) ||
        privacyRedactions.slice(0, index).some(other => overlaps(other, range))) throw new Error('QUALITY_PRIVACY_REFERENCE_INVALID');
    const gap = sample.reference.slice(range.end, person.start);
    if (/[\r\n]/u.test(gap) || !/^[ \t]/u.test(gap) || !/[ \t]$/u.test(gap)) throw new Error('QUALITY_PRIVACY_REFERENCE_INVALID');
    for (let offset = range.end; offset < person.start; offset++) {
      if (!/[ \t]/u.test(sample.reference[offset]) && !sample.preserve.some(control =>
        control.category === 'qualification' && control.start >= range.end && control.end <= person.start &&
        control.start <= offset && control.end > offset)) throw new Error('QUALITY_PRIVACY_REFERENCE_INVALID');
    }
  }
  const source = tokens(sample.reference), actual = tokens(extracted);
  const comparison = align(source.words.map(word => word.value), actual.words.map(word => word.value));
  const bound = ranges => ranges.map(range => {
    const positions = source.words.map((word, index) => overlaps(word, range) ? index : -1).filter(index => index >= 0);
    const mapped = positions.map(index => comparison.mapping[index]).filter(index => index !== null);
    // Inserted OCR tokens between mapped endpoints still belong to the
    // observed entity corridor (Linden -> Lin den). Never drop them silently.
    const corridor = mapped.length ? Array.from({ length: mapped.at(-1) - mapped[0] + 1 }, (_, i) => mapped[0] + i) : [];
    const observed = corridor.map(index => actual.words[index]);
    const prefix = positions.length ? source.text.slice(range.start, source.words[positions[0]].start) : '';
    const suffix = positions.length ? source.text.slice(source.words[positions.at(-1)].end, range.end) : '';
    const first = observed[0]?.start ?? null, last = observed.at(-1)?.end ?? null;
    const actualStart = first === null ? null : first - (actual.text.slice(first - prefix.length, first) === prefix ? prefix.length : 0);
    const actualEnd = last === null ? null : last + (actual.text.slice(last, last + suffix.length) === suffix ? suffix.length : 0);
    const sameSurface = actualStart !== null && actual.text.slice(actualStart, actualEnd).replace(/\s+/gu, ' ') ===
      renderedText(range.value).replace(/\s+/gu, ' ');
    return { ...range, source_positions: positions, observed_positions: corridor, observed,
      complete: mapped.length === positions.length && positions.length > 0,
      exact: sameSurface && positions.length > 0 && corridor.length === positions.length && positions.every(index => comparison.equal[index]),
      actual_start: actualStart, actual_end: actualEnd };
  });
  const expectedWords = source.words.length;
  const sensitiveSource = new Set(bound(sample.entities).flatMap(entity => entity.source_positions));
  const factualSource = source.words.map((_, index) => index).filter(index => !sensitiveSource.has(index));
  const observedBody = actual.words.slice(comparison.start, comparison.end).map(word => word.value).join(' ');
  const referenceBody = source.words.map(word => word.value).join(' ');
  return { source, actual, comparison, entities: bound(sample.entities), preserve: bound(sample.preserve),
    privacy_redactions: bound(privacyRedactions),
    aligned: expectedWords > 0 && comparison.edits / expectedWords <= 0.4,
    extraction: { expected_words: expectedWords, edits: comparison.edits,
      lost_factual_words: factualSource.filter(index => !comparison.equal[index]).length,
      presentation_normalized_wer: expectedWords ? comparison.edits / expectedWords : null,
      presentation_normalized_cer: referenceBody.length ? editDistance(referenceBody, observedBody) / [...referenceBody].length : null } };
}

function outputStage(bound, output, status = 'not_evaluated') {
  if (typeof output !== 'string') return { status, evaluated: false, leaks: [], lost_content: [],
    sensitive_occurrences: null, leaking_occurrences: null };
  if (!output.trim()) return { status: 'empty_output', evaluated: false, leaks: [], lost_content: [],
    sensitive_occurrences: null, leaking_occurrences: null };
  const after = tokens(output), before = bound.actual;
  const changes = align(before.words.map(word => word.value), after.words.map(word => word.value));
  const privacyContexts = bound.privacy_redactions.filter(range => range.exact && range.observed_positions.length > 0);
  const privacyContextLeaks = privacyContexts.filter(range => range.observed_positions.some(index => changes.equal[index]))
    .map(range => ({ expected: range.value, policy: range.policy, category: range.category,
      start: range.actual_start, end: range.actual_end,
      remaining: range.observed_positions.filter(index => changes.equal[index]).map(index => before.words[index].value).join(' ') }));
  const eligible = bound.entities.filter(entity => entity.observed_positions.length > 0);
  const leaks = eligible.filter(entity => entity.observed_positions.some(index => changes.equal[index]))
    .map(entity => ({ type: entity.type, expected: entity.value, severity: entity.severity,
      start: entity.actual_start, end: entity.actual_end,
      remaining: entity.observed_positions.filter(index => changes.equal[index]).map(index => before.words[index].value).join(' ') }));
  // Free presentation prefixes/suffixes in the alignment must not exempt
  // copied identities. Allow a homonym only at a mapped factual occurrence.
  const labelled = new Set(bound.entities.flatMap(entity => entity.observed_positions));
  const factualAfter = new Set(before.words.flatMap((word, index) =>
    !labelled.has(index) && changes.equal[index] ? [changes.mapping[index]] : []));
  const checked = new Set();
  const coveredLeakPositions = new Set(eligible.flatMap(entity => entity.observed_positions
    .filter(index => changes.equal[index]).map(index => changes.mapping[index])));
  for (const entity of bound.entities) {
    const wanted = tokens(entity.value).words.map(word => word.value);
    const key = `${entity.type}:${wanted.join(' ')}`;
    if (!wanted.length || checked.has(key)) continue;
    checked.add(key);
    for (let i = 0; i <= after.words.length - wanted.length; i++) {
      const positions = wanted.map((_, offset) => i + offset);
      if (!wanted.every((value, offset) => after.words[i + offset].value === value) ||
          positions.every(position => factualAfter.has(position))) continue;
      const alreadyCounted = eligible.some(candidate => candidate.type === entity.type &&
        candidate.observed_positions.some(index => changes.equal[index] && positions.includes(changes.mapping[index])));
      if (!alreadyCounted) leaks.push({ type: entity.type, expected: entity.value, severity: entity.severity,
        output_start: after.words[i].start, output_end: after.words[i + wanted.length - 1].end,
        remaining: wanted.join(' '), introduced_or_unaligned: true });
      for (const position of positions) coveredLeakPositions.add(position);
    }
  }
  // Known PERSON components outside the body can also disclose identity.
  // These are labelled candidate leaks, not proof of general semantic privacy.
  for (const entity of bound.entities.filter(entity => entity.type === 'PERSON')) {
    const components = new Set(tokens(entity.value).words.map(word => word.value));
    for (const [index, word] of after.words.entries()) if (components.has(word.value) &&
        !factualAfter.has(index) && !coveredLeakPositions.has(index)) {
      leaks.push({ type: entity.type, expected: entity.value, severity: entity.severity,
        output_start: word.start, output_end: word.end, remaining: word.value, introduced_or_unaligned: true });
      coveredLeakPositions.add(index);
    }
  }
  const lost = bound.preserve.filter(control => control.complete && control.exact && (() => {
    const positions = control.observed_positions.map(index => changes.mapping[index]);
    if (positions.some(index => index === null) || control.observed_positions.some(index => !changes.equal[index])) return true;
    // Insertions inside an intact factual anchor still change its assertion.
    return positions.at(-1) - positions[0] + 1 !== positions.length;
  })()).map(control => ({ expected: control.value,
    start: control.actual_start, end: control.actual_end, category: control.category }));
  // Check all surviving source-reference words, not just a short anchor list.
  const requiredPrivacyWords = new Set(privacyContexts.flatMap(range => range.observed_positions));
  const factual = [...new Set(bound.comparison.mapping.filter(index => index !== null &&
    !labelled.has(index) && !requiredPrivacyWords.has(index)))];
  const lostFactualWords = factual.filter(index => !changes.equal[index]);
  const mappedAfter = new Set(changes.mapping.filter(index => index !== null));
  const addedFactualWords = after.words.map((_, index) => index).filter(index => index >= changes.start && index < changes.end &&
    !mappedAfter.has(index) && !/^\[(?:PERSON|UNTERNEHMEN|ORG|EMAIL|PHONE|IBAN|REDACTED)[A-Z0-9_]*\]$/u.test(after.words[index].value));
  return { status, evaluated: true, reference_alignment: bound.aligned ? 'within_limit' : 'manual_check_required',
    sensitive_occurrences: bound.entities.length, observed_sensitive_occurrences: eligible.length,
    unassessed_sensitive_occurrences: bound.entities.length - eligible.length, leaking_occurrences: leaks.length, leaks,
    weighted_leaks: leaks.reduce((sum, leak) => sum + leak.severity, 0),
    lost_content: lost, factual_words: factual.length, lost_factual_words: lostFactualWords.length,
    required_privacy_words_removed: [...requiredPrivacyWords].filter(index => !changes.equal[index]).length,
    privacy_context_leaks: privacyContextLeaks,
    retained_privacy_context_occurrences: privacyContextLeaks.length,
    unassessed_privacy_context_occurrences: bound.privacy_redactions.length - privacyContexts.length,
    added_factual_words: addedFactualWords.length,
    preservation_rate: factual.length ? (factual.length - lostFactualWords.length) / factual.length : null,
    by_entity: Object.fromEntries([...new Set(bound.entities.map(entity => entity.type))].sort().map(type => [type,
      { sensitive_occurrences: bound.entities.filter(entity => entity.type === type).length,
        leaking_occurrences: leaks.filter(entity => entity.type === type).length }])) };
}

function detectorStage(bound, spans) {
  if (!Array.isArray(spans)) return { evaluated: false, contract_error: 'QUALITY_SPANS_MISSING' };
  const keys = new Set(); let invalid = 0, duplicate = 0;
  const valid = spans.filter(span => {
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 ||
      span.end <= span.start || span.end > bound.actual.text.length || typeof span.type !== 'string') { invalid++; return false; }
    const key = `${span.type}:${span.start}:${span.end}`;
    if (keys.has(key)) { duplicate++; return false; } keys.add(key); return true;
  });
  const aliases = { EMAIL_ADDRESS: 'EMAIL', PHONE_NUMBER: 'PHONE', ORG: 'ORGANIZATION', PERSON_ALIAS: 'PERSON' };
  const type = value => aliases[value] || value;
  const expected = bound.entities.filter(entity => entity.complete);
  const effective = valid.filter(span => !valid.some(other => other !== span && type(span.type) === type(other.type) &&
    other.start <= span.start && other.end >= span.end && (other.start < span.start || other.end > span.end)));
  const exact = expected.filter(entity => effective.some(span => type(span.type) === entity.type &&
    span.start === entity.actual_start && span.end === entity.actual_end));
  const overbroad = effective.filter(span => !expected.some(entity => type(span.type) === entity.type &&
    span.start === entity.actual_start && span.end === entity.actual_end));
  const covered = new Uint8Array(bound.actual.text.length), wanted = new Uint8Array(bound.actual.text.length);
  for (const span of valid) covered.fill(1, span.start, span.end);
  for (const entity of expected) wanted.fill(1, entity.actual_start, entity.actual_end);
  let excess = 0;
  for (let i = 0; i < covered.length; i++) if (covered[i] && !wanted[i] && /[\p{L}\p{N}]/u.test(bound.actual.text[i])) excess++;
  return { evaluated: true, expected: expected.length, exact_matches: exact.length, invalid_spans: invalid,
    duplicate_spans: duplicate, nested_alternatives: valid.length - effective.length,
    extra_or_overbroad_spans: overbroad.length, excess_redacted_characters: excess,
    exact_recall: expected.length ? exact.length / expected.length : null,
    exact_precision: effective.length + invalid ? exact.length / (effective.length + invalid) : null };
}

function extractionMetrics(bound) {
  return { status: bound.aligned ? 'evaluated' : 'manual_check_required', ...bound.extraction,
    expected_entities: bound.entities.length, exact_entities: bound.entities.filter(entity => entity.exact).length,
    missing_entities: bound.entities.filter(entity => !entity.complete).length,
    changed_privacy_contexts: bound.privacy_redactions.filter(context => !context.exact).length,
    changed_preservation_controls: bound.preserve.filter(control => !control.exact).length,
    changed_entities: bound.entities.filter(entity => entity.complete && !entity.exact).length };
}

function evaluateQuality(sample, record) {
  const file = record.file || sample.id;
  if (typeof record.extracted !== 'string' || !record.extracted.trim()) return { id: sample.id, file,
    split: sample.split, format: record.format, ocr_variant: record.ocr_variant,
    extraction: { status: 'failed', error_code: record.extraction_error || 'QUALITY_EXTRACTION_MISSING' },
    detector_probe: { evaluated: false }, automatic: { evaluated: false, status: 'not_evaluated' },
    final: { evaluated: false, status: record.final_status || 'not_evaluated' }, findings: [
      { stage: 'extraction', code: record.extraction_error || 'QUALITY_EXTRACTION_MISSING', file, location: sample.location }] };
  const bound = bindReference(sample, record.extracted);
  const automatic = outputStage(bound, record.automatic, record.automatic_status);
  // The Markdown-only and privacy parsers can add different presentation
  // scaffolding (e.g. row numbers). Evaluate the actual final processing input
  // when a source-bound capture exists; never silently equate the two paths.
  const finalBound = typeof record.privacy_extracted === 'string' ? bindReference(sample, record.privacy_extracted) : bound;
  const rawPrivacyBound = typeof record.privacy_raw_extracted === 'string' ? bindReference(sample, record.privacy_raw_extracted) : finalBound;
  const final = outputStage(finalBound, record.final, record.final_status);
  const findings = [];
  const add = (stage, code, detail = {}) => findings.push({ stage, code, file, location: sample.location, ...detail });
  for (const [stage, input] of [['extraction', bound], ['privacy_extraction', finalBound],
    ...(typeof record.privacy_raw_extracted === 'string' ? [['raw_privacy_extraction', rawPrivacyBound]] : [])]) {
    if (!input.aligned) add(stage, 'QUALITY_ALIGNMENT_UNCERTAIN');
    for (const entity of input.entities) if (!entity.exact) add(stage, entity.complete ? 'OCR_ENTITY_CHANGED' : 'SOURCE_ENTITY_MISSING',
      { expected: entity.value, observed: entity.observed.map(word => word.value).join(' '), type: entity.type });
    for (const control of input.preserve) if (!control.exact) add(stage, 'SOURCE_CONTENT_MISSING_OR_CHANGED', { expected: control.value });
    for (const context of input.privacy_redactions) if (!context.exact) add(stage, 'SOURCE_PRIVACY_CONTEXT_CHANGED',
      { expected: context.value, policy: context.policy });
    if (input.extraction.lost_factual_words) add(stage, 'SOURCE_FACTUAL_WORDS_CHANGED_OR_LOST',
      { count: input.extraction.lost_factual_words });
  }
  for (const [stage, value] of [['automatic', automatic], ['final', final]]) {
    for (const leak of value.leaks || []) add(stage, 'SENSITIVE_TEXT_REMAINS', leak);
    for (const control of value.lost_content || []) add(stage, 'UNNECESSARY_REDACTION', control);
    for (const context of value.privacy_context_leaks || []) add(stage, 'REQUIRED_PRIVACY_CONTEXT_REMAINS', context);
    if (value.lost_factual_words > 0) add(stage, 'FACTUAL_WORDS_CHANGED_OR_LOST', { count: value.lost_factual_words });
    if (value.added_factual_words > 0) add(stage, 'UNEXPECTED_BODY_WORDS_ADDED', { count: value.added_factual_words });
    if (!value.evaluated) add(stage, value.status === 'empty_output' ? 'QUALITY_EMPTY_OUTPUT' : 'QUALITY_STAGE_NOT_EVALUATED',
      { reason: value.status || 'not_evaluated' });
  }
  return { id: sample.id, file, split: sample.split, format: record.format, ocr_variant: record.ocr_variant,
    extraction: extractionMetrics(bound),
    raw_privacy_extraction: { ...extractionMetrics(rawPrivacyBound), input_source: typeof record.privacy_raw_extracted === 'string'
      ? 'actual_pre_contact_review_extraction' : 'privacy_extraction_fallback' },
    privacy_extraction: { ...extractionMetrics(finalBound), input_source: typeof record.privacy_extracted === 'string'
      ? 'actual_privacy_extraction' : 'markdown_extraction_fallback' },
    detector_probe: detectorStage(bound, record.spans), automatic, final, review: record.review || null, findings };
}

function summarizeQuality(results) {
  const summarize = list => ({ documents: list.length, logical_documents: new Set(list.map(item => item.id)).size,
    extraction_failed: list.filter(item => item.extraction.status === 'failed').length,
    extraction_uncertain: list.filter(item => item.extraction.status === 'manual_check_required').length,
    extraction_changed_entities: list.reduce((sum, item) => sum + (item.extraction.changed_entities || 0), 0),
    extraction_missing_entities: list.reduce((sum, item) => sum + (item.extraction.missing_entities || 0), 0),
    extraction_changed_privacy_contexts: list.reduce((sum, item) => sum + (item.extraction.changed_privacy_contexts || 0), 0),
    extraction_changed_preservation_controls: list.reduce((sum, item) => sum + (item.extraction.changed_preservation_controls || 0), 0),
    extraction_lost_factual_words: list.reduce((sum, item) => sum + (item.extraction.lost_factual_words || 0), 0),
    raw_privacy_extraction: { ...Object.fromEntries(['changed_entities', 'missing_entities', 'changed_privacy_contexts',
      'changed_preservation_controls', 'lost_factual_words'].map(key => [key,
        list.reduce((sum, item) => sum + (item.raw_privacy_extraction?.[key] || 0), 0)])),
      actual_documents: list.filter(item => item.raw_privacy_extraction?.input_source === 'actual_pre_contact_review_extraction').length },
    privacy_extraction: { ...Object.fromEntries(['changed_entities', 'missing_entities', 'changed_privacy_contexts',
      'changed_preservation_controls', 'lost_factual_words'].map(key => [key,
        list.reduce((sum, item) => sum + (item.privacy_extraction?.[key] || 0), 0)])),
      failed_documents: list.filter(item => !item.privacy_extraction || item.privacy_extraction.status === 'failed').length,
      uncertain_documents: list.filter(item => item.privacy_extraction?.status === 'manual_check_required').length },
    stages: Object.fromEntries(['automatic', 'final'].map(stage => {
      const evaluated = list.filter(item => item[stage].evaluated);
      return [stage, { evaluated_documents: evaluated.length, unevaluated_documents: list.length - evaluated.length,
        documents_with_known_leaks: evaluated.filter(item => item[stage].leaking_occurrences > 0).length,
        leaking_occurrences: evaluated.reduce((sum, item) => sum + item[stage].leaking_occurrences, 0),
        sensitive_occurrences: evaluated.reduce((sum, item) => sum + item[stage].sensitive_occurrences, 0),
        unassessed_sensitive_occurrences: evaluated.reduce((sum, item) => sum + item[stage].unassessed_sensitive_occurrences, 0),
        lost_preservation_controls: evaluated.reduce((sum, item) => sum + item[stage].lost_content.length, 0),
        lost_factual_words: evaluated.reduce((sum, item) => sum + item[stage].lost_factual_words, 0),
        added_factual_words: evaluated.reduce((sum, item) => sum + item[stage].added_factual_words, 0),
        required_privacy_words_removed: evaluated.reduce((sum, item) => sum + (item[stage].required_privacy_words_removed || 0), 0),
        retained_privacy_context_occurrences: evaluated.reduce((sum, item) => sum + (item[stage].retained_privacy_context_occurrences || 0), 0),
        unassessed_privacy_context_occurrences: evaluated.reduce((sum, item) => sum + (item[stage].unassessed_privacy_context_occurrences || 0), 0) }];
    })) });
  const grouped = key => Object.fromEntries([...new Set(results.map(item => item[key] || 'none'))].sort()
    .map(value => [value, summarize(results.filter(item => (item[key] || 'none') === value))]));
  return { ...summarize(results), by_format: grouped('format'), by_ocr_variant: grouped('ocr_variant'), by_split: grouped('split'),
    by_entity: Object.fromEntries([...new Set(results.flatMap(item => Object.keys(item.final.by_entity || item.automatic.by_entity || {})))].sort()
      .map(type => [type, Object.fromEntries(['automatic', 'final'].map(stage => [stage,
        { sensitive_occurrences: results.reduce((sum, item) => sum + (item[stage].by_entity?.[type]?.sensitive_occurrences || 0), 0),
          leaking_occurrences: results.reduce((sum, item) => sum + (item[stage].by_entity?.[type]?.leaking_occurrences || 0), 0) }]))])) };
}

function qualityHasFindings(report) {
  const summary = report.summary, final = summary.stages.final;
  const privacyInput = summary.privacy_extraction;
  return Boolean(report.fatal_error || !report.full_corpus_executed || final.unevaluated_documents ||
    final.documents_with_known_leaks || final.lost_factual_words || final.unassessed_sensitive_occurrences ||
    final.added_factual_words || summary.extraction_failed || summary.extraction_uncertain || summary.extraction_missing_entities ||
    final.retained_privacy_context_occurrences || final.unassessed_privacy_context_occurrences ||
    !privacyInput || privacyInput.failed_documents || privacyInput.uncertain_documents || privacyInput.changed_entities ||
    privacyInput.missing_entities || privacyInput.changed_privacy_contexts || privacyInput.changed_preservation_controls || privacyInput.lost_factual_words ||
    summary.extraction_changed_privacy_contexts || summary.extraction_changed_entities ||
    summary.extraction_changed_preservation_controls || summary.extraction_lost_factual_words);
}

module.exports = { renderedText, tokens, align, editDistance, bindReference, evaluateQuality, summarizeQuality, qualityHasFindings };
