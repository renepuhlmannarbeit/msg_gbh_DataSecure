'use strict';

const TYPE_ALIASES = new Map([
  ['ORG', 'ORGANIZATION'], ['ORGANISATION', 'ORGANIZATION'], ['COMPANY', 'ORGANIZATION'],
  ['LOCATION', 'POSTAL_ADDRESS'], ['ADDRESS', 'STREET_ADDRESS'], ['DOB', 'DATE_OF_BIRTH'],
  ['CONTRACT_ID', 'REFERENCE_ID']
]);

function normalizedType(type) {
  const value = String(type || '').toLocaleUpperCase('en-US');
  return TYPE_ALIASES.get(value) || value;
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function sameFamily(a, b) {
  const left = normalizedType(a.type);
  const right = normalizedType(b.type);
  if (left === right) return true;
  const locations = new Set(['STREET_ADDRESS', 'POSTAL_ADDRESS']);
  return locations.has(left) && locations.has(right);
}

function safeRatio(numerator, denominator) {
  return denominator ? numerator / denominator : 1;
}

function round(value) {
  return Number(value.toFixed(6));
}

function evaluateDetector(corpus, detect) {
  const totals = { expected: 0, predicted: 0, tp: 0, fn: 0, fp: 0, weightedFn: 0 };
  const perType = new Map();
  const preservation = { expected: 0, retained: 0, lostByCategory: {} };
  let runtimeNs = 0n;
  let processedChars = 0;

  for (const sample of corpus) {
    const started = process.hrtime.bigint();
    const result = detect(sample);
    runtimeNs += process.hrtime.bigint() - started;
    processedChars += sample.source.length;
    const output = String(result.output || '');
    const predictions = (result.spans || [])
      .map((span) => ({ ...span, type: normalizedType(span.type) }))
      .filter((span) => Number.isInteger(span.start) && Number.isInteger(span.end) && span.start >= 0 && span.end > span.start && span.end <= sample.source.length);

    totals.expected += sample.entities.length;
    totals.predicted += predictions.length;
    for (const expected of sample.entities) {
      const type = normalizedType(expected.type);
      if (!perType.has(type)) perType.set(type, { expected: 0, predicted: 0, matchedPredictions: 0, tp: 0, fn: 0, fp: 0 });
      const metrics = perType.get(type);
      metrics.expected++;
      const covered = predictions.some((prediction) =>
        sameFamily(prediction, expected) && prediction.start <= expected.start && prediction.end >= expected.end
      );
      if (covered && !output.includes(expected.value)) {
        totals.tp++;
        metrics.tp++;
      } else {
        totals.fn++;
        totals.weightedFn += expected.severity || 1;
        metrics.fn++;
      }
    }

    for (const prediction of predictions) {
      const hit = sample.entities.some((expected) => sameFamily(prediction, expected) && overlaps(prediction, expected));
      if (!perType.has(prediction.type)) perType.set(prediction.type, { expected: 0, predicted: 0, matchedPredictions: 0, tp: 0, fn: 0, fp: 0 });
      const metrics = perType.get(prediction.type);
      metrics.predicted++;
      if (hit) {
        metrics.matchedPredictions++;
      } else {
        totals.fp++;
        metrics.fp++;
      }
    }

    for (const control of sample.preserved) {
      preservation.expected++;
      if (output.includes(control.value)) preservation.retained++;
      else preservation.lostByCategory[control.category] = (preservation.lostByCategory[control.category] || 0) + 1;
    }
  }

  const precision = safeRatio(totals.predicted - totals.fp, totals.predicted);
  const recall = safeRatio(totals.tp, totals.expected);
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  const types = {};
  for (const [type, value] of [...perType].sort(([a], [b]) => a.localeCompare(b))) {
    const typePrecision = safeRatio(value.matchedPredictions, value.predicted);
    const typeRecall = safeRatio(value.tp, value.expected);
    types[type] = {
      ...value,
      precision: round(typePrecision),
      recall: round(typeRecall),
      f1: round(typePrecision + typeRecall ? 2 * typePrecision * typeRecall / (typePrecision + typeRecall) : 0)
    };
  }
  const runtimeMs = Number(runtimeNs) / 1e6;
  return {
    samples: corpus.length,
    characters: processedChars,
    ...totals,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    preservation: {
      ...preservation,
      rate: round(safeRatio(preservation.retained, preservation.expected))
    },
    runtime_ms: round(runtimeMs),
    characters_per_second: runtimeMs ? Math.round(processedChars / (runtimeMs / 1000)) : null,
    types
  };
}

module.exports = { evaluateDetector, normalizedType };
