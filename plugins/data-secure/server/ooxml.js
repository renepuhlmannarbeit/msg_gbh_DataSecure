'use strict';

const path = require('path');
const { readZip, ZipError } = require('./zip-reader');

const MAX_EMBEDDED_DEPTH = 3;
const MAX_EMBEDDED_DOCUMENTS = 20;
const MAX_EMBEDDED_BYTES = 50 * 1024 * 1024;
const MAX_EMBEDDED_EXPANDED_BYTES = 100 * 1024 * 1024;
const SUPPORTED_EMBEDDED = /^(?:word|xl|ppt)\/embeddings\/[^/]+\.(docx|xlsx|pptx)$/i;

function xmlDecode(s='') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#([0-9]+);/g, (_,d)=>String.fromCodePoint(parseInt(d,10)))
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
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
function metadataSection(entries, sourcePart, fields) {
  const data=entries.get(sourcePart); if(!data)return null; const xml=data.toString('utf8'), lines=[];
  for(const [tag,label] of fields){const value=textTags(xml,tag).map(item=>String(item).replace(/\s+/g,' ').trim()).filter(Boolean).join(' | ');if(value)lines.push(`- ${label}: ${value}`);}
  return lines.length?{kind:'metadata',source_part:sourcePart,markdown:`## Dokumentmetadaten\n\n${lines.join('\n')}`}:null;
}
function customMetadataSection(entries) {
  const sourcePart='docProps/custom.xml',data=entries.get(sourcePart);if(!data)return null;
  const xml=data.toString('utf8'),lines=[];let match;const properties=/<property\b([^>]*)>([\s\S]*?)<\/property>/gi;
  const scalar=/^\s*<vt:(lpwstr|bstr|i1|i2|i4|i8|int|ui1|ui2|ui4|ui8|uint|r4|r8|decimal|bool|filetime|date|cy|error)\b[^>]*>([\s\S]*?)<\/vt:\1>\s*$/i;
  while((match=properties.exec(xml))){const name=xmlDecode(/\bname=["']([^"']+)["']/i.exec(match[1])?.[1]||'').trim();const valueMatch=scalar.exec(match[2]);const value=valueMatch?stripTags(valueMatch[2]):'';if(name&&value)lines.push(`- ${name}: ${value}`);}
  return lines.length?{kind:'metadata',source_part:sourcePart,markdown:`## Benutzerdefinierte Dokumentmetadaten\n\n${lines.join('\n')}`}:null;
}
function customMetadataWarnings(entries) {
  const data=entries.get('docProps/custom.xml');if(!data)return[];const xml=data.toString('utf8');let unsupported=0,match;
  const properties=/<property\b[^>]*>([\s\S]*?)<\/property>/gi;
  const scalar=/^\s*<vt:(lpwstr|bstr|i1|i2|i4|i8|int|ui1|ui2|ui4|ui8|uint|r4|r8|decimal|bool|filetime|date|cy|error)\b[^>]*>[\s\S]*?<\/vt:\1>\s*$/i;
  while((match=properties.exec(xml)))if(!scalar.test(match[1]))unsupported++;
  return unsupported?[`OOXML enthält ${unsupported} nicht unterstützte benutzerdefinierte Metadatenwerte; Freigabe wird blockiert.`]:[];
}
function metadataSections(entries) {
  return [
    metadataSection(entries,'docProps/core.xml',CORE_PROPERTIES),
    metadataSection(entries,'docProps/app.xml',APP_PROPERTIES),
    customMetadataSection(entries)
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
function renderPptTable(table) {
  // DrawingML tables have their visible cells in a:tc/a:txBody/a:t. Render
  // them structurally instead of flattening them into slide prose.  The
  // caller has already established that the containing slide is reachable.
  const rows = []; let row;
  const rowRe = /<a:tr\b[\s\S]*?<\/a:tr>/gi;
  while ((row = rowRe.exec(table))) {
    const cells = []; let cell;
    const cellRe = /<a:tc\b[\s\S]*?<\/a:tc>/gi;
    while ((cell = cellRe.exec(row[0]))) cells.push(escapeMarkdownTableCell(textTags(cell[0], 'a:t').join('\n')));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((cells) => cells.length));
  const normalized = rows.map((cells) => Array.from({ length: cols }, (_, index) => cells[index] || ''));
  return '| ' + normalized[0].join(' | ') + ' |\n| ' + normalized[0].map(() => '---').join(' | ') + ' |' +
    (normalized.length > 1 ? '\n' + normalized.slice(1).map((cells) => '| ' + cells.join(' | ') + ' |').join('\n') : '');
}
function pptSlideTableSections(xml, sourcePart) {
  const source = String(xml);
  const opened = (source.match(/<a:tbl\b/gi) || []).length;
  const closed = (source.match(/<\/a:tbl\s*>/gi) || []).length;
  const tables = []; let match;
  const tableRe = /<a:tbl\b[\s\S]*?<\/a:tbl>/gi;
  while ((match = tableRe.exec(source))) {
    const markdown = renderPptTable(match[0]);
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
function wordPartScope(xml, rootTag) {
  const escaped = String(rootTag).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<w:${escaped}\\b[^>]*>([\\s\\S]*?)<\\/w:${escaped}>`, 'i').exec(xml)?.[1] || '';
}
function renderWordPart(xml, rootTag) {
  const body = wordPartScope(String(xml), rootTag);
  if (!body) return '';
  return renderWordStructure(parseWordStructure(body));
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
function parseWordStructure(body) {
  const root = { type: 'root', children: [] };
  const stack = [{ name: '', node: root, skipped: false, boxes: 0 }];
  // Quoted attribute values may contain `>`; an unquoted `<` is never a tag.
  const tag = /<(\/)?([A-Za-z_][\w.:-]*)(?=[\s/>])((?:[^<>"']|"[^"<]*"|'[^'<]*')*)>/y;
  const attribute = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/gy;
  let cursor = 0, nodes = 0, elements = 0;
  function flush(node) {
    if (node.type !== 'p' || !node.pending.length) return;
    const value = node.pending.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
        catch { throw wordStructureError(); }
      } else if (!frame.skipped && /^(?:|w:p|w:tbl|w:tr|w:tc)$/.test(frame.name) && /\S/.test(body.slice(cursor, end))) {
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
    const skipped = frame.skipped || name === 'mc:Fallback';
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
      } else if (node.type === 'p' && name === 'w:pStyle') {
        const level = /^heading\s*([1-6])$/i.exec(attrs.get('w:val') || '')?.[1];
        if (level) node.prefix = '#'.repeat(Number(level)) + ' ';
      } else if (node.type === 'p' && name === 'w:numPr' && !node.prefix) node.prefix = '- ';
    }
    if (!selfClosing) stack.push({ name, node, skipped, boxes, created });
    else if (created) flush(node);
  }
  if (stack.length !== 1) throw wordStructureError();
  return root;
}
function renderWordStructure(root) {
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
        write(inCell ? escapeMarkdownTableCell(child) : child);
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
      if (!inCell && rowIndex === 0) {
        write('\n| ---');
        repeat(' | ---', columns - 1);
        write(' |');
      }
    }
  }
  emit(root, false);
  return output.join('');
}
function renderWordBody(xml) { return renderWordPart(xml, 'body'); }
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
    const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
  // The renderer needs a complete XML scope.  Merely finding an opening Word
  // tag is not coverage evidence: a truncated part would otherwise render as
  // empty and could appear safe to the downstream gate.  Empty self-closing
  // secondary stories are valid and contain no text, so keep that case.
  const opening = new RegExp(`<w:${rootTag}\\b[^>]*>`, 'i').exec(xml);
  if (!opening) return false;
  if (/\/\s*>$/u.test(opening[0])) return true;
  return new RegExp(`</w:${rootTag}\\s*>`, 'i').test(xml.slice(opening.index + opening[0].length));
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
    const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
  const stories = [...entries.keys()].filter((name) =>
    /^word\/(?:header\d+|footer\d+|comments|footnotes|endnotes)\.xml$/i.test(name)
  );
  if (!stories.length) return 0;
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
  let issues = 0;
  for (const match of rels.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
    const attrs = match[1];
    const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
    if (!expected.has(type)) continue;
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
  for (const story of stories) if (!reachable.has(story)) issues++;
  return issues;
}
function docxImageRelationshipCoverage(entries) {
  // Picture bytes are sensitive content just like text.  A Word media part is
  // therefore not an attachment merely because its filename looks familiar:
  // it must be referenced by one internal image relationship from a covered
  // Word part.  This avoids displaying an orphan or substituted binary in a
  // local review window.
  const media = new Set([...entries.keys()].filter((name) =>
    /^word\/media\/[^/]+\.(?:png|jpe?g|bmp|gif|tiff?|webp|svg|emf|wmf)$/i.test(name)
  ));
  const safeTargets = new Set();
  let issues = 0;
  for (const [relPath, data] of entries) {
    if (!/^word\/(?:_rels\/)?[^/]+\.rels$/i.test(relPath)) continue;
    const base = relationshipBase(relPath);
    if (base === null) continue;
    for (const match of data.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
      const attrs = match[1];
      const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
        if (!media.has(target)) issues++;
        else safeTargets.add(target);
      } else if (media.has(target)) {
        issues++;
      }
    }
  }
  for (const name of media) if (!safeTargets.has(name)) issues++;
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
      const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
  let unsupported = 0;
  for (const [name, data] of entries) {
    if (!supported.some((pattern) => pattern.test(name))) unsupported++;
    if (/\.rels$/i.test(name)) {
      const xml = data.toString('utf8');
      const relationships = xml.matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi);
      for (const match of relationships) {
        const attrs = match[1];
        const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
        if (!expected || contentType !== expected || !entries.has(String(part || '').replace(/^\//, ''))) {
          unsupported++;
        }
      }
    }
  }
  unsupported += docxMainRelationshipIssueCount(entries);
  unsupported += docxMainWordRootIssueCount(entries);
  unsupported += docxStoryRelationshipIssueCount(entries);
  return unsupported
    ? [`DOCX enthält ${unsupported} nicht unterstützte inhaltsfähige OOXML-Part(s); Companion-Freigabe wird blockiert.`]
    : [];
}
function parseDocx(entries) {
  const main=entries.get('word/document.xml'); if(!main) throw new Error('DOCX enthält kein word/document.xml.');
  const sections=[]; const body=renderWordBody(main.toString('utf8'));
  if(body)sections.push({kind:'text',source_part:'word/document.xml',markdown:body});
  for(const [name,data] of entries) if(/^word\/(header|footer)\d+\.xml$/i.test(name)) {
    const root=name.includes('header')?'hdr':'ftr'; const t=renderWordPart(data.toString('utf8'),root);
    if(t) sections.push({kind:'text',source_part:name,markdown:`## ${root==='hdr'?'Kopfzeile':'Fußzeile'}\n\n${t}`});
  }
  for(const [extra,root,label] of [
    ['word/comments.xml','comments','Kommentare'],
    ['word/footnotes.xml','footnotes','Fußnoten'],
    ['word/endnotes.xml','endnotes','Endnoten']
  ]) if(entries.has(extra)) {
    const t=renderWordPart(entries.get(extra).toString('utf8'),root);
    if(t)sections.push({kind:'text',source_part:extra,markdown:`## ${label}\n\n${t}`});
  }
  sections.push(...metadataSections(entries));
  const imageCoverage = docxImageRelationshipCoverage(entries);
  return { markdown:sections.map(section=>section.markdown).join('\n\n'), sections, attachments:mediaAttachments(entries,'word/media/', imageCoverage.safeTargets), warnings:[...docxCoverageWarnings(entries),...imageCoverage.warnings,...customMetadataWarnings(entries)] };
}
function sharedStrings(entries) {
  const b=entries.get('xl/sharedStrings.xml'); if(!b)return[]; const xml=b.toString('utf8'), out=[]; let m; const re=/<si\b[\s\S]*?<\/si>/gi; while((m=re.exec(xml)))out.push(textTags(m[0],'t').join('')); return out;
}
function colNumber(ref) { const m=/^([A-Z]+)/i.exec(ref||''); if(!m)return 0; let n=0; for(const c of m[1].toUpperCase())n=n*26+(c.charCodeAt(0)-64); return n; }
function xlsxSheetRelationshipMap(entries) {
  const rels = entries.get('xl/_rels/workbook.xml.rels');
  if (!rels) return { targets: new Map(), issues: 1 };
  const targets = new Map(); let issues = 0;
  for (const match of rels.toString('utf8').matchAll(/<Relationship\b([^>]+?)\/?>(?:<\/Relationship>)?/gi)) {
    const attrs = match[1];
    const id = /\bId=["']([^"']+)["']/i.exec(attrs)?.[1];
    const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
    const target = xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1] || '');
    const external = /\bTargetMode\s*=\s*["']External["']/i.test(attrs);
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
    const type = /\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
        const type = /\bType=["']([^"']+)["']/i.exec(match[1])?.[1]?.split('/').pop();
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
function parseXlsx(entries) {
  const shared=sharedStrings(entries); const workbook=entries.get('xl/workbook.xml')?.toString('utf8')||''; const relationState=xlsxSheetRelationshipMap(entries); const rootIssues=packageMainRelationshipIssueCount(entries, 'xl/workbook.xml');
  const sheetMeta=[]; let issues=relationState.issues; let sm; const sr=/<sheet\b([^>]+?)\/?>(?:<\/sheet>)?/gi; while((sm=sr.exec(workbook))){const a=sm[1],name=xmlDecode(/\bname="([^"]+)"/i.exec(a)?.[1]||'Sheet'),rid=/\br:id="([^"]+)"/i.exec(a)?.[1]; const target=rid&&relationState.targets.get(rid); if(!rid||!target) { issues++; continue; } sheetMeta.push({name,target});}
  if(!workbook || !sheetMeta.length) issues++;
  const sections=[]; let formulaCells=0;
  for(const s of sheetMeta){const buf=entries.get(s.target);if(!buf)continue;const xml=buf.toString('utf8');const rows=[];let rm;const rr=/<row\b[\s\S]*?<\/row>/gi;while((rm=rr.exec(xml))){const vals=[];let cm;const cr=/<c\b([^>]*)>([\s\S]*?)<\/c>/gi;while((cm=cr.exec(rm[0]))){const attrs=cm[1],body=cm[2],ref=/\br="([^"]+)"/i.exec(attrs)?.[1]||'',idx=colNumber(ref)-1,t=/\bt="([^"]+)"/i.exec(attrs)?.[1]||'';if(/<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>/i.test(body))formulaCells++;let v=/<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1]??'';if(t==='s')v=shared[Number(v)]??v;else if(t==='inlineStr')v=textTags(body,'t').join('');else if(t==='str')v=xmlDecode(v);vals[idx<0?vals.length:idx]=String(v); } if(vals.some(v=>String(v||'').trim()))rows.push(vals);}
    const parts=[`# Arbeitsblatt: ${s.name}`]; if(rows.length){const cols=Math.min(100,Math.max(...rows.map(r=>r.length)));const norm=rows.slice(0,10000).map(r=>Array.from({length:cols},(_,i)=>String(r[i]??'').replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/\r?\n/g,'<br>')));parts.push('| '+norm[0].join(' | ')+' |');parts.push('| '+norm[0].map(()=> '---').join(' | ')+' |');for(const r of norm.slice(1))parts.push('| '+r.join(' | ')+' |');if(rows.length>10000)parts.push('> Weitere Zeilen wurden aus Sicherheitsgründen nicht automatisch gerendert.');} sections.push({kind:'table',source_part:s.target,markdown:parts.join('\n\n')});
  }
  const supplementCoverage = xlsxSupplementRelationshipCoverage(entries, sheetMeta);
  const commentCoverage = xlsxCommentRelationshipCoverage(entries, sheetMeta);
  for(const [name,data] of entries) if(supplementCoverage.safeCharts.has(name)){const vals=textTags(data.toString('utf8'),'c:v').concat(textTags(data.toString('utf8'),'a:t')); if(vals.length)sections.push({kind:'table',source_part:name,markdown:`## Diagrammdaten ${path.basename(name)}\n\n${vals.join(' | ')}`});}
  for(const [name,data]of entries)if(supplementCoverage.safeDrawings.has(name)){const vals=textTags(data.toString('utf8'),'a:t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Grafiktext ${path.basename(name)}\n\n${vals.join(' ')}`});}
  for(const [name,data]of entries)if(commentCoverage.safeComments.has(name)){const vals=textTags(data.toString('utf8'),'t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Tabellenkommentare\n\n${vals.join('\n\n')}`});}
  sections.push(...metadataSections(entries));
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
    const attrs=match[1],rid=/\bId=["']([^"']+)["']/i.exec(attrs)?.[1],type=/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop(),raw=xmlDecode(/\bTarget=["']([^"']+)["']/i.exec(attrs)?.[1]||'');
    if(id ? rid!==id : type!==expectedType)continue;
    if(type!==expectedType||/\bTargetMode\s*=\s*["']External["']/i.test(attrs)||!raw||/[\\?#\0]/u.test(raw)||/^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(raw))return null;
    const target=path.posix.normalize(path.posix.join(base,raw)); if(!target.startsWith('ppt/')||!entries.has(target))return null;
    if(resolvedTarget!==null)return null;
    resolvedTarget=target;
  }
  return resolvedTarget;
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
        const type = /\bType=["']([^"']+)["']/i.exec(match[1])?.[1]?.split('/').pop();
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
function parsePptx(entries) {
  const presentation=entries.get('ppt/presentation.xml')?.toString('utf8')||'';const slides=[];let issues=0,tableIssues=0,m;const rootIssues=packageMainRelationshipIssueCount(entries, 'ppt/presentation.xml');
  const sr=/<p:sldId\b([^>]+?)\/?>(?:<\/p:sldId>)?/gi;while((m=sr.exec(presentation))){const id=/\br:id=["']([^"']+)["']/i.exec(m[1])?.[1],target=id&&pptRelationshipTarget(entries,'ppt/_rels/presentation.xml.rels',id,'slide','ppt');if(!target){issues++;continue;}slides.push(target);}
  if(!presentation||!slides.length)issues++;
  const notesCoverage = pptNotesRelationshipCoverage(entries, slides);
  const masterCoverage = pptMasterLayoutCoverage(entries, slides);
  const sections=[];
  for(const s of slides){
    const n=slideNumber(s),xml=entries.get(s).toString('utf8'),tableCoverage=pptSlideTableSections(xml,s),texts=textTags(tableCoverage.prose,'a:t'),slide=[`# Folie ${n}`];
    tableIssues+=tableCoverage.issues;
    if(texts.length)slide.push(texts.join('\n\n'));
    sections.push({kind:'text',source_part:s,markdown:slide.join('\n\n')});
    sections.push(...tableCoverage.tables);
    const notes=pptRelationshipTarget(entries,`ppt/slides/_rels/${path.basename(s)}.rels`,null,'notesSlide','ppt/slides');
    if(notes&&notesCoverage.safeNotes.has(notes)){const nt=textTags(entries.get(notes).toString('utf8'),'a:t').filter(x=>!/^\d+$/.test(x.trim()));if(nt.length)sections.push({kind:'text',source_part:notes,markdown:`## Notizen\n\n${nt.join('\n\n')}`});}
  }
  const chartCoverage = pptChartRelationshipCoverage(entries, slides);
  for(const [name,data] of entries) if(chartCoverage.safeCharts.has(name)){const vals=textTags(data.toString('utf8'),'c:v').concat(textTags(data.toString('utf8'),'a:t'));if(vals.length)sections.push({kind:'table',source_part:name,markdown:`## Diagrammdaten ${path.basename(name)}\n\n${vals.join(' | ')}`});}
  for(const [name,data] of entries) if(masterCoverage.safeLayouts.has(name)){const vals=textTags(data.toString('utf8'),'a:t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Folienlayout ${path.basename(name)}\n\n${vals.join('\n\n')}`});}
  for(const [name,data] of entries) if(masterCoverage.safeMasters.has(name)){const vals=textTags(data.toString('utf8'),'a:t');if(vals.length)sections.push({kind:'text',source_part:name,markdown:`## Folienmaster ${path.basename(name)}\n\n${vals.join('\n\n')}`});}
  sections.push(...metadataSections(entries));
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
        const attrs=match[1],type=/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
      const attrs=match[1],type=/\bType=["']([^"']+)["']/i.exec(attrs)?.[1]?.split('/').pop();
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
function augmentEmbedded(result, entries, context) {
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
    try{nested=parseOoxml(embedded.data,embedded.ext,{depth:state.depth+1,budget:state.budget});}
    catch{result.warnings.push('Eingebettetes OOXML-Dokument konnte nicht vollständig geprüft werden; Freigabe wird blockiert.');continue;}
    result.sections.push({kind:'text',source_part:embedded.name,markdown:`## Eingebettetes Dokument ${ordinal}`});
    for(const section of nested.sections)result.sections.push({...section,source_part:`${embedded.name}!/${section.source_part}`});
    for(const attachment of nested.attachments)result.attachments.push({...attachment,source_part:`${embedded.name}!/${attachment.source_part}`});
    result.warnings.push(...nested.warnings);
  }
  result.markdown=result.sections.map(section=>section.markdown).join('\n\n');
  return result;
}
function parseOoxml(buffer, ext, context) {
  const state=embeddedState(context);
  let zipLimits={};
  if(state.depth>0){
    const remainingExpanded=MAX_EMBEDDED_EXPANDED_BYTES-state.budget.expandedBytes;
    if(remainingExpanded<=0)throw new Error('EMBEDDED_EXPANDED_BUDGET_EXCEEDED');
    zipLimits={maxUncompressed:remainingExpanded};
  }
  let entries; try{entries=readZip(buffer,zipLimits);}catch(e){if(e instanceof ZipError)throw e;throw new Error('Office-Datei konnte nicht als OOXML gelesen werden.');}
  if(state.depth>0){
    let expanded=0;for(const data of entries.values())expanded+=data.length;
    if(expanded>MAX_EMBEDDED_EXPANDED_BYTES-state.budget.expandedBytes)throw new Error('EMBEDDED_EXPANDED_BUDGET_EXCEEDED');
    state.budget.expandedBytes+=expanded;
  }
  let result;
  if(ext==='.docx')result=parseDocx(entries);
  else if(ext==='.xlsx')result=parseXlsx(entries);
  else if(ext==='.pptx')result=parsePptx(entries);
  else throw new Error('OOXML-Format nicht unterstützt.');
  if(ext!=='.docx')result.warnings.push(...genericSecurityWarnings(entries));
  return augmentEmbedded(result,entries,state);
}

module.exports={
  parseOoxml,parseDocx,parseXlsx,parsePptx,docxCoverageWarnings,xmlDecode,stripTags,contentType,
  MAX_EMBEDDED_DEPTH,MAX_EMBEDDED_DOCUMENTS,MAX_EMBEDDED_BYTES,MAX_EMBEDDED_EXPANDED_BYTES
};
