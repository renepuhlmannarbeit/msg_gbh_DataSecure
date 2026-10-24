'use strict';

// Parser-local text projection, not a caller-supplied privacy capability. The
// source parser owns table scope, active MC branches and literal text decoding.
const { isPersonFieldLabel, CONTENT_PERSON_FIELD_POLICY } = require('./core/person-field-policy');
const { normalizeSensitiveLabel, PHONE_LABEL_RE, DATE_OF_BIRTH_LABEL_RE,
  DE_TAX_LABEL_RE, ID_LABEL_HEADER_RE, CREDENTIAL_LABEL_HEADER_RE, effectiveTableFieldLabel } = require('./privacy/base');

const CONTENT = 'Inhalt';
const PROTECTED = 'Geschützter Tabellenwert';
const MAX_ROWS = 200000;
const MAX_ROW_NUMBER = 1048576;
const MAX_COLUMNS = 16384;
const MAX_CELLS = 200000;
const MAX_VISITED_SLOTS = 200000;
const MAX_CHARACTERS = 8000000;
const organization = /^(?:Firma|Unternehmen|Organisation|Organization|Company(?:\s+Name)?|Employer|Arbeitgeber):?$/iu;
// A positive, closed heading vocabulary is a subheader boundary, not a name
// guess based on case, token count or value length. Unknown neighbours of a
// sensitive key remain ambiguous instead of being declared harmless headings.
const ordinaryHeading = /^(?:Inhalt|Fachtext|Beschreibung|Technologie(?:n)?|Kenntnisse|Skills?|Rolle|Position|Zeitraum|Status|Anzahl|Wert|Bezeichnung|Kommentar):?$/iu;
const whole = regex => new RegExp(`^(?:${regex.source})$`, regex.flags.replace(/[gy]/gu, ''));
const phone = whole(PHONE_LABEL_RE), birth = whole(DATE_OF_BIRTH_LABEL_RE), tax = whole(DE_TAX_LABEL_RE);
const otherSensitive = /^(?:E-?Mail|Email|IBAN|BIC|Anschrift|Adresse|Address|Steuer-ID|Geburtsdatum):?$/iu;

function invalid(limit = false) {
  throw Object.assign(new Error('Die lokale Tabellenprojektion ist nicht eindeutig lesbar.'),
    { code: limit ? 'OFFICE_TABLE_PROJECTION_LIMIT' : 'OFFICE_TABLE_PROJECTION_INVALID' });
}

function labelText(text) {
  return normalizeSensitiveLabel(text.replace(/\s+/gu, ' ').trim());
}

function fieldLabel(text) {
  // Join only an entire, exact closed label, never arbitrary value text. A
  // narrow header may split Vor/name or Geburts/datum over explicit breaks.
  const candidates = [effectiveTableFieldLabel(labelText(text))];
  if (/[\r\n]/u.test(text)) candidates.push(labelText(text.replace(/\r\n|\r|\n/gu, '')));
  for (const value of candidates) {
    if (organization.test(value)) return 'Unternehmen';
    if (/^(?:Kunde|Kundin):?$/iu.test(value)) return PROTECTED; // person OR company
    if (isPersonFieldLabel(value, CONTENT_PERSON_FIELD_POLICY)) return 'Name';
    if (phone.test(value)) return 'Telefon';
    if (birth.test(value)) return 'Geburtsdatum';
    if (tax.test(value)) return 'Steuer-ID';
    if (ID_LABEL_HEADER_RE.test(value) || CREDENTIAL_LABEL_HEADER_RE.test(value) || otherSensitive.test(value)) return PROTECTED;
  }
  return null;
}

function embeddedField(text) {
  // A label AND value in a source cell are not a reusable column heading.
  // Preserve/protect that whole actual cell, without copying its label or
  // assigning its following rows the label's person/organisation authority.
  const colon = /^([^:\r\n]+):[^\S\r\n]*([\s\S]+)$/u.exec(text.trim());
  if (colon && colon[2].trim() && fieldLabel(colon[1])) return true;
  const newline = /\r\n|\r|\n/u.exec(text);
  return Boolean(newline && fieldLabel(text.slice(0, newline.index)) &&
    text.slice(newline.index + newline[0].length).trim());
}

function prepare(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) invalid(rows?.length > MAX_ROWS);
  const prepared = [], byNumber = new Map(), identities = new WeakSet();
  let count = 0, characters = 0, width = 0, previous = -1, visited = 0;
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.number) || row.number < 1 || row.number > MAX_ROW_NUMBER || row.number <= previous ||
        typeof row.header !== 'boolean' || !Array.isArray(row.cells)) invalid();
    previous = row.number;
    const cells = [], rowOwners = new Map(); let previousColumn = -1, maximumEnd = 0;
    for (const source of row.cells) {
      if (++count > MAX_CELLS) invalid(true);
      if (!source || !Number.isSafeInteger(source.column) || source.column < 0 || source.column < previousColumn ||
          !Number.isSafeInteger(source.span) || source.span < 1 || typeof source.text !== 'string' ||
          !(source.continuationOf === null || Number.isSafeInteger(source.continuationOf) && source.continuationOf >= 0)) invalid();
      if (identities.has(source)) invalid();
      identities.add(source);
      const end = source.column + source.span;
      if (!Number.isSafeInteger(end) || end > MAX_COLUMNS) invalid(true);
      visited += source.span;
      if (visited > MAX_VISITED_SLOTS) invalid(true);
      previousColumn = source.column; maximumEnd = Math.max(maximumEnd, end);
      characters += source.text.length;
      if (characters > MAX_CHARACTERS) invalid(true);
      const field = fieldLabel(source.text);
      const cell = { source, field, embedded: embeddedField(source.text), ordinary: ordinaryHeading.test(labelText(source.text)), end,
        continuation: null, row };
      if (source.continuationOf !== null) {
        const reference = source.continuationOf === row.number ? rowOwners : byNumber.get(source.continuationOf)?.owners;
        const owner = reference?.get(source.column);
        // continuationOf denotes the exact row.number of a preceding owner,
        // not a physical-cell ordinal or an interchangeable zero-based index.
        if (!owner) invalid();
        for (let column = source.column; column < end; column++) if (reference.get(column) !== owner) invalid();
        cell.continuation = owner;
      }
      const owner = cell.continuation || cell;
      for (let column = source.column; column < end; column++) {
        if (rowOwners.has(column) && rowOwners.get(column) !== owner) invalid();
        rowOwners.set(column, owner);
      }
      cells.push(cell);
    }
    width = Math.max(width, maximumEnd);
    const normalized = { source: row, number: row.number, header: row.header, cells, owners: rowOwners };
    prepared.push(normalized); byNumber.set(row.number, normalized);
  }
  return { rows: prepared, width };
}

function protectedLabel(value) { return value !== CONTENT; }

function resolve(owners, cell, epoch) {
  const labels = new Set(); let uncovered = false;
  for (let column = cell.source.column; column < cell.end; column++) {
    const owner = owners.get(column);
    if (owner) labels.add(owner.epoch === epoch ? owner.label : protectedLabel(owner.label) ? PROTECTED : CONTENT);
    else uncovered = true;
  }
  const sensitive = [...labels].some(protectedLabel);
  if (!sensitive) return CONTENT;
  return !uncovered && labels.size === 1 ? [...labels][0] : PROTECTED;
}

function makePlan(model) {
  const plan = new Map(), owners = new Map(), sensitiveCorridors = new Map();
  // A two-cell, exact vertical label rectangle is stronger than a guessed
  // same-row key. Only empty, actually bound continuations may reuse its key.
  const verticalKeys = new Set();
  for (const row of model.rows) for (const cell of row.cells) if (cell.continuation && !cell.source.text.trim()) {
    const root = cell.continuation;
    if (root.field && !root.row.header) verticalKeys.add(root);
  }
  let previousRow = null, headerBand = false, haveOwners = false, epoch = 0;
  for (const row of model.rows) {
    // Only an actual source header role can establish a new factual boundary.
    // A word such as Status in an unmarked data row must not silently erase
    // an earlier Name column. Remember uncertain field evidence separately
    // from the best display/header hypothesis, including real nonanchor text.
    if(row.header && !headerBand)sensitiveCorridors.clear();
    for(const cell of row.cells)for(let column=cell.source.column;column<cell.end;column++){
      const previous=sensitiveCorridors.get(column);
      if(row.header&&!cell.continuation&&(cell.field||cell.ordinary)){
        if(!previous||cell.source.span<=previous.span)sensitiveCorridors.set(column,{label:cell.field||CONTENT,span:cell.source.span});
      }else if(cell.field){
        sensitiveCorridors.set(column,{label:previous&&previous.label!==cell.field?PROTECTED:cell.field,span:cell.source.span});
      }
    }
    const gap = previousRow !== null && row.number !== previousRow + 1;
    if (gap) {
      // A hole cannot establish precise field ownership. Preserve only the
      // uncertainty of a previous sensitive corridor, never a typed Name link.
      epoch++;
      headerBand = false;
    }
    previousRow = row.number;
    const local = new Map(row.cells.map(cell => [cell, cell.embedded ? PROTECTED : resolve(owners, cell, epoch)]));
    const verticalKey = row.cells.length === 2 && row.cells[1].source.column === row.cells[0].end &&
      !gap && !row.header && !row.cells[1].field && !row.cells[1].ordinary &&
      (verticalKeys.has(row.cells[0]) ? row.cells[0] :
        !row.cells[0].source.text.trim() && verticalKeys.has(row.cells[0].continuation) ? row.cells[0].continuation : null);
    if (verticalKey) {
      local.set(row.cells[0], CONTENT);
      local.set(row.cells[1], verticalKey.field);
      headerBand = false;
    } else {
      const knownHeadings = row.cells.length > 0 && row.cells.every(cell =>
        !cell.continuation && (cell.field || cell.ordinary)) && row.cells.some(cell => cell.field);
      const changedHeader = haveOwners && knownHeadings && row.cells.some(cell =>
        (cell.field || CONTENT) !== resolve(owners, cell, epoch));
      const unownedField = row.cells.some(cell => {
        if (!cell.field || cell.continuation) return false;
        for (let column = cell.source.column; column < cell.end; column++) if (!owners.has(column)) return true;
        return false;
      });
      const isHeader = row.header || changedHeader || unownedField ||
        !haveOwners && row.cells.some(cell => cell.field && !cell.continuation);
      // A nonempty continuation never becomes a repeated header/key merely
      // because its origin carried a sensitive label. Keep its actual text.
      for (const cell of row.cells) if (cell.continuation?.field && cell.source.text.trim()) local.set(cell, PROTECTED);
      const ambiguous = new Set(); let key = null, previousEnd = -1;
      for (const cell of row.cells) {
        if (cell.source.column !== previousEnd) key = null;
        const effectiveKey = cell.field && !cell.continuation ? cell.field
          : !cell.source.text.trim() ? cell.continuation?.field : null;
        if (effectiveKey) {
          key = cell;
        } else if (cell.ordinary && (row.header || changedHeader || !key)) {
          key = null;
        } else if (key && cell.source.text.trim()) {
          // Both a data-bearing key/value row and an unmarked header row are
          // possible. Protect this exact candidate corridor without inventing
          // a person identity or relying on whether Qvx looks like a name.
          ambiguous.add(cell); local.set(cell, PROTECTED);
        }
        previousEnd = cell.end;
      }
      if (isHeader) {
        // A fully explicit/closed heading change starts a new section. A
        // newly reached disjoint field corridor must not erase another still
        // bound column merely because both occur in one sparse source table.
        if (!headerBand && (row.header || changedHeader || !haveOwners)) owners.clear();
        for (const cell of row.cells) {
          if (cell.continuation) continue; // retain its payload, never invent a second header owner
          const prior = owners.get(cell.source.column);
          const parts = prior && prior.epoch === epoch && prior.span === cell.source.span && prior.parts.length < 3
            ? [...prior.parts, cell.source.text] : [cell.source.text];
          const combined = fieldLabel(parts.join(' ')) || fieldLabel(parts.join(''));
          // Own inline-field payload is protected, but is not proof of a
          // reusable column header. Only an earlier structural owner is.
          const priorLabel = resolve(owners, cell, epoch);
          let label = cell.field || combined || (ambiguous.has(cell) ? PROTECTED : CONTENT);
          if (!cell.field && !combined && !cell.ordinary && protectedLabel(priorLabel)) {
            label = PROTECTED;
            local.set(cell, PROTECTED); // value-bearing/unknown sensitive subheader
          } else if (!ambiguous.has(cell) && !cell.embedded) local.set(cell, CONTENT);
          const owner = { label, span: cell.source.span, parts, epoch };
          for (let column = cell.source.column; column < cell.end; column++) {
            // A closer, narrower subheader owns its precise interval. A new
            // broader group does not overwrite an already specific column.
            if (!owners.has(column) || owner.span <= owners.get(column).span) owners.set(column, owner);
          }
        }
        haveOwners = true; headerBand = true;
      } else headerBand = false;
    }
    for (const cell of row.cells){
      let label=local.get(cell);
      if(!row.header&&!cell.field&&cell.source.text.trim()){
        for(let column=cell.source.column;column<cell.end;column++){
          const evidence=sensitiveCorridors.get(column)?.label;
          if(evidence&&evidence!==CONTENT&&(label===CONTENT||evidence===PROTECTED||label!==evidence)){label=PROTECTED;break;}
        }
      }
      plan.set(cell.source,label);
    }
  }
  return plan;
}

function tableFieldPlan(rows) { return makePlan(prepare(rows)); }

function oneCell(value, escapeCell) {
  const escaped = escapeCell(value);
  if (typeof escaped !== 'string' || /[\r\n]/u.test(escaped)) invalid();
  let slashes = 0;
  for (const character of escaped) {
    if (character === '|' && slashes % 2 === 0) invalid();
    slashes = character === '\\' ? slashes + 1 : 0;
  }
  return escaped;
}

function renderTableCells(rows, options) {
  if (!options || typeof options.escapeCell !== 'function' ||
      options.coordinates !== undefined && typeof options.coordinates !== 'function') invalid();
  const model = prepare(rows), plan = makePlan(model), output = [];
  let characters = 0;
  for (const row of model.rows) for (const { source: cell } of row.cells) {
    if (!cell.text.trim()) continue;
    const coordinates = options.coordinates ? options.coordinates(row.source, cell)
      : `Zeile ${row.number} · ` + (cell.span === 1 ? `Spalte ${cell.column + 1}`
        : `Spalten ${cell.column + 1}–${cell.column + cell.span}`) +
        (cell.continuationOf === null ? '' : ` · verbunden mit Zeile ${cell.continuationOf}`);
    if (typeof coordinates !== 'string' || !coordinates.trim()) invalid();
    let label=plan.get(cell);
    if(options.sourceColumnLabels!==undefined){
      if(!(options.sourceColumnLabels instanceof WeakMap))invalid();
      const bound=options.sourceColumnLabels.get(cell);
      // A parser-owned, source-bound column role can only strengthen the
      // existing actual-cell plan, never declassify a protected source value.
      if(bound!==undefined){
        if(!['Name','Unternehmen','Telefon','Geburtsdatum','Steuer-ID',PROTECTED].includes(bound))invalid();
        label=label===CONTENT?bound:label===bound?label:PROTECTED;
      }
    }
    const section = `${oneCell(coordinates, options.escapeCell)}\n\n| ${label} |\n| --- |\n| ${oneCell(cell.text, options.escapeCell)} |`;
    characters += section.length + (output.length ? 2 : 0);
    if (characters > MAX_CHARACTERS) invalid(true);
    output.push(section);
  }
  return output.join('\n\n');
}

// Closed label normalization only, not a source/owner/privacy capability.
// The format parser must separately prove any metadata→actual-cell relation.
module.exports = Object.freeze({ renderTableCells, tableFieldPlan, sourceColumnFieldLabel:fieldLabel });
