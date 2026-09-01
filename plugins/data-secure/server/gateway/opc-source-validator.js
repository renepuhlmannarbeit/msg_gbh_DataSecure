'use strict';

const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL_TYPES = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument'
]);
const OFFICE_REL_NAMESPACES = Object.freeze([
  'http://schemas.openxmlformats.org/officedocument/2006/relationships/',
  'http://purl.oclc.org/ooxml/officedocument/relationships/'
]);
const PACKAGE_REL_NAMESPACES = Object.freeze([
  'http://schemas.openxmlformats.org/package/2006/relationships/',
  'http://purl.oclc.org/ooxml/package/relationships/'
]);
const BLOCKED_OFFICE_RELATIONSHIP_NAMES = new Set([
  'oleobject',
  'package',
  'attachedtemplate',
  'externallink',
  'vbaproject',
  'customui',
  'activex'
]);
const BLOCKED_MICROSOFT_REL_TYPES = new Set([
  'http://schemas.microsoft.com/office/2006/relationships/vbaproject',
  'http://schemas.microsoft.com/office/2006/relationships/activexcontrol',
  'http://schemas.microsoft.com/office/2006/relationships/activexcontrolbinary',
  'http://schemas.microsoft.com/office/2006/relationships/ui/extensibility',
  'http://schemas.microsoft.com/office/2007/relationships/ui/extensibility'
]);
const MAIN = Object.freeze({
  docx: Object.freeze({
    part: 'word/document.xml',
    contentTypes: new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'
    ])
  }),
  xlsx: Object.freeze({
    part: 'xl/workbook.xml',
    contentTypes: new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
    ])
  }),
  pptx: Object.freeze({
    part: 'ppt/presentation.xml',
    contentTypes: new Set([
      'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'
    ])
  })
});

class OpcValidationError extends Error {
  constructor(code = 'SOURCE_CONTAINER_CORRUPT') {
    super(code);
    this.name = 'OpcValidationError';
    this.code = code;
  }
}

function decodeXmlValue(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/giu, (entity) => {
    const fixed = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[entity];
    if (fixed !== undefined) return fixed;
    const hex = entity.startsWith('&#x');
    const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    if (!Number.isSafeInteger(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw new OpcValidationError();
    }
    return String.fromCodePoint(code);
  });
}

function parseAttributes(source) {
  const attributes = new Map();
  let offset = 0;
  while (offset < source.length) {
    const whitespace = /^\s+/u.exec(source.slice(offset));
    if (!whitespace) throw new OpcValidationError();
    offset += whitespace[0].length;
    if (offset === source.length) break;
    const name = /^[A-Za-z_][A-Za-z0-9_.:-]*/u.exec(source.slice(offset));
    if (!name || attributes.has(name[0])) throw new OpcValidationError();
    offset += name[0].length;
    const equals = /^\s*=\s*/u.exec(source.slice(offset));
    if (!equals) throw new OpcValidationError();
    offset += equals[0].length;
    const quote = source[offset];
    if (!['"', "'"].includes(quote)) throw new OpcValidationError();
    const end = source.indexOf(quote, offset + 1);
    if (end < 0) throw new OpcValidationError();
    const raw = source.slice(offset + 1, end);
    if (raw.includes('<') || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/iu.test(raw)) {
      throw new OpcValidationError();
    }
    attributes.set(name[0], decodeXmlValue(raw));
    offset = end + 1;
  }
  return attributes;
}

function parseXml(text, expectedNamespace, expectedRoot) {
  if (typeof text !== 'string' || text.length === 0 || /<!DOCTYPE|<!ENTITY/iu.test(text)) {
    throw new OpcValidationError();
  }
  const stack = [];
  const nodes = [];
  let root;
  let rootClosed = false;
  let offset = 0;
  while (offset < text.length) {
    const open = text.indexOf('<', offset);
    if (open < 0) {
      if (/\S/u.test(text.slice(offset))) throw new OpcValidationError();
      break;
    }
    if (/\S/u.test(text.slice(offset, open))) throw new OpcValidationError();
    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4);
      if (end < 0 || text.slice(open + 4, end).includes('--')) throw new OpcValidationError();
      offset = end + 3;
      continue;
    }
    if (text.startsWith('<?', open)) {
      const end = text.indexOf('?>', open + 2);
      if (end < 0) throw new OpcValidationError();
      offset = end + 2;
      continue;
    }
    if (text.startsWith('<!', open)) throw new OpcValidationError();
    let end = open + 1;
    let quote = null;
    for (; end < text.length; end++) {
      const char = text[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= text.length || quote) throw new OpcValidationError();
    let body = text.slice(open + 1, end);
    if (body.startsWith('/')) {
      const closing = /^\/([A-Za-z_][A-Za-z0-9_.:-]*)\s*$/u.exec(body);
      if (!closing || stack.pop()?.qname !== closing[1]) throw new OpcValidationError();
      if (stack.length === 0) rootClosed = true;
      offset = end + 1;
      continue;
    }
    if (rootClosed) throw new OpcValidationError();
    const selfClosing = /\/\s*$/u.test(body);
    if (selfClosing) body = body.replace(/\/\s*$/u, '');
    const head = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/u.exec(body);
    if (!head) throw new OpcValidationError();
    const attributes = parseAttributes(head[2]);
    const namespaces = new Map(stack.at(-1)?.namespaces || []);
    for (const [name, value] of attributes) {
      if (name === 'xmlns') namespaces.set('', value);
      else if (name.startsWith('xmlns:')) namespaces.set(name.slice(6), value);
    }
    const split = head[1].split(':');
    if (split.length > 2) throw new OpcValidationError();
    const prefix = split.length === 2 ? split[0] : '';
    const node = { qname: head[1], localName: split.at(-1), namespaceURI: namespaces.get(prefix) || '', attributes, namespaces };
    if (!root) root = node;
    nodes.push(node);
    if (!selfClosing) stack.push(node);
    else if (stack.length === 0) rootClosed = true;
    offset = end + 1;
  }
  if (stack.length || !root || root.localName !== expectedRoot || root.namespaceURI !== expectedNamespace) {
    throw new OpcValidationError();
  }
  return nodes;
}

function elements(nodes, namespace, localName) {
  return nodes.filter((node) => node.namespaceURI === namespace && node.localName === localName);
}

function attribute(node, name) {
  return node.attributes.get(name) || '';
}

function canonicalTargetSegments(value) {
  const target = String(value || '');
  if (!target || target.includes('\\') || target.includes('?') || target.includes('#') ||
      target.startsWith('/') || /^[a-z][a-z0-9+.-]*:/iu.test(target)) return null;
  const parts = [];
  for (const rawPart of target.split('/')) {
    if (!rawPart) return null;
    let decoded;
    try { decoded = decodeURIComponent(rawPart); } catch { return null; }
    if (!decoded || decoded === '.' || decoded.includes('/') || decoded.includes('\\') ||
      decoded.includes('?') || decoded.includes('#') ||
      (decoded === '..' && rawPart !== '..')) return null;
    parts.push(decoded);
  }
  return parts;
}

function resolveRelationshipTarget(relationshipPart, target) {
  const targetParts = canonicalTargetSegments(target);
  if (!targetParts) return null;
  let resolved = [];
  if (relationshipPart === '_rels/.rels') {
    resolved = [];
  } else {
    const match = /^(.*\/)?_rels\/([^/]+)\.rels$/u.exec(relationshipPart);
    if (!match) return null;
    const sourcePart = `${match[1] || ''}${match[2]}`;
    resolved = sourcePart.split('/').slice(0, -1);
  }
  for (const part of targetParts) {
    if (part === '..') {
      if (resolved.length === 0) return null;
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  if (resolved.length === 0) return null;
  return resolved.join('/');
}

function isBlockedRelationshipType(value) {
  const type = String(value || '').toLowerCase();
  if (BLOCKED_MICROSOFT_REL_TYPES.has(type)) return true;
  for (const namespace of OFFICE_REL_NAMESPACES) {
    if (!type.startsWith(namespace)) continue;
    return BLOCKED_OFFICE_RELATIONSHIP_NAMES.has(type.slice(namespace.length));
  }
  return false;
}

function hasSupportedRelationshipNamespace(value) {
  const type = String(value || '').toLowerCase();
  return [...OFFICE_REL_NAMESPACES, ...PACKAGE_REL_NAMESPACES]
    .some((namespace) => type.startsWith(namespace) && type.length > namespace.length);
}

function validateOpcControls({ declaredType, entries, controlParts }) {
  const expected = MAIN[declaredType];
  if (!expected || !(entries instanceof Set) || !controlParts || typeof controlParts !== 'object') {
    throw new OpcValidationError();
  }
  const contentTypes = parseXml(controlParts['[Content_Types].xml'], CONTENT_TYPES_NS, 'Types');
  const rootRelationships = parseXml(controlParts['_rels/.rels'], RELATIONSHIPS_NS, 'Relationships');

  const overrides = new Map();
  for (const node of elements(contentTypes, CONTENT_TYPES_NS, 'Override')) {
    const partName = String(attribute(node, 'PartName'));
    const contentType = String(attribute(node, 'ContentType'));
    if (!partName.startsWith('/') || !contentType || overrides.has(partName)) throw new OpcValidationError();
    overrides.set(partName, contentType);
  }
  if (!expected.contentTypes.has(overrides.get(`/${expected.part}`))) throw new OpcValidationError('SOURCE_TYPE_MISMATCH');

  const office = [];
  for (const [name, xml] of Object.entries(controlParts)) {
    if (!name.endsWith('.rels')) continue;
    const relationships = parseXml(xml, RELATIONSHIPS_NS, 'Relationships');
    const ids = new Set();
    for (const node of elements(relationships, RELATIONSHIPS_NS, 'Relationship')) {
      const id = String(attribute(node, 'Id'));
      const type = String(attribute(node, 'Type'));
      const target = String(attribute(node, 'Target'));
      if (!id || !type || !target || ids.has(id)) throw new OpcValidationError();
      ids.add(id);
      if (String(attribute(node, 'TargetMode')).toLowerCase() === 'external') {
        throw new OpcValidationError('SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
      }
      if (isBlockedRelationshipType(type)) {
        throw new OpcValidationError('SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
      }
      if (!hasSupportedRelationshipNamespace(type)) {
        throw new OpcValidationError('SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
      }
      const resolvedTarget = resolveRelationshipTarget(name, target);
      if (!resolvedTarget || !entries.has(resolvedTarget)) throw new OpcValidationError();
      if (name === '_rels/.rels' && OFFICE_REL_TYPES.has(type)) office.push(resolvedTarget);
    }
  }
  if (office.length !== 1 || office[0] !== expected.part || !entries.has(expected.part)) {
    throw new OpcValidationError('SOURCE_TYPE_MISMATCH');
  }
  return Object.freeze({ ooxml_type: declaredType, controls_verified: true, relationships_verified: true, crc_verified: true });
}

module.exports = Object.freeze({ validateOpcControls, OpcValidationError });
