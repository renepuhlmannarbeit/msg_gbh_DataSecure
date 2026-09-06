'use strict';

// Cursor/stack tokenization follows the existing Word and OPC readers. This
// event-only reader retains no document tree and has no DTD/entity resolver.
// Consumers supply their existing character decoder and fixed error factory.
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const SPACE = /[ \t\r\n]/u;
const INVALID_CHAR = /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u;

function readXml(source, { decode, error, start, text, end }) {
  if (typeof source !== 'string' || !source || INVALID_CHAR.test(source)) throw error();
  const tag = /<(\/)?([A-Za-z_][\w.:-]*)(?=[ \t\r\n/>])((?:[^<>"']|"[^"<]*"|'[^'<]*')*)>/y;
  const attribute = /([A-Za-z_][\w.:-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<]*)"|'([^'<]*)')/y;
  const stack = [];
  let cursor = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const initialCursor = cursor;
  let root = null, closed = false, elements = 0, attributesCount = 0;
  function name(qname, namespaces, isAttribute = false) {
    const parts = qname.split(':');
    if (parts.length > 2 || parts.some(part => !/^[A-Za-z_][\w.-]*$/u.test(part))) throw error();
    const prefix = parts.length === 2 ? parts[0] : '';
    if (prefix && !namespaces.get(prefix)) throw error();
    return { localName: parts.at(-1), namespaceURI: prefix ? namespaces.get(prefix) : (isAttribute ? '' : namespaces.get('') || '') };
  }
  while (cursor < source.length) {
    if (source[cursor] !== '<') {
      const next = source.indexOf('<', cursor), limit = next < 0 ? source.length : next;
      const raw = source.slice(cursor, limit);
      if (raw.includes(']]>') || (!stack.length && /[^ \t\r\n]/u.test(raw))) throw error();
      const value = decode(raw);
      if (stack.length) text?.(value, stack.at(-1));
      cursor = limit;
      continue;
    }
    if (source.startsWith('<!--', cursor)) {
      const limit = source.indexOf('-->', cursor + 4);
      if (limit < 0 || source.slice(cursor + 4, limit).includes('--') || source[limit - 1] === '-') throw error();
      cursor = limit + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', cursor)) {
      const limit = source.indexOf(']]>', cursor + 9);
      if (limit < 0 || !stack.length) throw error();
      text?.(source.slice(cursor + 9, limit), stack.at(-1));
      cursor = limit + 3;
      continue;
    }
    if (source.startsWith('<?', cursor)) {
      const limit = source.indexOf('?>', cursor + 2);
      if (limit < 0) throw error();
      const body = source.slice(cursor + 2, limit);
      const target = /^([A-Za-z_][\w.:-]*)(?=[ \t\r\n]|$)/u.exec(body)?.[1];
      if (!target) throw error();
      if (target.toLowerCase() === 'xml') {
        // XML declaration is legal only at the beginning; XML 1.0 UTF-8 is
        // the supported OOXML encoding contract, independently of coverage.
        if (target !== 'xml' || cursor !== initialCursor ||
            !/^xml[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(["'])1\.0\1(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(["'])[Uu][Tt][Ff]-8\2)?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(["'])(?:yes|no)\3)?[ \t\r\n]*$/u.test(body)) throw error();
      }
      cursor = limit + 2;
      continue;
    }
    // DTDs, entity declarations and all other declarations are unsupported.
    if (source.startsWith('<!', cursor)) throw error();
    tag.lastIndex = cursor;
    const token = tag.exec(source);
    if (!token) throw error();
    cursor = tag.lastIndex;
    const [, closing, qname, rawAttributes] = token;
    const selfClosing = rawAttributes.endsWith('/');
    const raw = selfClosing ? rawAttributes.slice(0, -1) : rawAttributes;
    if (closing) {
      if (selfClosing || /[^ \t\r\n]/u.test(raw) || stack.at(-1)?.qname !== qname) throw error();
      const node = stack.pop();
      end?.(node);
      if (!stack.length) closed = true;
      continue;
    }
    if (closed) throw error();
    if (++elements > 1000000 || stack.length >= 128) throw error(true);
    const parsed = new Map();
    let offset = 0;
    while (offset < raw.length) {
      if (!SPACE.test(raw[offset])) throw error();
      while (offset < raw.length && SPACE.test(raw[offset])) offset++;
      if (offset === raw.length) break;
      attribute.lastIndex = offset;
      const match = attribute.exec(raw);
      if (!match || parsed.has(match[1])) throw error();
      if (++attributesCount > 2000000 || parsed.size >= 256) throw error(true);
      parsed.set(match[1], decode(match[2] ?? match[3]));
      offset = attribute.lastIndex;
    }
    const inherited = stack.at(-1)?.namespaces || new Map([['xml', XML_NS]]);
    let namespaces = inherited;
    for (const [key, value] of parsed) {
      if (key !== 'xmlns' && !key.startsWith('xmlns:')) continue;
      if (namespaces === inherited) namespaces = new Map(inherited);
      const prefix = key === 'xmlns' ? '' : key.slice(6);
      if ((prefix && !/^[A-Za-z_][\w.-]*$/u.test(prefix)) || prefix === 'xmlns' ||
          value === XMLNS_NS || (prefix === 'xml') !== (value === XML_NS) || (prefix && !value)) throw error();
      namespaces.set(prefix, value);
      if (namespaces.size > 256) throw error(true);
    }
    const attributes = new Map();
    for (const [key, value] of parsed) {
      if (key === 'xmlns' || key.startsWith('xmlns:')) continue;
      const resolved = name(key, namespaces, true);
      const expanded = `{${resolved.namespaceURI}}${resolved.localName}`;
      if (attributes.has(expanded)) throw error();
      attributes.set(expanded, value);
    }
    const node = { qname, ...name(qname, namespaces), namespaces, attributes, parent: stack.at(-1) || null };
    root ??= node;
    start?.(node);
    if (selfClosing) { end?.(node); if (!stack.length) closed = true; }
    else stack.push(node);
  }
  if (!root || stack.length || !closed) throw error();
  return root;
}

module.exports = Object.freeze({ readXml });
