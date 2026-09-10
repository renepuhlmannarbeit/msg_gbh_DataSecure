'use strict';

const path = require('path');
const { readZip, ZipError } = require('./zip-reader');
const { createXlsxReader } = require('./xlsx-structure');
const { readXml } = require('./xml-reader');

const MAX_EMBEDDED_DEPTH = 3;
const MAX_EMBEDDED_DOCUMENTS = 20;
const MAX_EMBEDDED_BYTES = 50 * 1024 * 1024;
const MAX_EMBEDDED_EXPANDED_BYTES = 100 * 1024 * 1024;
const SUPPORTED_EMBEDDED = /^(?:word|xl|ppt)\/embeddings\/[^/]+\.(docx|xlsx|pptx)$/i;

function xmlDecode(s='') {
  const decodeCodePoint = (digits, radix) => {
    const value = Number.parseInt(digits, radix);
    // Deliberately stricter than XML 1.0 for C1 controls: those characters can
    // split identifiers without being visible in Markdown or residual scans.
    if (!Number.isSafeInteger(value) || value <= 0 || value > 0x10ffff ||
        (value >= 0xd800 && value <= 0xdfff) ||
        (value < 0x20 && ![0x09, 0x0a, 0x0d].includes(value)) ||
        (value >= 0x7f && value <= 0x9f)) {
      const error = new Error('OOXML enthält ein unzulässiges XML-Zeichen.');
      error.code = 'OOXML_XML_CHARACTER_INVALID';
      throw error;
    }
    return String.fromCodePoint(value);
  };
  const source = String(s);
  // XML defines exactly five named entities. Leaving an unknown entity or a
  // naked ampersand in extracted text can split identifiers before the PII
  // gate and must therefore fail closed.
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/iu.test(source)) {
    const error = new Error('OOXML enthält eine ungültige XML-Entität.');
    error.code = 'OOXML_XML_CHARACTER_INVALID';
    throw error;
  }
  return source
    .replace(/&#x([0-9a-f]+);/gi, (_,h)=>decodeCodePoint(h,16))
    .replace(/&#([0-9]+);/g, (_,d)=>decodeCodePoint(d,10))
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
}

const OFFICE_RELATIONSHIP_NAMESPACES = Object.freeze([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/'
]);
const PACKAGE_CORE_PROPERTIES_RELATIONSHIP =
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
function relationshipKind(value) {
  const source = String(value || '');
  if (source === PACKAGE_CORE_PROPERTIES_RELATIONSHIP) return 'core-properties';
  for (const namespace of OFFICE_RELATIONSHIP_NAMESPACES) {
    if (!source.startsWith(namespace)) continue;
    const name = source.slice(namespace.length);
    return /^[A-Za-z][A-Za-z0-9_-]*$/u.test(name) ? name : null;
  }
  return null;
}
function stripTags(s='') { return xmlDecode(String(s).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim(); }
function textTags(xml, tag='a:t') {
  const re = new RegExp(`<${tag.replace(':','\\:')}\\b[^>]*>([\\s\\S]*?)<\\/${tag.replace(':','\\:')}>`,'gi');
  const out=[]; let m; while((m=re.exec(xml))) out.push(xmlDecode(m[1])); return out;
}
function contentType(name) {
  const e=path.extname(name).toLowerCase();
  return ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.bmp':'image/bmp','.gif':'image/gif','.tif':'image/tiff','.tiff':'image/tiff','.webp':'image/webp','.svg':'image/svg+xml','.emf':'image/x-emf','.wmf':'image/x-wmf'})[e] || 'application/octet-stream';
}
function mediaAttachments(entries, prefix, allowedParts = null) {
  const out=[];
  for(const [name,data] of entries) if(name.startsWith(prefix) && /\.(png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i.test(name)) {
    if (allowedParts && !allowedParts.has(name)) continue;
    out.push({ type:'image', mimeType:contentType(name), data:data.toString('base64'), name:path.basename(name), extension:path.extname(name).slice(1).toLowerCase(), source_part:name });
  }
  return out;
}
const CORE_PROPERTIES = [
  ['dc:title','Titel'],['dc:subject','Betreff'],['dc:creator','Autor'],
  ['cp:keywords','Schlagwörter'],['dc:description','Beschreibung'],
  ['cp:lastModifiedBy','Zuletzt geändert von'],['cp:category','Kategorie'],
  ['cp:contentStatus','Inhaltsstatus'],['dc:identifier','Kennung'],
  ['dc:language','Sprache'],['cp:lastPrinted','Zuletzt gedruckt'],
  ['dcterms:created','Erstellt'],['dcterms:modified','Geändert'],
  ['cp:revision','Revision'],['cp:version','Version']
];
const APP_PROPERTIES = [
  ['Manager','Manager'],['Company','Unternehmen'],['Template','Vorlage'],
  ['HyperlinkBase','Hyperlink-Basis'],['Application','Anwendung'],['AppVersion','Anwendungsversion']
];
// Text from an Office document is literal content, unlike an input .md file.
// The extraction-only renderer escapes Markdown/HTML rather than allowing its
// punctuation to become new markup. It preserves significant whitespace.
function extractionText(value, inCell = false) {
  let text = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}()#+.!|])/g, '\\$1')
    .replace(/\t/g, '&#9;').replace(/\r/g, '&#13;');
  text = text.replace(/^ +| +$/gm, (spaces) => '&#32;'.repeat(spaces.length))
    .replace(/ {2,}/g, (spaces) => ' ' + '&#32;'.repeat(spaces.length - 1));
  return text.replace(/\n/g, inCell ? '<br>' : '  \n');
}
function metadataSection(entries, sourcePart, fields, options = {}) {
  const data=entries.get(sourcePart); if(!data)return null; const xml=data.toString('utf8'), lines=[];
  for(const [tag,label] of fields){const value=textTags(xml,tag).map(item=>options.preserveText ? extractionText(item) : String(item).replace(/\s+/g,' ').trim()).filter(Boolean).join(' | ');if(value)lines.push(`- ${label}: ${value}`);}
  return lines.length?{kind:'metadata',source_part:sourcePart,markdown:`## Dokumentmetadaten\n\n${lines.join('\n')}`}:null;
}
function customMetadataSection(entries, options = {}) {
  const sourcePart='docProps/custom.xml',data=entries.get(sourcePart);if(!data)return null;
  const xml=data.toString('utf8'),lines=[];let match;const properties=/<property\b([^>]*)>([\s\S]*?)<\/property>/gi;
  const scalar=/^\s*<vt:(lpwstr|bstr|i1|i2|i4|i8|int|ui1|ui2|ui4|ui8|uint|r4|r8|decimal|bool|filetime|date|cy|error)\b[^>]*>([\s\S]*?)<\/vt:\1>\s*$/i;
  while((match=properties.exec(xml))){const rawName=xmlDecode(/\bname=["']([^"']+)["']/i.exec(match[1])?.[1]||'');const name=options.preserveText ? extractionText(rawName) : rawName.trim();const valueMatch=scalar.exec(match[2]);const value=valueMatch?(options.preserveText ? extractionText(xmlDecode(valueMatch[2])) : stripTags(valueMatch[2])):'';if(name&&value)lines.push(`- ${name}: ${value}`);}
  return lines.length?{kind:'metadata',source_part:sourcePart,markdown:`## Benutzerdefinierte Dokumentmetadaten\n\n${lines.join('\n')}`}:null;
}
function customMetadataWarnings(entries) {
  const data=entries.get('docProps/custom.xml');if(!data)return[];const xml=data.toString('utf8');let unsupported=0,match;
  const properties=/<property\b[^>]*>([\s\S]*?)<\/property>/gi;
  const scalar=/^\s*<vt:(lpwstr|bstr|i1|i2|i4|i8|int|ui1|ui2|ui4|ui8|uint|r4|r8|decimal|bool|filetime|date|cy|error)\b[^>]*>[\s\S]*?<\/vt:\1>\s*$/i;
  while((match=properties.exec(xml)))if(!scalar.test(match[1]))unsupported++;
  return unsupported?[`OOXML enthält ${unsupported} nicht unterstützte benutzerdefinierte Metadatenwerte; Freigabe wird blockiert.`]:[];
}
function metadataSections(entries, options = {}) {
  return [
    metadataSection(entries,'docProps/core.xml',CORE_PROPERTIES,options),
    metadataSection(entries,'docProps/app.xml',APP_PROPERTIES,options),
    customMetadataSection(entries,options)
  ].filter(Boolean);
}
function relMap(entries, relPath, baseDir) {
  const buf=entries.get(relPath); if(!buf) return new Map();
  const xml=buf.toString('utf8'); const out=new Map(); let m;
  const re=/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi;
  while((m=re.exec(xml))) {
    const attrs=m[1], id=/\bId="([^"]+)"/i.exec(attrs)?.[1], target=/\bTarget="([^"]+)"/i.exec(attrs)?.[1];
    if(id&&target) out.set(id, path.posix.normalize(path.posix.join(baseDir,target)));
  }
  return out;
}
function escapeMarkdownTableCell(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}
function renderPptTable(table, options = {}) {
  // DrawingML tables have their visible cells in a:tc/a:txBody/a:t. Render
  // them structurally instead of flattening them into slide prose.  The
  // caller has already established that the containing slide is reachable.
  const rows = []; let row;
  const rowRe = /<a:tr\b[\s\S]*?<\/a:tr>/gi;
  while ((row = rowRe.exec(table))) {
    const cells = []; let cell;
    const cellRe = /<a:tc\b[\s\S]*?<\/a:tc>/gi;
    while ((cell = cellRe.exec(row[0]))) cells.push(options.preserveText ? extractionText(drawingText(cell[0]), true) : escapeMarkdownTableCell(textTags(cell[0], 'a:t').join('\n')));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return '';
  const cols = rows.reduce((maximum, cells) => Math.max(maximum, cells.length), 0);
  const normalized = rows.map((cells) => Array.from({ length: cols }, (_, index) => cells[index] || ''));
  if (options.preserveText) normalized.unshift(Array.from({ length: cols }, (_, index) => `Spalte ${index + 1}`));
  return '| ' + normalized[0].join(' | ') + ' |\n| ' + normalized[0].map(() => '---').join(' | ') + ' |' +
    (normalized.length > 1 ? '\n' + normalized.slice(1).map((cells) => '| ' + cells.join(' | ') + ' |').join('\n') : '');
}
function pptSlideTableSections(xml, sourcePart, options = {}) {
  const source = String(xml);
  const opened = (source.match(/<a:tbl\b/gi) || []).length;
  const closed = (source.match(/<\/a:tbl\s*>/gi) || []).length;
  const tables = []; let match;
  const tableRe = /<a:tbl\b[\s\S]*?<\/a:tbl>/gi;
  while ((match = tableRe.exec(source))) {
    const markdown = renderPptTable(match[0], options);
    // An empty but structurally valid table has no text to emit. It is not a
    // coverage failure; a non-empty/unbalanced table is handled by the caller.
    if (markdown) tables.push({ kind: 'table', source_part: sourcePart, markdown: `## Tabelle\n\n${markdown}` });
  }
  const balanced = opened === closed;
  return {
    tables,
    // If a table is truncated, do not let its cells fall back into plain
    // slide text. The whole tail is withheld until a complete parser exists.
    prose: balanced ? source.replace(tableRe, '') : source.replace(/<a:tbl\b[\s\S]*$/i, ''),
    issues: balanced && tables.length <= opened ? 0 : 1
  };
}
const WORDPROCESSINGML_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main'
]);
const MARKUP_COMPATIBILITY_NAMESPACE = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
// The structural renderer below understands the Word 2010 text-box shape
// vocabulary. Markup-compatibility choices are selected from namespace URIs,
// never from attacker-controlled prefix spelling. Every other choice uses its
// declared fallback or stops safely when no fallback exists.
const SUPPORTED_WORD_MARKUP_CHOICE_NAMESPACES = new Set([
  'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'
]);
const OFFICE_MATH_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/math',
  'http://purl.oclc.org/ooxml/officeDocument/math'
]);
const DRAWINGML_WORDPROCESSING_NAMESPACE = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const WORD_2010_DRAWING_NAMESPACE = 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing';
// These DrawingML elements carry layout coordinates or alignment tokens, not
// document prose. Their text must not be mistaken for hidden user content.
// Namespace normalization below prevents a hostile prefix rebinding from
// acquiring this exception.
const NON_CONTENT_DRAWING_TEXT = new Set([
  'wp:align', 'wp:posOffset', 'wp14:pctHeight', 'wp14:pctWidth'
]);
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
// Revision properties are content-bearing too: old paragraph styles must not
// overwrite current styles, and author/history metadata cannot vanish silently.
// The renderer and coverage gate share this exact namespace-normalized set.
const BLOCKED_WORD_CONTENT = new Set([
  'instrText', 'fldSimple', 'delText', 'del', 'ins', 'moveFrom', 'moveTo',
  'pPrChange', 'rPrChange', 'sectPrChange', 'tblGridChange', 'tblPrChange',
  'tblPrExChange', 'trPrChange', 'tcPrChange', 'numberingChange',
  'cellIns', 'cellDel', 'cellMerge', 'moveFromRangeStart', 'moveFromRangeEnd',
  'moveToRangeStart', 'moveToRangeEnd', 'customXmlInsRangeStart', 'customXmlInsRangeEnd',
  'customXmlDelRangeStart', 'customXmlDelRangeEnd', 'customXmlMoveFromRangeStart',
  'customXmlMoveFromRangeEnd', 'customXmlMoveToRangeStart', 'customXmlMoveToRangeEnd'
].map(name => `w:${name}`).concat(['m:oMath', 'm:oMathPara', 'm:t']));

function normalizedWordQName(qname, namespaces, attribute = false) {
  const parts = String(qname).split(':');
  if (parts.length > 2) throw wordStructureError();
  const prefix = parts.length === 2 ? parts[0] : '';
  const localName = parts.at(-1);
  const namespace = prefix ? namespaces.get(prefix) : (attribute ? '' : (namespaces.get('') || ''));
  if (prefix && !namespace) throw wordStructureError();
  if (WORDPROCESSINGML_NAMESPACES.has(namespace)) return `w:${localName}`;
  if (namespace === MARKUP_COMPATIBILITY_NAMESPACE) return `mc:${localName}`;
  if (OFFICE_MATH_NAMESPACES.has(namespace)) return `m:${localName}`;
  if (namespace === DRAWINGML_WORDPROCESSING_NAMESPACE) return `wp:${localName}`;
  if (namespace === WORD_2010_DRAWING_NAMESPACE) return `wp14:${localName}`;
  // A misleading `w:` or `mc:` binding must never acquire the semantics of
  // the canonical vocabulary merely because its textual prefix looks right.
  if (['w', 'mc', 'm', 'wp', 'wp14'].includes(prefix)) return `unsupported:${localName}`;
  return qname;
}

function wordPartScope(xml, rootTag, onElement) {
  const source = String(xml);
  if (!source || /<!DOCTYPE|<!ENTITY/iu.test(source)) throw wordStructureError();
  const stack = [];
  const output = [];
  const tag = /<(\/)?([A-Za-z_][\w.:-]*)(?=[\s/>])((?:[^<>"']|"[^"<]*"|'[^'<]*')*)>/y;
  const attribute = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/gy;
  let cursor = 0;
  let documentRoot = null;
  let rootClosed = false;
  let target = null;
  let found = false;

  function append(value) { if (target) output.push(value); }
  function parseAttributes(raw, inherited) {
    const namespaces = new Map(inherited || [['xml', XML_NAMESPACE]]);
    const parsed = [];
    let offset = 0;
    while (offset < raw.length) {
      while (offset < raw.length && /\s/u.test(raw[offset])) offset++;
      if (offset === raw.length) break;
      attribute.lastIndex = offset;
      const match = attribute.exec(raw);
      if (!match) throw wordStructureError();
      const name = match[1];
      const value = match[2] ?? match[3];
      if (parsed.some((item) => item.name === name)) throw wordStructureError();
      parsed.push({ name, value });
      offset = attribute.lastIndex;
      if (offset < raw.length && !/\s/u.test(raw[offset])) throw wordStructureError();
    }
    for (const item of parsed) {
      if (item.name === 'xmlns') namespaces.set('', xmlDecode(item.value));
      else if (item.name.startsWith('xmlns:')) namespaces.set(item.name.slice(6), xmlDecode(item.value));
    }
    return { parsed, namespaces };
  }
  function normalizedAttributes(parsed, namespaces) {
    const names = new Set();
    const values = [];
    for (const item of parsed) {
      if (item.name === 'xmlns' || item.name.startsWith('xmlns:')) continue;
      const name = normalizedWordQName(item.name, namespaces, true);
      if (names.has(name)) throw wordStructureError();
      names.add(name);
      values.push(` ${name}="${item.value.replace(/"/gu, '&quot;')}"`);
    }
    return values.join('');
  }
  function normalizedChoiceName(normalized, parsed, namespaces) {
    // These names are internal tokens, not legal markup-compatibility input.
    // Otherwise a source ChoiceSupported would bypass Requires resolution.
    if (normalized === 'mc:ChoiceSupported' || normalized === 'mc:ChoiceUnsupported') throw wordStructureError();
    if (normalized !== 'mc:Choice') return normalized;
    const requires = parsed.find((item) => item.name === 'Requires')?.value;
    const prefixes = xmlDecode(requires || '').trim().split(/\s+/u).filter(Boolean);
    if (!prefixes.length || prefixes.some((prefix) => !/^[A-Za-z_][\w.-]*$/u.test(prefix))) {
      return 'mc:ChoiceUnsupported';
    }
    return prefixes.every((prefix) => SUPPORTED_WORD_MARKUP_CHOICE_NAMESPACES.has(namespaces.get(prefix)))
      ? 'mc:ChoiceSupported'
      : 'mc:ChoiceUnsupported';
  }

  while (cursor < source.length) {
    if (source[cursor] !== '<') {
      const next = source.indexOf('<', cursor);
      const end = next === -1 ? source.length : next;
      const value = source.slice(cursor, end);
      if (!stack.length && /\S/u.test(value)) throw wordStructureError();
      append(value);
      cursor = end;
      continue;
    }
    const special = source.startsWith('<!--', cursor) ? ['-->', 4]
      : source.startsWith('<?', cursor) ? ['?>', 2]
        : source.startsWith('<![CDATA[', cursor) ? [']]>', 9] : null;
    if (special) {
      const end = source.indexOf(special[0], cursor + special[1]);
      if (end === -1) throw wordStructureError();
      append(source.slice(cursor, end + special[0].length));
      cursor = end + special[0].length;
      continue;
    }
    if (source.startsWith('<!', cursor)) throw wordStructureError();
    tag.lastIndex = cursor;
    const token = tag.exec(source);
    if (!token) throw wordStructureError();
    cursor = tag.lastIndex;
    const [, closing, qname, rawAttributes] = token;
    const selfClosing = /\/\s*$/u.test(rawAttributes);
    const raw = selfClosing ? rawAttributes.slice(0, rawAttributes.lastIndexOf('/')) : rawAttributes;
    if (closing) {
      if (selfClosing || raw.trim() || !stack.length || stack.at(-1).qname !== qname) throw wordStructureError();
      const frame = stack.pop();
      if (frame === target) {
        target = null;
        found = true;
      } else append(`</${frame.normalized}>`);
      if (!stack.length) rootClosed = true;
      continue;
    }
    if (rootClosed) throw wordStructureError();
    const { parsed, namespaces } = parseAttributes(raw, stack.at(-1)?.namespaces);
    const normalized = normalizedWordQName(qname, namespaces);
    const emittedName = normalizedChoiceName(normalized, parsed, namespaces);
    const frame = { qname, normalized: emittedName, namespaces };
    if (!documentRoot) {
      documentRoot = frame;
      const expected = rootTag === 'body' ? 'w:document' : `w:${rootTag}`;
      if (normalized !== expected) return { found: false, body: '' };
    }
    const isTarget = rootTag === 'body'
      ? stack.length === 1 && stack[0] === documentRoot && normalized === 'w:body'
      : frame === documentRoot;
    if (isTarget) {
      if (target || found) throw wordStructureError();
      if (selfClosing) found = true;
      else target = frame;
    } else if (target) {
      append(`<${emittedName}${normalizedAttributes(parsed, namespaces)}${selfClosing ? '/>' : '>'}`);
      onElement?.(normalized, parsed, namespaces, stack.at(-1)?.normalized);
    }
    if (!selfClosing) stack.push(frame);
    else if (!stack.length) rootClosed = true;
  }
  // EOF before the selected root closes is a part-coverage failure rather
  // than a partially renderable scope. An already closed body may still be
  // rendered; the separate document-root coverage check will block release
  // if only the outer document close is missing.
  if (!documentRoot || target) return { found: false, body: '' };
  return { found, body: output.join('') };
}
function renderWordPart(xml, rootTag, options = {}) {
  const scope = wordPartScope(String(xml), rootTag);
  if (!scope.found || !scope.body) return '';
  return renderWordStructure(parseWordStructure(scope.body, options), options);
}

// These are structural/resource bounds, not a page-count limit. Each XML token
// is visited once and each retained node is rendered once. In particular, never
// re-scan or repeatedly escape a nested table's entire subtree.
const MAX_WORD_XML_DEPTH = 128;
const MAX_WORD_STRUCTURE_NODES = 200000;
const MAX_WORD_XML_ELEMENTS = 1000000;
const MAX_WORD_RENDERED_CHARS = 8000000;
function wordStructureError(limit = false) {
  const error = new Error(limit
    ? 'DOCX-Struktur überschreitet die sichere Verarbeitungsgrenze.'
    : 'DOCX-Struktur ist nicht eindeutig lesbar; Verarbeitung wird blockiert.');
  error.code = limit ? 'DOCX_STRUCTURE_LIMIT' : 'DOCX_STRUCTURE_UNSAFE';
  return error;
}
function parseWordStructure(body, options = {}) {
  const root = { type: 'root', children: [] };
  const stack = [{ name: '', node: root, skipped: false, boxes: 0 }];
  // Quoted attribute values may contain `>`; an unquoted `<` is never a tag.
  const tag = /<(\/)?([A-Za-z_][\w.:-]*)(?=[\s/>])((?:[^<>"']|"[^"<]*"|'[^'<]*')*)>/y;
  const attribute = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/gy;
  let cursor = 0, nodes = 0, elements = 0;
  function flush(node) {
    if (node.type !== 'p' || !node.pending.length) return;
    const raw = node.pending.join('');
    const value = options.preserveText ? raw : raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (value) node.children.push(value);
    node.pending.length = 0;
  }
  while (cursor < body.length) {
    const frame = stack[stack.length - 1];
    if (body[cursor] !== '<') {
      const next = body.indexOf('<', cursor);
      const end = next === -1 ? body.length : next;
      if (!frame.skipped && frame.name === 'w:t') {
        try { frame.node.pending.push(xmlDecode(body.slice(cursor, end))); }
        catch (error) {
          if (error?.code === 'OOXML_XML_CHARACTER_INVALID') throw error;
          throw wordStructureError();
        }
      } else if (!frame.skipped && /\S/.test(body.slice(cursor, end)) &&
          !NON_CONTENT_DRAWING_TEXT.has(frame.name)) {
        // Text outside a canonical Word text node is content, not formatting.
        // Silently dropping vendor/extension text would create a coverage gap
        // before anonymization, so every such construct stops fail closed.
        throw wordStructureError();
      }
      cursor = end;
      continue;
    }
    // Comments/PIs cannot contribute Word text. CDATA may contribute only in
    // a text run. Declarations (including DTD/entity declarations) are rejected.
    const special = body.startsWith('<!--', cursor) ? ['-->', 4]
      : body.startsWith('<?', cursor) ? ['?>', 2]
        : body.startsWith('<![CDATA[', cursor) ? [']]>', 9] : null;
    if (special) {
      const end = body.indexOf(special[0], cursor + special[1]);
      if (end === -1) throw wordStructureError();
      if (special[1] === 9 && !frame.skipped) {
        if (frame.name !== 'w:t') throw wordStructureError();
        frame.node.pending.push(body.slice(cursor + special[1], end));
      }
      cursor = end + special[0].length;
      continue;
    }
    tag.lastIndex = cursor;
    const token = tag.exec(body);
    if (!token) throw wordStructureError();
    cursor = tag.lastIndex;
    const [, closing, name, rawAttributes] = token;
    const selfClosing = /\/\s*$/.test(rawAttributes);
    const attributes = selfClosing ? rawAttributes.slice(0, rawAttributes.lastIndexOf('/')) : rawAttributes;
    if (closing) {
      if (selfClosing || attributes.trim() || stack.length === 1 || frame.name !== name) throw wordStructureError();
      if (frame.created) flush(frame.node);
      if (frame.name === 'mc:AlternateContent' && !frame.alternate?.selected) throw wordStructureError();
      stack.pop();
      continue;
    }
    if (++elements > MAX_WORD_XML_ELEMENTS || stack.length > MAX_WORD_XML_DEPTH) throw wordStructureError(true);
    const attrs = new Map();
    let offset = 0;
    while (offset < attributes.length) {
      while (/\s/.test(attributes[offset] || '') && offset < attributes.length) offset++;
      if (offset === attributes.length) break;
      attribute.lastIndex = offset;
      const match = attribute.exec(attributes);
      if (!match || attrs.has(match[1])) throw wordStructureError();
      attrs.set(match[1], match[2] ?? match[3]);
      offset = attribute.lastIndex;
      if (offset < attributes.length && !/\s/.test(attributes[offset])) throw wordStructureError();
    }
    // Merged Word table cells do not have a one-to-one column coordinate.
    // Rendering them as ordinary Markdown cells would let values shift under a
    // different privacy label. Until the renderer carries gridSpan/vMerge
    // semantics end to end, stop the document instead of guessing.
    if (!frame.skipped && (name === 'w:gridSpan' || name === 'w:vMerge')) {
      throw wordStructureError();
    }
    // These canonical Word constructs are already counted by the package
    // coverage gate below.  Keep their payload out of the structural renderer
    // so the caller receives the intended content-free coverage warning.
    // Unknown/foreign elements are deliberately not skipped: direct text in
    // those elements must still fail closed instead of disappearing.
    const blockedWordElement = BLOCKED_WORD_CONTENT.has(name);
    let branchSkipped = false;
    let alternate = null;
    if (name === 'mc:AlternateContent') {
      alternate = { selected: false, fallbackSeen: false };
    } else if (/^mc:(?:ChoiceSupported|ChoiceUnsupported|Fallback)$/u.test(name)) {
      if (frame.name !== 'mc:AlternateContent' || !frame.alternate || frame.alternate.fallbackSeen) {
        throw wordStructureError();
      }
      if (name === 'mc:Fallback') {
        frame.alternate.fallbackSeen = true;
        branchSkipped = frame.alternate.selected;
        if (!branchSkipped) frame.alternate.selected = true;
      } else if (name === 'mc:ChoiceSupported' && !frame.alternate.selected) {
        frame.alternate.selected = true;
      } else {
        branchSkipped = true;
      }
    } else if (frame.name === 'mc:AlternateContent') {
      // Choice/Fallback are the only legal direct children of AlternateContent.
      throw wordStructureError();
    }
    const skipped = frame.skipped || branchSkipped || blockedWordElement;
    const boxes = frame.boxes + (name === 'w:txbxContent' ? 1 : 0);
    let node = frame.node, created = false;
    if (!skipped) {
      if (frame.name === 'w:t') throw wordStructureError();
      const type = /^w:(p|tbl|tr|tc)$/.exec(name)?.[1];
      if (type) {
        const allowed = type === 'tr' ? node.type === 'tbl'
          : type === 'tc' ? node.type === 'tr'
            : node.type === 'root' || node.type === 'tc' || (node.type === 'p' && boxes > node.boxes);
        if (!allowed) throw wordStructureError();
        if (++nodes > MAX_WORD_STRUCTURE_NODES) throw wordStructureError(true);
        flush(node);
        const child = { type, children: [], boxes, ...(type === 'p' ? { pending: [], prefix: '' } : {}) };
        node.children.push(child);
        node = child;
        created = true;
      } else if (name === 'w:t' || name === 'w:tab' || name === 'w:br' || name === 'w:cr') {
        if (node.type !== 'p') throw wordStructureError();
        if (name !== 'w:t') node.pending.push(name === 'w:tab' ? '\t' : '\n');
      } else if (node.type === 'tr' && name === 'w:tblHeader') {
        node.header = !['0', 'false', 'off'].includes(attrs.get('w:val') || '1');
      } else if (node.type === 'p' && name === 'w:pStyle') {
        const level = /^heading\s*([1-6])$/i.exec(attrs.get('w:val') || '')?.[1];
        if (level) node.prefix = '#'.repeat(Number(level)) + ' ';
      } else if (node.type === 'p' && name === 'w:numPr' && !node.prefix) node.prefix = '- ';
    }
    if (!selfClosing) stack.push({ name, node, skipped, boxes, created, alternate });
    else if (name === 'mc:AlternateContent' || (name === 'mc:Fallback' && !frame.alternate?.selected)) {
      throw wordStructureError();
    } else if (created) flush(node);
  }
  if (stack.length !== 1) throw wordStructureError();
  return root;
}
function renderWordStructure(root, options = {}) {
  const output = [];
  let chars = 0;
  function write(value) {
    chars += value.length;
    if (chars > MAX_WORD_RENDERED_CHARS) throw wordStructureError(true);
    output.push(value);
  }
  function repeat(value, count) {
    if (chars + value.length * count > MAX_WORD_RENDERED_CHARS) throw wordStructureError(true);
    if (count) write(value.repeat(count));
  }
  function content(node) {
    if (typeof node === 'string') return Boolean(node);
    if (options.preserveText && node.type === 'p') return true;
    // Memoization visits each node only once, including empty drawing wrappers.
    if (node.visible === undefined) node.visible = node.type === 'tbl'
      ? node.children.some(row => row.children.length)
      : node.children.some(content);
    return node.visible;
  }
  function children(node, inCell) {
    let emitted = false;
    for (const child of node.children) {
      if (!content(child)) continue;
      if (emitted) write(inCell ? '<br>' : '\n\n');
      if (typeof child === 'string') {
        if (!inCell && !emitted) write(node.prefix || '');
        write(options.preserveText ? extractionText(child, inCell) : (inCell ? escapeMarkdownTableCell(child) : child));
      } else emit(child, inCell);
      emitted = true;
    }
  }
  function emit(node, inCell) {
    if (node.type !== 'tbl') { children(node, inCell); return; }
    let columns = 0;
    for (const row of node.children) columns = Math.max(columns, row.children.length);
    if (!columns) return;
    const pipe = inCell ? '\\|' : '|';
    const neutralHeader = options.preserveText && !inCell &&
      !(node.children[0]?.header && !node.children.slice(1).some((row) => row.header));
    if (neutralHeader) {
      write('| ');
      for (let column = 0; column < columns; column++) {
        if (column) write(' | ');
        write(`Spalte ${column + 1}`);
      }
      write(' |\n| ---');
      repeat(' | ---', columns - 1);
      write(' |\n');
    }
    for (let rowIndex = 0; rowIndex < node.children.length; rowIndex++) {
      if (rowIndex) write(inCell ? '<br>' : '\n');
      write(pipe + ' ');
      const cells = node.children[rowIndex].children;
      for (let column = 0; column < cells.length; column++) {
        if (column) write(' ' + pipe + ' ');
        children(cells[column], true);
      }
      repeat(' ' + pipe + ' ', columns - Math.max(1, cells.length));
      write(' ' + pipe);
      if (!inCell && rowIndex === 0 && !neutralHeader) {
        write('\n| ---');
        repeat(' | ---', columns - 1);
        write(' |');
      }
    }
  }
  emit(root, false);
  return output.join('');
}
function renderWordBody(xml, options = {}) { return renderWordPart(xml, 'body', options); }
function docxMainRelationshipIssueCount(entries) {
  // A .docx is an OPC package, not an arbitrary ZIP containing a plausible
  // word/document.xml.  The root officeDocument relationship is therefore
  // the first coverage boundary: accepting an orphan main part would make a
  // malformed or substituted package appear complete.
  const rels = entries.get('_rels/.rels');
  if (!rels) return 1;
  let valid = 0;
  let issues = 0;
  for (const match of rels.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
    const attrs = match[1];
    const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
    if (type !== 'officeDocument') continue;
    const target = xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1] || '');
    const external = /\bTargetMode\s*=\s*["']External["']/i.test(attrs);
    if (external || target !== 'word/document.xml' || !entries.has('word/document.xml')) {
      issues++;
      continue;
    }
    valid++;
  }
  // Exactly one internal canonical root is required.  Duplicate roots are an
  // ambiguity, even where they happen to name the same part.
  return issues + (valid === 1 ? 0 : 1);
}
function docxMainWordRootIssueCount(entries) {
  // The renderer deliberately supports the standard WordprocessingML `w:`
  // vocabulary only. A named main part with another or missing root must not
  // silently turn into an empty document that later appears safe.
  const main = entries.get('word/document.xml');
  if (!main) return 1;
  const xml = main.toString('utf8');
  return hasCompleteWordRoot(xml, 'document') && hasCompleteWordRoot(xml, 'body') ? 0 : 1;
}
function hasCompleteWordRoot(xml, rootTag) {
  // Prefix spelling is irrelevant; the namespace URI is authoritative. The
  // same bounded parser used for rendering also proves that the complete XML
  // scope closes and that a misleading `w:` binding is not accepted.
  try { return wordPartScope(xml, rootTag).found; }
  catch { return false; }
}
function hasCompleteXmlRoot(xml, rootTag) {
  // XLSX has no single mandatory namespace prefix. A truncated part must not
  // look like an empty, harmless worksheet or shared-string table.
  const escaped = String(rootTag).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opening = new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}\\b[^>]*>`, 'i').exec(xml);
  if (!opening) return false;
  if (/\/\s*>$/u.test(opening[0])) return true;
  return new RegExp(`</(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}\\s*>`, 'i').test(xml.slice(opening.index + opening[0].length));
}
function docxReferencedHeaderFooter(entries) {
  const main = entries.get('word/document.xml');
  if (!main) return { present: false, orderedParts: [], issues: 1 };
  let body;
  try { body = wordPartScope(main.toString('utf8'), 'body').body; }
  catch { return { present: false, orderedParts: [], issues: 1 }; }
  const references = [];
  for (const match of body.matchAll(/<w:(headerReference|footerReference)\b([^>]*)>/giu)) {
    const id = /\br:id=["']([^"']+)["']/iu.exec(match[2])?.[1];
    references.push({ type: match[1] === 'headerReference' ? 'header' : 'footer', id });
  }
  if (!references.length) return { present: false, orderedParts: [], issues: 0 };
  const rels = entries.get('word/_rels/document.xml.rels');
  if (!rels) return { present: true, orderedParts: [], issues: references.length };
  const byId = new Map();
  let issues = 0;
  for (const match of rels.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/giu)) {
    const attrs = match[1];
    const id = /\bId=["']([^"']+)["']/iu.exec(attrs)?.[1];
    const type = relationshipKind(/\bType=["']([^"']+)["']/iu.exec(attrs)?.[1]);
    if (!['header', 'footer'].includes(type)) continue;
    if (!id || byId.has(id)) { issues++; continue; }
    byId.set(id, { type, attrs });
  }
  const orderedParts = [];
  for (const reference of references) {
    const relation = reference.id ? byId.get(reference.id) : null;
    if (!relation || relation.type !== reference.type) { issues++; continue; }
    const target = xmlDecode(/\bTarget=["']([^"']+)["']/iu.exec(relation.attrs)?.[1] || '');
    const external = /\bTargetMode\s*=\s*["']External["']/iu.test(relation.attrs);
    if (external || !target || /[\\?#\0]/u.test(target) || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(target) ||
        /(?:^|\/)\.\.(?:\/|$)/u.test(target)) { issues++; continue; }
    const resolved = path.posix.normalize(path.posix.join('word', target));
    const expected = reference.type === 'header' ? /^word\/header\d+\.xml$/iu : /^word\/footer\d+\.xml$/iu;
    const root = reference.type === 'header' ? 'hdr' : 'ftr';
    if (!expected.test(resolved) || !entries.has(resolved) ||
        !hasCompleteWordRoot(entries.get(resolved).toString('utf8'), root)) { issues++; continue; }
    if (!orderedParts.includes(resolved)) orderedParts.push(resolved);
  }
  return { present: true, orderedParts, issues };
}
function packageMainRelationshipIssueCount(entries, expectedMainPart) {
  // Every OOXML family is an OPC package. A coincidentally named main part
  // inside a ZIP is not coverage evidence unless the package root points to
  // it once and only once through an internal officeDocument relationship.
  const rels = entries.get('_rels/.rels');
  if (!rels) return 1;
  let valid = 0;
  let issues = 0;
  for (const match of rels.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
    const attrs = match[1];
    const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
    if (type !== 'officeDocument') continue;
    const target = xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1] || '');
    const external = /\bTargetMode\s*=\s*["']External["']/i.test(attrs);
    if (external || target !== expectedMainPart || !entries.has(expectedMainPart)) {
      issues++;
      continue;
    }
    valid++;
  }
  return issues + (valid === 1 ? 0 : 1);
}
function docxStoryRelationshipIssueCount(entries) {
  // Word's secondary stories are distinct package parts. Merely finding a
  // plausible filename is not a coverage proof: the part must be reachable
  // from the main document through its declared internal relationship.
  const relPath = 'word/_rels/document.xml.rels';
  const rels = entries.get(relPath);
  const headerFooter = docxReferencedHeaderFooter(entries);
  const stories = [...entries.keys()].filter((name) =>
    /^word\/(?:header\d+|footer\d+|comments|footnotes|endnotes)\.xml$/i.test(name)
  );
  if (!stories.length) return headerFooter.issues;
  if (!rels) return stories.length;
  const expected = new Map([
    ['header', { part: /^word\/header\d+\.xml$/i, root: 'hdr' }],
    ['footer', { part: /^word\/footer\d+\.xml$/i, root: 'ftr' }],
    ['comments', { part: /^word\/comments\.xml$/i, root: 'comments' }],
    ['footnotes', { part: /^word\/footnotes\.xml$/i, root: 'footnotes' }],
    ['endnotes', { part: /^word\/endnotes\.xml$/i, root: 'endnotes' }]
  ]);
  const reachable = new Set();
  const relationshipCounts = new Map();
  let issues = headerFooter.issues;
  for (const match of rels.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
    const attrs = match[1];
    const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
    if (!expected.has(type)) continue;
    if (headerFooter.present && (type === 'header' || type === 'footer')) continue;
    const target = /\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1] || '';
    const external = /\bTargetMode\s*=\s*["']External["']/i.test(attrs);
    // A target is relative to word/document.xml. POSIX normalization is only
    // accepted after rejecting absolute and parent traversal source text.
    if (external || !target || /^(?:\/|[A-Za-z]:)/u.test(target) || /(?:^|\/)\.\.(?:\/|$)/u.test(target)) {
      issues++;
      continue;
    }
    const resolved = path.posix.normalize(path.posix.join('word', target));
    const expectedStory = expected.get(type);
    if (!expectedStory.part.test(resolved) || !entries.has(resolved)) {
      issues++;
      continue;
    }
    // A correctly named part with the wrong WordprocessingML root would be
    // rendered as empty below. Treat it as a coverage failure instead of
    // silently losing a story that could contain personal data.
    const storyXml = entries.get(resolved).toString('utf8');
    if (!hasCompleteWordRoot(storyXml, expectedStory.root)) {
      issues++;
      continue;
    }
    relationshipCounts.set(resolved, (relationshipCounts.get(resolved) || 0) + 1);
    reachable.add(resolved);
  }
  // More than one edge to the same story is an ambiguity. Do not let a
  // duplicated relationship masquerade as a single fully-covered story.
  for (const count of relationshipCounts.values()) if (count !== 1) issues++;
  for (const story of stories) {
    if (headerFooter.present && /^word\/(?:header\d+|footer\d+)\.xml$/iu.test(story)) continue;
    if (!reachable.has(story)) issues++;
  }
  return issues;
}
function docxImageRelationshipCoverage(entries, options = {}) {
  // Picture bytes are sensitive content just like text.  A Word media part is
  // therefore not an attachment merely because its filename looks familiar:
  // it must be referenced by one internal image relationship from a covered
  // Word part.  This avoids displaying an orphan or substituted binary in a
  // local review window.
  const media = new Set([...entries.keys()].filter((name) =>
    /^word\/media\/[^/]+\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i.test(name)
  ));
  const validatedTargets = new Set();
  const safeTargets = new Set();
  let issues = 0;
  for (const [relPath, data] of entries) {
    if (!/^word\/(?:_rels\/)?[^/]+\.rels$/i.test(relPath)) continue;
    const base = relationshipBase(relPath);
    if (base === null) continue;
    const sourcePart = relPath.replace('/_rels/', '/').replace(/\.rels$/i, '');
    const sourceExists = entries.has(sourcePart) &&
      /^word\/(?:document|header\d+|footer\d+|comments|footnotes|endnotes)\.xml$/i.test(sourcePart);
    for (const match of data.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
      const attrs = match[1];
      const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
      const rawTarget = xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1] || '');
      const external = /\bTargetMode\s*=\s*["']External["']/i.test(attrs);
      if (!rawTarget) continue;
      const targetLooksLikeMedia = /(?:^|\/)media\/[^/]+\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i.test(rawTarget);
      // Normalize before comparing to the fixed media set.  A target that
      // leaves the `word/media/` set can never become a safe attachment.
      if (external || /[\\?#\0]/u.test(rawTarget) || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(rawTarget)) {
        if (type === 'image' || targetLooksLikeMedia) issues++;
        continue;
      }
      const target = path.posix.normalize(path.posix.join(base, rawTarget));
      if (type === 'image') {
        if (!sourceExists || !media.has(target)) issues++;
        else {
          validatedTargets.add(target);
          if (options.omitDocxHeaderFooter !== true ||
              !/^word\/(?:header|footer)\d+\.xml$/i.test(sourcePart)) safeTargets.add(target);
        }
      } else if (sourceExists && media.has(target)) {
        issues++;
      }
    }
  }
  for (const name of media) if (!validatedTargets.has(name)) issues++;
  return {
    safeTargets,
    warnings: issues ? [`DOCX enthält ${issues} nicht eindeutig über eine interne Bildbeziehung abgesicherte Grafik(en); Freigabe wird blockiert.`] : []
  };
}
function packageImageRelationshipCoverage(entries, packageRoot, label, allowedSourceParts = null) {
  // XLSX and PPTX use the same OPC relationship model as DOCX.  Keep their
  // image boundary equally strict even while their text formats remain
  // unreleased: media bytes require an internal `image` edge from a part in
  // the same package, never filename discovery.
  const prefix = `${packageRoot}/media/`;
  const media = new Set([...entries.keys()].filter((name) =>
    name.startsWith(prefix) && /\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i.test(name)
  ));
  const safeTargets = new Set();
  let issues = 0;
  for (const [relPath, data] of entries) {
    if (!relPath.startsWith(`${packageRoot}/`) || !/\.rels$/i.test(relPath)) continue;
    const base = relationshipBase(relPath);
    if (base === null) continue;
    // `relationshipBase` is the directory used for target resolution.  The
    // authorization boundary, however, is the concrete source part (for
    // example `xl/drawings/drawing1.xml`), not its directory.
    const sourcePart = relPath.replace('/_rels/', '/').replace(/\.rels$/i, '');
    const sourceAllowed = !allowedSourceParts || allowedSourceParts.has(sourcePart);
    for (const match of data.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
      const attrs = match[1];
      const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
      const rawTarget = xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1] || '');
      const external = /\bTargetMode\s*=\s*["']External["']/i.test(attrs);
      if (!rawTarget) continue;
      const looksLikeMedia = /(?:^|\/)media\/[^/]+\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i.test(rawTarget);
      // OPC targets from drawing and slide subdirectories legitimately use
      // `../media/...`. Normalize before comparing to the fixed media set;
      // any traversal outside that set cannot become a safe attachment.
      if (external || /[\\?#\0]/u.test(rawTarget) || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(rawTarget)) {
        if (type === 'image' || looksLikeMedia) issues++;
        continue;
      }
      const target = path.posix.normalize(path.posix.join(base, rawTarget));
      if (type === 'image') {
        if (!sourceAllowed || !media.has(target)) issues++;
        else safeTargets.add(target);
      } else if (media.has(target) && sourceAllowed) {
        issues++;
      }
    }
  }
  for (const name of media) if (!safeTargets.has(name)) issues++;
  return {
    safeTargets,
    warnings: issues ? [`${label} enthält ${issues} nicht eindeutig über eine interne Bildbeziehung abgesicherte Grafik(en); Freigabe wird blockiert.`] : []
  };
}
function docxCoverageWarnings(entries) {
  const supported = [
    /^\[Content_Types\]\.xml$/i,
    /^_rels\/\.rels$/i,
    /^docProps\/(?:core|app|custom)\.xml$/i,
    /^word\/(?:document|styles|settings|numbering|fontTable|webSettings|comments|footnotes|endnotes|header\d+|footer\d+)\.xml$/i,
    /^word\/_rels\/(?:document|header\d+|footer\d+|comments|footnotes|endnotes)\.xml\.rels$/i,
    /^word\/theme\/theme\d+\.xml$/i,
    /^word\/media\/[^/]+\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i,
    /^word\/embeddings\/[^/]+\.(?:docx|xlsx|pptx)$/i
  ];
  const relationshipTypes = new Set([
    'officeDocument', 'core-properties', 'extended-properties', 'custom-properties',
    'styles', 'settings', 'numbering', 'fontTable', 'webSettings', 'theme',
    'header', 'footer', 'image', 'comments', 'footnotes', 'endnotes', 'hyperlink', 'package'
  ]);
  const overrideTypes = new Map([
    ['word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'],
    ['word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'],
    ['word/settings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'],
    ['word/numbering.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'],
    ['word/fontTable.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml'],
    ['word/webSettings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml'],
    ['word/comments.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml'],
    ['word/footnotes.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml'],
    ['word/endnotes.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml'],
    ['docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
    ['docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml'],
    ['docProps/custom.xml', 'application/vnd.openxmlformats-officedocument.custom-properties+xml']
  ]);
  function expectedOverrideType(part) {
    const normalized = String(part || '').replace(/^\//, '');
    if (/^word\/header\d+\.xml$/i.test(normalized)) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
    }
    if (/^word\/footer\d+\.xml$/i.test(normalized)) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
    }
    if (/^word\/theme\/theme\d+\.xml$/i.test(normalized)) {
      return 'application/vnd.openxmlformats-officedocument.theme+xml';
    }
    const embedded = /^word\/embeddings\/[^/]+\.(docx|xlsx|pptx)$/i.exec(normalized)?.[1]?.toLowerCase();
    if (embedded === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (embedded === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (embedded === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return overrideTypes.get(normalized) || null;
  }
  // OPC part names are case-insensitive (ECMA-376 Part 2), but every gate,
  // relationship lookup and renderer here addresses fixed parts by their
  // canonical spelling. A part that matches a supported name only case-
  // insensitively (`word/Comments.xml`, `Word/Document.xml`) would pass the
  // inventory, never be rendered and never be reported – a silent story
  // omission graded "complete". Such spellings are unsupported parts instead.
  const canonicalCase = [
    /^\[Content_Types\]\.xml$/,
    /^_rels\/\.rels$/,
    /^docProps\/(?:core|app|custom)\.xml$/,
    /^word\/(?:document|styles|settings|numbering|fontTable|webSettings|comments|footnotes|endnotes|header\d+|footer\d+)\.xml$/,
    /^word\/_rels\/(?:document|header\d+|footer\d+|comments|footnotes|endnotes)\.xml\.rels$/,
    /^word\/theme\/theme\d+\.xml$/,
    /^word\/media\/[^/]+$/,
    /^word\/embeddings\/[^/]+$/
  ];
  let unsupported = 0;
  const declaredOverrides = new Map();
  const commentDefinitions = new Set();
  const commentBindings = new Map();
  let commentMarkers = 0;
  function inspectComment(part, name, attributes, namespaces, parent) {
    if (!['w:comment', 'w:commentReference', 'w:commentRangeStart', 'w:commentRangeEnd'].includes(name)) return;
    // Comment-in-comment references are explicitly ignorable Word markup.
    if (part === 'word/comments.xml' && name !== 'w:comment') return;
    if (++commentMarkers > MAX_WORD_STRUCTURE_NODES) throw wordStructureError(true);
    const attribute = attributes.find(item => item.name !== 'xmlns' && !item.name.startsWith('xmlns:') &&
      normalizedWordQName(item.name, namespaces, true) === 'w:id');
    const rawId = xmlDecode(attribute?.value || '').trim();
    // IDs are decimal identifiers, not paths. Bound normalization before BigInt
    // and compare values, including equivalent +0/00 spellings, not raw XML.
    if (!/^[+-]?[0-9]{1,32}$/u.test(rawId)) throw wordStructureError();
    const id = String(BigInt(rawId));
    if (name === 'w:comment') {
      if (part !== 'word/comments.xml' || parent !== 'w:comments' || commentDefinitions.has(id)) unsupported++;
      commentDefinitions.add(id);
      return;
    }
    const key = `${part}:${id}`;
    let binding = commentBindings.get(key);
    if (!binding) commentBindings.set(key, binding = { id, start: 0, end: 0, references: 0, ordered: true });
    if (name === 'w:commentRangeStart') {
      if (binding.end) binding.ordered = false;
      binding.start++;
    } else if (name === 'w:commentRangeEnd') {
      if (!binding.start) binding.ordered = false;
      binding.end++;
    } else binding.references++;
  }
  for (const [name, data] of entries) {
    if (!supported.some((pattern) => pattern.test(name))) unsupported++;
    else if (!canonicalCase.some((pattern) => pattern.test(name))) unsupported++;
    if (/\.rels$/i.test(name)) {
      const xml = data.toString('utf8');
      const relationships = xml.matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi);
      for (const match of relationships) {
        const attrs = match[1];
        const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
        if (!type || !relationshipTypes.has(type)) unsupported++;
        if (/\bTargetMode\s*=\s*["']External["']/i.test(attrs)) unsupported++;
      }
    }
    if (name === '[Content_Types].xml') {
      const xml = data.toString('utf8');
      const overrides = xml.matchAll(/<Override\b([^>]+?)\/?>(?:<\/Override>)?/gi);
      for (const match of overrides) {
        const attrs = match[1];
        const part = /\bPartName=["']([^"']+)["']/i.exec(attrs)?.[1];
        const contentType = /\bContentType=["']([^"']+)["']/i.exec(attrs)?.[1];
        const expected = expectedOverrideType(part);
        const normalizedPart = String(part || '').replace(/^\//, '');
        if (!expected || contentType !== expected || !entries.has(normalizedPart) || declaredOverrides.has(normalizedPart)) {
          unsupported++;
        } else {
          declaredOverrides.set(normalizedPart, contentType);
        }
      }
    }
    if (/^word\/(?:document|header\d+|footer\d+|comments|footnotes|endnotes)\.xml$/i.test(name)) {
      const xml = data.toString('utf8');
      const rootTag = name === 'word/document.xml' ? 'body'
        : /^word\/header\d+\.xml$/i.test(name) ? 'hdr'
          : /^word\/footer\d+\.xml$/i.test(name) ? 'ftr'
            : path.posix.basename(name, '.xml');
      let inspected;
      let blockedContent = false;
      try { inspected = wordPartScope(xml, rootTag, (element, attributes, namespaces, parent) => {
        if (BLOCKED_WORD_CONTENT.has(element)) blockedContent = true;
        inspectComment(name, element, attributes, namespaces, parent);
      }).body; }
      catch { unsupported++; continue; }
      // Until a namespace-aware field/revision/math renderer exists, these
      // inhaltsfähigen constructs must stop instead of silently disappearing.
      const blocked = [
        /<mc:AlternateContent\b/iu,
        /<w:(?:comment|comments)\b[^>]*\bw:(?:author|initials)=/iu
      ];
      if (blockedContent) unsupported++;
      for (const pattern of blocked) if (pattern.test(inspected)) unsupported++;
    }
    if (name === 'word/settings.xml') {
      try {
        if (/<w:docVar\b/iu.test(wordPartScope(data.toString('utf8'), 'settings').body)) unsupported++;
      } catch { unsupported++; }
    }
  }
  // Rendering a correctly related story under an unrelated content type is
  // not safe. Require one exact override for every supported content-bearing
  // Word part instead of validating only declarations that happen to exist.
  for (const name of entries.keys()) {
    const expected = expectedOverrideType(name);
    if (expected && declaredOverrides.get(name) !== expected) unsupported++;
  }
  unsupported += docxMainRelationshipIssueCount(entries);
  unsupported += docxMainWordRootIssueCount(entries);
  unsupported += docxStoryRelationshipIssueCount(entries);
  for (const binding of commentBindings.values()) {
    // A point comment needs no range. A ranged reference needs exactly one
    // ordered pair; any reference needs one actual, uniquely identified body.
    if (binding.references && (!commentDefinitions.has(binding.id) || !binding.ordered ||
        !((binding.start === 0 && binding.end === 0) || (binding.start === 1 && binding.end === 1)))) unsupported++;
  }
  return unsupported
    ? [`DOCX enthält ${unsupported} nicht unterstützte inhaltsfähige OOXML-Part(s); Companion-Freigabe wird blockiert.`]
    : [];
}
function parseDocx(entries, options = {}) {
  const main=entries.get('word/document.xml'); if(!main) throw new Error('DOCX enthält kein word/document.xml.');
  const sections=[]; const body=renderWordBody(main.toString('utf8'), options);
  if(body)sections.push({kind:'text',source_part:'word/document.xml',markdown:body});
  const headerFooter = docxReferencedHeaderFooter(entries);
  const orderedStories = headerFooter.present ? headerFooter.orderedParts : [
    ...[...entries.keys()].filter((name) => /^word\/header\d+\.xml$/iu.test(name)).sort((left, right) => left.localeCompare(right, 'en')),
    ...[...entries.keys()].filter((name) => /^word\/footer\d+\.xml$/iu.test(name)).sort((left, right) => left.localeCompare(right, 'en'))
  ];
  // Header/footer parts remain inside the structural coverage and relationship
  // checks below even when a privacy caller intentionally omits them from its
  // released Markdown.  The option changes output scope, never validation.
  if (options.omitDocxHeaderFooter !== true) for(const name of orderedStories) {
    const data = entries.get(name);
    const root=name.includes('header')?'hdr':'ftr'; const t=renderWordPart(data.toString('utf8'),root,options);
    if(t) sections.push({kind:'text',source_part:name,markdown:`## ${root==='hdr'?'Kopfzeile':'Fußzeile'}\n\n${t}`});
  }
  for(const [extra,root,label] of [
    ['word/comments.xml','comments','Kommentare'],
    ['word/footnotes.xml','footnotes','Fußnoten'],
    ['word/endnotes.xml','endnotes','Endnoten']
  ]) if(entries.has(extra)) {
    const t=renderWordPart(entries.get(extra).toString('utf8'),root,options);
    if(t)sections.push({kind:'text',source_part:extra,markdown:`## ${label}\n\n${t}`});
  }
  sections.push(...metadataSections(entries,options));
  const imageCoverage = docxImageRelationshipCoverage(entries, options);
  return { markdown:sections.map(section=>section.markdown).join('\n\n'), sections, attachments:mediaAttachments(entries,'word/media/', imageCoverage.safeTargets), warnings:[...docxCoverageWarnings(entries),...imageCoverage.warnings,...customMetadataWarnings(entries)] };
}
function xlsxSheetRelationshipMap(entries, reader) {
  const rels = entries.get('xl/_rels/workbook.xml.rels');
  if (!rels) return { targets: new Map(), issues: 1 };
  const targets = new Map(); let issues = 0;
  for (const relationship of reader.relationships(rels.toString('utf8'))) {
    const { id, target, external } = relationship;
    const type = relationshipKind(relationship.type);
    if (!id) { issues++; continue; }
    if (type !== 'worksheet' || external || !target || /[\\?#\0]/u.test(target) || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(target) || /(?:^|\/)\.\.(?:\/|$)/u.test(target)) { issues++; continue; }
    const resolved = path.posix.normalize(path.posix.join('xl', target));
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(resolved) || !entries.has(resolved) || targets.has(id)) { issues++; continue; }
    targets.set(id, resolved);
  }
  return { targets, issues };
}
function internalRelationshipTargets(entries, relPath, expectedType, allowedTarget) {
  const xml = entries.get(relPath)?.toString('utf8');
  if (!xml) return { targets: new Set(), targetCounts: new Map(), issues: 0 };
  const base = relationshipBase(relPath);
  if (base === null) return { targets: new Set(), targetCounts: new Map(), issues: 1 };
  const targets = new Set();
  const targetCounts = new Map();
  let issues = 0;
  for (const match of xml.matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
    const attrs = match[1];
    const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
    if (type !== expectedType) continue;
    const raw = xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1] || '');
    const external = /\bTargetMode\s*=\s*["']External["']/i.test(attrs);
    if (external || !raw || /[\\?#\0]/u.test(raw) || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(raw)) {
      issues++;
      continue;
    }
    const target = path.posix.normalize(path.posix.join(base, raw));
    if (!allowedTarget.test(target) || !entries.has(target)) {
      issues++;
      continue;
    }
    targets.add(target);
    targetCounts.set(target, (targetCounts.get(target) || 0) + 1);
  }
  return { targets, targetCounts, issues };
}
function xlsxSupplementRelationshipCoverage(entries, sheetMeta) {
  const drawings = new Set([...entries.keys()].filter((name) => /^xl\/drawings\/[^/]+\.xml$/i.test(name)));
  const charts = new Set([...entries.keys()].filter((name) => /^xl\/charts\/chart\d+\.xml$/i.test(name)));
  const safeDrawings = new Set();
  const safeCharts = new Set();
  let issues = 0;
  for (const sheet of sheetMeta) {
    const relPath = `xl/worksheets/_rels/${path.basename(sheet.target)}.rels`;
    const linked = internalRelationshipTargets(entries, relPath, 'drawing', /^xl\/drawings\/[^/]+\.xml$/i);
    issues += linked.issues;
    for (const target of linked.targets) safeDrawings.add(target);
  }
  for (const drawing of safeDrawings) {
    const relPath = `xl/drawings/_rels/${path.basename(drawing)}.rels`;
    const linked = internalRelationshipTargets(entries, relPath, 'chart', /^xl\/charts\/chart\d+\.xml$/i);
    issues += linked.issues;
    for (const target of linked.targets) safeCharts.add(target);
  }
  for (const drawing of drawings) if (!safeDrawings.has(drawing)) issues++;
  for (const chart of charts) if (!safeCharts.has(chart)) issues++;
  return {
    safeDrawings,
    safeCharts,
    warnings: issues ? [`XLSX enthält ${issues} nicht eindeutig über interne Arbeitsblatt-/Drawing-Beziehungen abgesicherte Grafikstruktur(en); Freigabe wird blockiert.`] : []
  };
}
function xlsxCommentRelationshipCoverage(entries, sheetMeta) {
  const comments = new Set([...entries.keys()].filter((name) => /^xl\/comments\d+\.xml$/i.test(name)));
  const safeComments = new Set();
  const relationshipCounts = new Map();
  let issues = 0;
  for (const sheet of sheetMeta) {
    const relPath = `xl/worksheets/_rels/${path.basename(sheet.target)}.rels`;
    const linked = internalRelationshipTargets(entries, relPath, 'comments', /^xl\/comments\d+\.xml$/i);
    issues += linked.issues;
    for (const target of linked.targets) {
      relationshipCounts.set(target, (relationshipCounts.get(target) || 0) + (linked.targetCounts.get(target) || 0));
      if (hasCompleteXmlRoot(entries.get(target)?.toString('utf8') || '', 'comments')) safeComments.add(target);
      else issues++;
    }
  }
  for (const comment of comments) {
    if (!safeComments.has(comment) || relationshipCounts.get(comment) !== 1) issues++;
  }
  for (const [comment, count] of relationshipCounts) {
    if (count !== 1) safeComments.delete(comment);
  }
  return {
    safeComments,
    warnings: issues ? [`XLSX enthält ${issues} nicht eindeutig über interne Arbeitsblattbeziehungen abgesicherte Kommentarstruktur(en); Freigabe wird blockiert.`] : []
  };
}
function xlsxCoverageWarnings(entries, sheetMeta) {
  // XLSX is intentionally not a released input format yet. Parsing it during
  // development must still make every unrendered content-bearing part visible
  // as a content-free warning; otherwise it could appear complete.
  const supportedParts = [
    /^\[Content_Types\]\.xml$/i, /^_rels\/\.rels$/i,
    /^docProps\/(?:core|app|custom)\.xml$/i,
    /^xl\/workbook\.xml$/i, /^xl\/_rels\/workbook\.xml\.rels$/i,
    /^xl\/worksheets\/sheet\d+\.xml$/i, /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i,
    /^xl\/sharedStrings\.xml$/i, /^xl\/comments\d+\.xml$/i,
    /^xl\/drawings\/[^/]+\.xml$/i, /^xl\/drawings\/_rels\/[^/]+\.xml\.rels$/i,
    /^xl\/charts\/chart\d+\.xml$/i, /^xl\/charts\/_rels\/chart\d+\.xml\.rels$/i,
    /^xl\/media\/[^/]+\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i,
    /^xl\/embeddings\/[^/]+\.(?:docx|xlsx|pptx)$/i
  ];
  const knownRelationshipTypes = new Set([
    'officeDocument', 'core-properties', 'extended-properties', 'custom-properties',
    'worksheet', 'sharedStrings', 'drawing', 'chart', 'image', 'comments', 'hyperlink', 'package'
  ]);
  let issues = 0;
  for (const [name, data] of entries) {
    if (!supportedParts.some((pattern) => pattern.test(name))) issues++;
    if (/\.rels$/i.test(name)) {
      for (const match of data.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
        const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(match[1])?.[1]);
        if (!type || !knownRelationshipTypes.has(type)) issues++;
      }
    }
  }
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  if (!hasCompleteXmlRoot(workbook, 'workbook')) issues++;
  const shared = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (shared !== undefined && !hasCompleteXmlRoot(shared, 'sst')) issues++;
  for (const sheet of sheetMeta) {
    if (!hasCompleteXmlRoot(entries.get(sheet.target)?.toString('utf8') || '', 'worksheet')) issues++;
  }
  return issues
    ? [`XLSX enthält ${issues} noch nicht vollständig abgedeckte Inhaltsstruktur(en); Freigabe wird blockiert.`]
    : [];
}
function xlsxRenderLimit() {
  const error = new Error('XLSX-Inhalt überschreitet die sichere Ausgabegrenze.');
  error.code = 'XLSX_STRUCTURE_LIMIT';
  return error;
}
function parseXlsx(entries, options = {}) {
  const reader = createXlsxReader(xmlDecode, options);
  // A well-formed but only partly modelled part is an honest coverage limit.
  // Broken XML anywhere in this workbook is a source failure, never a prefix.
  for (const [name, data] of entries) if (/\.(?:xml|rels)$/i.test(name)) reader.validate(data.toString('utf8'));
  const sharedPart = entries.get('xl/sharedStrings.xml');
  const shared = sharedPart ? reader.sharedStrings(sharedPart.toString('utf8')) : [];
  const workbook=entries.get('xl/workbook.xml')?.toString('utf8')||''; const relationState=xlsxSheetRelationshipMap(entries, reader); const rootIssues=packageMainRelationshipIssueCount(entries, 'xl/workbook.xml');
  const sheetMeta=[]; let issues=relationState.issues;
  for (const { name, rid } of workbook ? reader.workbook(workbook) : []) {
    const target = rid && relationState.targets.get(rid);
    if (!rid || !target) { issues++; continue; }
    sheetMeta.push({ name, target });
  }
  if(!workbook || !sheetMeta.length) issues++;
  const sections=[]; let formulaCells=0;
  for(const s of sheetMeta){const buf=entries.get(s.target);if(!buf)continue;
    const parsed = reader.worksheet(buf.toString('utf8'), shared);
    const rows = parsed.rows; formulaCells += parsed.formulaCells;
    const parts=[];let rendered=0;
    const append=(part)=>{rendered+=part.length+2;if(rendered>MAX_WORD_RENDERED_CHARS)throw xlsxRenderLimit();parts.push(part);};
    append(`# Arbeitsblatt: ${options.preserveText?extractionText(s.name):s.name}`);
    if(rows.length){
      const cols=rows.reduce((maximum,row)=>Math.max(maximum,row.length),0);
      // A sparse far-right cell must not expand into an unbounded dense table.
      // Stop explicitly at the output budget; never return a successful prefix.
      if((cols*3+2)*(rows.length+2)>MAX_WORD_RENDERED_CHARS)throw xlsxRenderLimit();
      if(options.preserveText){append('| '+Array.from({length:cols},(_,i)=>`Spalte ${i+1}`).join(' | ')+' |');append('| '+Array.from({length:cols},()=> '---').join(' | ')+' |');}
      for(let index=0;index<rows.length;index++){
        const row=rows[index]||[];const line=Array.from({length:cols},(_,i)=>options.preserveText?extractionText(String(row[i]??''),true):String(row[i]??'').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/\r?\n/g,'<br>'));
        append('| '+line.join(' | ')+' |');
        if(!options.preserveText&&index===0)append('| '+line.map(()=> '---').join(' | ')+' |');
      }
    }
    sections.push({kind:'table',source_part:s.target,markdown:options.preserveText?parts[0]+'\n\n'+parts.slice(1).join('\n'):parts.join('\n\n')});
  }
  const supplementCoverage = xlsxSupplementRelationshipCoverage(entries, sheetMeta);
  const commentCoverage = xlsxCommentRelationshipCoverage(entries, sheetMeta);
  for(const [name,data] of entries) if(supplementCoverage.safeCharts.has(name)){const vals=textTags(data.toString('utf8'),'c:v').concat(textTags(data.toString('utf8'),'a:t')); if(vals.length)sections.push({kind:'table',source_part:name,markdown:`## Diagrammdaten ${path.basename(name)}\n\n${vals.join(' | ')}`});}
  for(const [name,data]of entries)if(supplementCoverage.safeDrawings.has(name)){const vals=textTags(data.toString('utf8'),'a:t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Grafiktext ${path.basename(name)}\n\n${vals.join(' ')}`});}
  for(const [name,data]of entries)if(commentCoverage.safeComments.has(name)){const vals=textTags(data.toString('utf8'),'t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Tabellenkommentare\n\n${vals.join('\n\n')}`});}
  sections.push(...metadataSections(entries,options));
  const imageCoverage = packageImageRelationshipCoverage(entries, 'xl', 'XLSX', supplementCoverage.safeDrawings);
  const warnings=[...customMetadataWarnings(entries), ...xlsxCoverageWarnings(entries, sheetMeta), ...imageCoverage.warnings, ...supplementCoverage.warnings, ...commentCoverage.warnings];
  if(rootIssues)warnings.push(`XLSX enthält ${rootIssues} nicht eindeutig über die interne Paketwurzel abgesicherte Struktur(en); Freigabe wird blockiert.`);
  if(issues)warnings.push(`XLSX enthält ${issues} nicht eindeutig über eine interne Arbeitsblattbeziehung abgesicherte Struktur(en); Freigabe wird blockiert.`);
  if(formulaCells)warnings.push(`XLSX enthält ${formulaCells} Formelzelle(n); Freigabe wird bis zur vollständigen Formelcoverage blockiert.`);
  return { markdown:sections.map(section=>section.markdown).join('\n\n'), sections, attachments:mediaAttachments(entries,'xl/media/', imageCoverage.safeTargets), warnings };
}
function slideNumber(name){return Number(/slide(\d+)\.xml$/i.exec(name)?.[1]||0);}
function pptRelationshipTarget(entries, relPath, id, expectedType, base) {
  const xml=entries.get(relPath)?.toString('utf8'); if(!xml)return null;
  let resolvedTarget=null;
  for(const match of xml.matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)){
    const attrs=match[1],rid=/\bId=["']([^"']+)["']/i.exec(attrs)?.[1],type=relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]),raw=xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1]||'');
    if(id ? rid!==id : type!==expectedType)continue;
    if(type!==expectedType||/\bTargetMode\s*=\s*["']External["']/i.test(attrs)||!raw||/[\\?#\0]/u.test(raw)||/^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(raw))return null;
    const target=path.posix.normalize(path.posix.join(base,raw)); if(!target.startsWith('ppt/')||!entries.has(target))return null;
    if(resolvedTarget!==null)return null;
    resolvedTarget=target;
  }
  return resolvedTarget;
}
function pptxStructureError(limit = false) {
  const error = new Error(limit ? 'PPTX-Struktur überschreitet die sichere Verarbeitungsgrenze.'
    : 'PPTX-Struktur ist nicht eindeutig lesbar; Verarbeitung wird blockiert.');
  error.code = limit ? 'PPTX_STRUCTURE_LIMIT' : 'PPTX_STRUCTURE_UNSAFE';
  return error;
}
function validatePptxXmlEntries(entries) {
  // Every XML/relationship part must be completely tokenizable before any
  // slide prefix is rendered. Format-specific relationship and coverage
  // checks below remain responsible for semantic reachability.
  for (const [name, data] of entries) if (/\.(?:xml|rels)$/i.test(name)) {
    readXml(data.toString('utf8'), { decode: xmlDecode, error: pptxStructureError });
  }
}
function pptChartRelationshipCoverage(entries, slides) {
  const charts = new Set([...entries.keys()].filter((name) => /^ppt\/charts\/chart\d+\.xml$/i.test(name)));
  const safeCharts = new Set();
  let issues = 0;
  for (const slide of slides) {
    const relPath = `ppt/slides/_rels/${path.basename(slide)}.rels`;
    const linked = internalRelationshipTargets(entries, relPath, 'chart', /^ppt\/charts\/chart\d+\.xml$/i);
    issues += linked.issues;
    for (const target of linked.targets) safeCharts.add(target);
  }
  for (const chart of charts) if (!safeCharts.has(chart)) issues++;
  return {
    safeCharts,
    warnings: issues ? [`PPTX enthält ${issues} nicht eindeutig über interne Folienbeziehungen abgesicherte Diagrammstruktur(en); Freigabe wird blockiert.`] : []
  };
}
function pptNotesRelationshipCoverage(entries, slides) {
  const notes = new Set([...entries.keys()].filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name)));
  const safeNotes = new Set();
  const relationshipCounts = new Map();
  let issues = 0;
  for (const slide of slides) {
    const relPath = `ppt/slides/_rels/${path.basename(slide)}.rels`;
    const linked = internalRelationshipTargets(entries, relPath, 'notesSlide', /^ppt\/notesSlides\/notesSlide\d+\.xml$/i);
    issues += linked.issues;
    for (const target of linked.targets) {
      relationshipCounts.set(target, (relationshipCounts.get(target) || 0) + (linked.targetCounts.get(target) || 0));
      if (hasCompleteXmlRoot(entries.get(target)?.toString('utf8') || '', 'notes')) safeNotes.add(target);
      else issues++;
    }
  }
  for (const note of notes) {
    if (!safeNotes.has(note) || relationshipCounts.get(note) !== 1) issues++;
  }
  for (const [note, count] of relationshipCounts) {
    if (count !== 1) safeNotes.delete(note);
  }
  return {
    safeNotes,
    warnings: issues ? [`PPTX enthält ${issues} nicht eindeutig über interne Folienbeziehungen abgesicherte Notizstruktur(en); Freigabe wird blockiert.`] : []
  };
}
function pptMasterLayoutCoverage(entries, slides) {
  const layouts = new Set([...entries.keys()].filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name)));
  const masters = new Set([...entries.keys()].filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name)));
  const candidateLayouts = new Set(), safeLayouts = new Set(), safeMasters = new Set(), layoutMasters = new Map();
  let issues = 0;
  for (const slide of slides) {
    const linked = internalRelationshipTargets(entries, `ppt/slides/_rels/${path.basename(slide)}.rels`, 'slideLayout', /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i);
    issues += linked.issues;
    // A layout may be shared by many slides, but each individual slide has one
    // unambiguous layout edge. Do not mistake normal sharing for ambiguity.
    if (!linked.targets.size) {
      if (layouts.size) issues++;
      continue;
    }
    if (linked.targets.size !== 1 || [...linked.targetCounts.values()].some((count) => count !== 1)) { issues++; continue; }
    const [target] = linked.targets;
    if (hasCompleteXmlRoot(entries.get(target)?.toString('utf8') || '', 'sldLayout')) candidateLayouts.add(target); else issues++;
  }
  for (const layout of candidateLayouts) {
    const linked = internalRelationshipTargets(entries, `ppt/slideLayouts/_rels/${path.basename(layout)}.rels`, 'slideMaster', /^ppt\/slideMasters\/slideMaster\d+\.xml$/i);
    issues += linked.issues;
    // A master is normally shared by several layouts; uniqueness is required
    // on this layout's outgoing relationship, not across the whole package.
    if (linked.targets.size !== 1 || [...linked.targetCounts.values()].some((count) => count !== 1)) { issues++; continue; }
    const [target] = linked.targets;
    if (hasCompleteXmlRoot(entries.get(target)?.toString('utf8') || '', 'sldMaster')) {
      layoutMasters.set(layout, target);
    } else issues++;
  }
  const presentation = internalRelationshipTargets(entries, 'ppt/_rels/presentation.xml.rels', 'slideMaster', /^ppt\/slideMasters\/slideMaster\d+\.xml$/i);
  issues += presentation.issues;
  for (const [layout, master] of layoutMasters) {
    if (presentation.targetCounts.get(master) === 1) {
      safeLayouts.add(layout);
      safeMasters.add(master);
    }
  }
  for (const layout of layouts) if (!safeLayouts.has(layout)) issues++;
  for (const master of masters) {
    if (!safeMasters.has(master) || presentation.targetCounts.get(master) !== 1) issues++;
  }
  for (const master of [...safeMasters]) if (presentation.targetCounts.get(master) !== 1) safeMasters.delete(master);
  return { safeLayouts, safeMasters, warnings: issues ? [`PPTX enthält ${issues} nicht eindeutig über interne Folien-/Layout-/Master-Beziehungen abgesicherte Vorlagenstruktur(en); Freigabe wird blockiert.`] : [] };
}
function pptxCoverageWarnings(entries, slides, safeNotes, masterCoverage) {
  // Like XLSX, PPTX remains a non-release format. This guard makes omitted
  // masters, layouts, comments, embedded objects and unknown relationships
  // visible to the local gate instead of letting rendered slide text imply
  // complete coverage.
  const supportedParts = [
    /^\[Content_Types\]\.xml$/i, /^_rels\/\.rels$/i,
    /^docProps\/(?:core|app|custom)\.xml$/i,
    /^ppt\/presentation\.xml$/i, /^ppt\/_rels\/presentation\.xml\.rels$/i,
    /^ppt\/slides\/slide\d+\.xml$/i, /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/i,
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/i,
    /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i, /^ppt\/slideLayouts\/_rels\/slideLayout\d+\.xml\.rels$/i,
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/i, /^ppt\/slideMasters\/_rels\/slideMaster\d+\.xml\.rels$/i,
    /^ppt\/charts\/chart\d+\.xml$/i, /^ppt\/charts\/_rels\/chart\d+\.xml\.rels$/i,
    /^ppt\/media\/[^/]+\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i,
    /^ppt\/embeddings\/[^/]+\.(?:docx|xlsx|pptx)$/i
  ];
  const knownRelationshipTypes = new Set([
    'officeDocument', 'core-properties', 'extended-properties', 'custom-properties',
    'slide', 'notesSlide', 'slideLayout', 'slideMaster', 'chart', 'image', 'hyperlink', 'package'
  ]);
  let issues = 0;
  for (const [name, data] of entries) {
    if (!supportedParts.some((pattern) => pattern.test(name))) issues++;
    if (/\.rels$/i.test(name)) {
      for (const match of data.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
        const type = relationshipKind(/\bType=["']([^"']+)["']/i.exec(match[1])?.[1]);
        if (!type || !knownRelationshipTypes.has(type)) issues++;
      }
    }
  }
  const presentation = entries.get('ppt/presentation.xml')?.toString('utf8') || '';
  if (!hasCompleteXmlRoot(presentation, 'presentation')) issues++;
  for (const slide of slides) {
    if (!hasCompleteXmlRoot(entries.get(slide)?.toString('utf8') || '', 'sld')) issues++;
  }
  for (const note of safeNotes) {
    if (!hasCompleteXmlRoot(entries.get(note)?.toString('utf8') || '', 'notes')) issues++;
  }
  for (const layout of masterCoverage.safeLayouts) if (!hasCompleteXmlRoot(entries.get(layout)?.toString('utf8') || '', 'sldLayout')) issues++;
  for (const master of masterCoverage.safeMasters) if (!hasCompleteXmlRoot(entries.get(master)?.toString('utf8') || '', 'sldMaster')) issues++;
  return issues
    ? [`PPTX enthält ${issues} noch nicht vollständig abgedeckte Inhaltsstruktur(en); Freigabe wird blockiert.`]
    : [];
}
function drawingText(xml) {
  // Joining adjacent rich-text runs must not invent paragraph boundaries.
  // Keep explicit line breaks and paragraphs, including numeric note text.
  const paragraphs=[];
  for(const paragraph of String(xml).matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi)) {
    const parts=[];
    for(const token of paragraph[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?\s*>/gi))parts.push(token[1]===undefined?'\n':xmlDecode(token[1]));
    paragraphs.push(parts.join(''));
  }
  return paragraphs.join('\n\n');
}
function parsePptx(entries, options = {}) {
  validatePptxXmlEntries(entries);
  const presentation=entries.get('ppt/presentation.xml')?.toString('utf8')||'';const slides=[];let issues=0,tableIssues=0,m;const rootIssues=packageMainRelationshipIssueCount(entries, 'ppt/presentation.xml');
  const sr=/<p:sldId\b([^>]+?)\/?>(?:<\/p:sldId>)?/gi;while((m=sr.exec(presentation))){const id=/\br:id=["']([^"']+)["']/i.exec(m[1])?.[1],target=id&&pptRelationshipTarget(entries,'ppt/_rels/presentation.xml.rels',id,'slide','ppt');if(!target){issues++;continue;}slides.push(target);}
  if(!presentation||!slides.length)issues++;
  const notesCoverage = pptNotesRelationshipCoverage(entries, slides);
  const masterCoverage = pptMasterLayoutCoverage(entries, slides);
  const sections=[];
  for(const [slideIndex,s] of slides.entries()){
    const n=options.preserveText?slideIndex+1:slideNumber(s),xml=entries.get(s).toString('utf8'),tableCoverage=pptSlideTableSections(xml,s,options),texts=options.preserveText?[extractionText(drawingText(tableCoverage.prose))]:textTags(tableCoverage.prose,'a:t'),slide=[`# Folie ${n}`];
    tableIssues+=tableCoverage.issues;
    if(texts.length)slide.push(texts.join('\n\n'));
    sections.push({kind:'text',source_part:s,markdown:slide.join('\n\n')});
    sections.push(...tableCoverage.tables);
    const notes=pptRelationshipTarget(entries,`ppt/slides/_rels/${path.basename(s)}.rels`,null,'notesSlide','ppt/slides');
    if(notes&&notesCoverage.safeNotes.has(notes)){const nt=options.preserveText?[extractionText(drawingText(entries.get(notes).toString('utf8')))]:textTags(entries.get(notes).toString('utf8'),'a:t').filter(x=>!/^\d+$/.test(x.trim()));if(nt.length)sections.push({kind:'text',source_part:notes,markdown:`## Notizen\n\n${nt.join('\n\n')}`});}
  }
  const chartCoverage = pptChartRelationshipCoverage(entries, slides);
  for(const [name,data] of entries) if(chartCoverage.safeCharts.has(name)){const vals=textTags(data.toString('utf8'),'c:v').concat(textTags(data.toString('utf8'),'a:t'));if(vals.length)sections.push({kind:'table',source_part:name,markdown:`## Diagrammdaten ${path.basename(name)}\n\n${vals.join(' | ')}`});}
  for(const [name,data] of entries) if(masterCoverage.safeLayouts.has(name)){const vals=textTags(data.toString('utf8'),'a:t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Folienlayout ${path.basename(name)}\n\n${vals.join('\n\n')}`});}
  for(const [name,data] of entries) if(masterCoverage.safeMasters.has(name)){const vals=textTags(data.toString('utf8'),'a:t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Folienmaster ${path.basename(name)}\n\n${vals.join('\n\n')}`});}
  sections.push(...metadataSections(entries,options));
  const imageCoverage = packageImageRelationshipCoverage(entries, 'ppt', 'PPTX', new Set(slides));
  const warnings=[...customMetadataWarnings(entries), ...pptxCoverageWarnings(entries, slides, notesCoverage.safeNotes, masterCoverage), ...imageCoverage.warnings, ...chartCoverage.warnings, ...notesCoverage.warnings, ...masterCoverage.warnings];if(issues)warnings.push(`PPTX enthält ${issues} nicht eindeutig über eine interne Folienbeziehung abgesicherte Struktur(en); Freigabe wird blockiert.`);
  if(rootIssues)warnings.push(`PPTX enthält ${rootIssues} nicht eindeutig über die interne Paketwurzel abgesicherte Struktur(en); Freigabe wird blockiert.`);
  if(tableIssues)warnings.push(`PPTX enthält ${tableIssues} nicht vollständig strukturierte DrawingML-Tabelle(n); Freigabe wird blockiert.`);
  return { markdown:sections.map(section=>section.markdown).join('\n\n'), sections, attachments:mediaAttachments(entries,'ppt/media/', imageCoverage.safeTargets), warnings };
}
function genericSecurityWarnings(entries) {
  let unsupportedEmbedded=0,active=0,external=0;
  for(const [name,data] of entries){
    if(/\/(?:embeddings)\//i.test(name)&&!SUPPORTED_EMBEDDED.test(name))unsupportedEmbedded++;
    if(/(?:^|\/)(?:vbaProject\.bin|vbaData\.xml|activeX\/|ctrlProps\/|customUI\/|externalLinks\/)/i.test(name))active++;
    if(/\.rels$/i.test(name)){
      const xml=data.toString('utf8');
      for(const match of xml.matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)){
        const attrs=match[1],type=relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
        if(/\bTargetMode\s*=\s*["']External["']/i.test(attrs))external++;
        if(['vbaProject','oleObject','control','externalLink','attachedTemplate'].includes(type))active++;
      }
    }
  }
  const warnings=[];
  if(unsupportedEmbedded)warnings.push(`OOXML enthält ${unsupportedEmbedded} nicht unterstützte eingebettete Datei(en); Freigabe wird blockiert.`);
  if(active)warnings.push(`OOXML enthält ${active} aktive oder ausführbare Inhaltsbeziehung(en); Freigabe wird blockiert.`);
  if(external)warnings.push(`OOXML enthält ${external} externe Inhaltsbeziehung(en); Freigabe wird blockiert.`);
  return warnings;
}
function relationshipBase(relPath) {
  if(relPath==='_rels/.rels')return '';
  const match=/^(.*\/)?_rels\/([^/]+)\.rels$/i.exec(relPath);
  if(!match)return null;
  return path.posix.dirname(`${match[1]||''}${match[2]}`).replace(/^\.$/, '');
}
function relationshipOwner(relPath) {
  if(relPath==='_rels/.rels')return null;
  const match=/^(.*\/)?_rels\/([^/]+)\.rels$/i.exec(relPath);
  return match?`${match[1]||''}${match[2]}`:null;
}
function embeddedRelationshipCoverage(entries, reachableParts) {
  const safeTargets=new Set(),unsafeTargets=new Set(),packageTargetCounts=new Map();let invalidPackageRelationships=0;
  const trustedParts=reachableParts instanceof Set?reachableParts:new Set();
  for(const [name,data] of entries){
    if(!/\.rels$/i.test(name))continue;
    const base=relationshipBase(name),owner=relationshipOwner(name);if(base===null||owner===null)continue;
    const xml=data.toString('utf8');
    for(const match of xml.matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)){
      const attrs=match[1],type=relationshipKind(/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]);
      const rawTarget=xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1]||'');
      const external=/\bTargetMode\s*=\s*["']External["']/i.test(attrs);
      if(!rawTarget||external)continue;
      if(/[\\?#\0]/u.test(rawTarget)||/^[a-z][a-z0-9+.-]*:/iu.test(rawTarget)){
        if(type==='package')invalidPackageRelationships++;
        continue;
      }
      const target=path.posix.normalize(path.posix.join(base,rawTarget.replace(/^\/+/,'')));
      if(target==='..'||target.startsWith('../')){
        if(type==='package')invalidPackageRelationships++;
        continue;
      }
      if(type==='package'){
        // A relationship from an orphan custom/XML part must not make an
        // embedding eligible merely because it happens to name a supported
        // file. The owning part itself has to have been reached by the
        // format-specific parser before its package edge is trusted.
        if(!trustedParts.has(owner))invalidPackageRelationships++;
        else if(SUPPORTED_EMBEDDED.test(target)&&entries.has(target)){
          packageTargetCounts.set(target,(packageTargetCounts.get(target)||0)+1);
          safeTargets.add(target);
        }
        else invalidPackageRelationships++;
      } else if(SUPPORTED_EMBEDDED.test(target))unsafeTargets.add(target);
    }
  }
  let missing=0;
  for(const name of entries.keys())if(SUPPORTED_EMBEDDED.test(name)){
    if(!safeTargets.has(name)||unsafeTargets.has(name)||packageTargetCounts.get(name)!==1)missing++;
    if(unsafeTargets.has(name))safeTargets.delete(name);
    if(packageTargetCounts.get(name)!==1)safeTargets.delete(name);
  }
  const warnings=[];
  if(missing||invalidPackageRelationships)warnings.push(`OOXML enthält ${missing+invalidPackageRelationships} nicht eindeutig über eine interne Paketbeziehung abgesicherte Einbettung(en); Freigabe wird blockiert.`);
  return {safeTargets,warnings};
}
function embeddedState(context) {
  if(context===undefined)return {depth:0,budget:{documents:0,archiveBytes:0,expandedBytes:0}};
  const values=[context?.depth,context?.budget?.documents,context?.budget?.archiveBytes,context?.budget?.expandedBytes];
  if(values.every(value=>Number.isSafeInteger(value)&&value>=0))return context;
  throw new Error('EMBEDDED_CONTEXT_INVALID');
}
function augmentEmbedded(result, entries, context, options = {}) {
  const state=embeddedState(context);
  const reachableParts=new Set(result.sections.map((section)=>section.source_part));
  const coverage=embeddedRelationshipCoverage(entries,reachableParts),matches=[];
  result.warnings.push(...coverage.warnings);
  for(const [name,data]of entries){const match=SUPPORTED_EMBEDDED.exec(name);if(match&&coverage.safeTargets.has(name))matches.push({name,data,ext:`.${match[1].toLowerCase()}`});}
  let ordinal=0;
  for(const embedded of matches){
    ordinal++;
    if(state.depth>=MAX_EMBEDDED_DEPTH){result.warnings.push('OOXML-Einbettung überschreitet die erlaubte Rekursionstiefe; Freigabe wird blockiert.');continue;}
    if(state.budget.documents>=MAX_EMBEDDED_DOCUMENTS){result.warnings.push('OOXML enthält zu viele eingebettete Dokumente; Freigabe wird blockiert.');continue;}
    if(embedded.data.length>MAX_EMBEDDED_BYTES-state.budget.archiveBytes){result.warnings.push('OOXML-Einbettungen überschreiten das erlaubte Archivbytebudget; Freigabe wird blockiert.');continue;}
    state.budget.documents++;
    state.budget.archiveBytes+=embedded.data.length;
    let nested;
    try{nested=parseOoxml(embedded.data,embedded.ext,{depth:state.depth+1,budget:state.budget},options);}
    catch{result.warnings.push('Eingebettetes OOXML-Dokument konnte nicht vollständig geprüft werden; Freigabe wird blockiert.');continue;}
    result.sections.push({kind:'text',source_part:embedded.name,markdown:`## Eingebettetes Dokument ${ordinal}`});
    for(const section of nested.sections)result.sections.push({...section,source_part:`${embedded.name}!/${section.source_part}`});
    for(const attachment of nested.attachments)result.attachments.push({...attachment,source_part:`${embedded.name}!/${attachment.source_part}`});
    result.warnings.push(...nested.warnings);
  }
  result.markdown=result.sections.map(section=>section.markdown).join('\n\n');
  return result;
}
function parseOoxml(buffer, ext, context, options = {}) {
  const state=embeddedState(context);
  let zipLimits={};
  if(state.depth>0){
    const remainingExpanded=MAX_EMBEDDED_EXPANDED_BYTES-state.budget.expandedBytes;
    if(remainingExpanded<=0)throw new Error('EMBEDDED_EXPANDED_BUDGET_EXCEEDED');
    zipLimits={maxUncompressed:remainingExpanded};
  }
  let entries; try{entries=readZip(buffer,zipLimits);}catch(e){if(e instanceof ZipError)throw e;throw new Error('Office-Datei konnte nicht als OOXML gelesen werden.');}
  if(options.preserveText){
    for(const [name,data]of entries)if(/\.(?:xml|rels)$/i.test(name)){
      try{new TextDecoder('utf-8',{fatal:true}).decode(data);}
      catch{const error=new Error('OOXML-Zeichencodierung ist ungültig.');error.code='OOXML_ENCODING_INVALID';throw error;}
    }
  }
  if(state.depth>0){
    let expanded=0;for(const data of entries.values())expanded+=data.length;
    if(expanded>MAX_EMBEDDED_EXPANDED_BYTES-state.budget.expandedBytes)throw new Error('EMBEDDED_EXPANDED_BUDGET_EXCEEDED');
    state.budget.expandedBytes+=expanded;
  }
  let result;
  if(ext==='.docx')result=parseDocx(entries,options);
  else if(ext==='.xlsx')result=parseXlsx(entries,options);
  else if(ext==='.pptx')result=parsePptx(entries,options);
  else throw new Error('OOXML-Format nicht unterstützt.');
  if(ext!=='.docx')result.warnings.push(...genericSecurityWarnings(entries));
  if(options.preserveText){
    // This entry is an engineering extractor, not a format-release switch.
    // Styles, fields, hidden content and other unmodelled object semantics may
    // carry meaning beyond their literal text. Do not claim complete coverage.
    if(ext!=='.docx'||docxExtractionHasUnverifiedContent(entries))result.warnings.push('MARKDOWN_SOURCE_COVERAGE_UNVERIFIED');
  }
  return augmentEmbedded(result,entries,state,options);
}

function docxExtractionHasUnverifiedContent(entries) {
  const provenTags=new Set(['w:p','w:r','w:t','w:tab','w:br','w:cr','w:tbl','w:tr','w:tc','w:pPr','w:rPr',
    'w:tblPr','w:tblGrid','w:gridCol','w:trPr','w:tcPr','w:tblHeader','w:b','w:i','w:u','w:sz','w:szCs',
    'w:rFonts','w:color','w:highlight','w:jc','w:spacing','w:ind','w:keepNext','w:keepLines','w:widowControl',
    'w:sectPr','w:pgSz','w:pgMar','w:cols','w:docGrid','w:tblW','w:tcW','w:tblBorders','w:tcBorders',
    'w:top','w:left','w:bottom','w:right','w:insideH','w:insideV','w:shd','w:vAlign','w:lang','w:proofErr']);
  // Only the explicitly modelled main story is currently proven. Other story,
  // metadata or resource parts are still extracted where possible but remain
  // incomplete until their semantic attachments and coverage are verified.
  for(const name of entries.keys())if(!['[Content_Types].xml','_rels/.rels','word/document.xml'].includes(name))return true;
  const scope=wordPartScope(entries.get('word/document.xml').toString('utf8'),'body');
  for(const match of scope.body.matchAll(/<([A-Za-z_][\w.:-]*)\b/g))if(!provenTags.has(match[1]))return true;
  return false;
}

module.exports={
  parseOoxml,parseDocx,parseXlsx,parsePptx,docxCoverageWarnings,xmlDecode,stripTags,contentType,
  MAX_EMBEDDED_DEPTH,MAX_EMBEDDED_DOCUMENTS,MAX_EMBEDDED_BYTES,MAX_EMBEDDED_EXPANDED_BYTES
};
