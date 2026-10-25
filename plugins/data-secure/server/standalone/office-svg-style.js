'use strict';

// Closed, offline SVG paint-style compiler, not a browser CSS interpreter.
// SVG 2 styling / CSS Cascade 4: presentation attributes remain the lowest
// author priority; matched normal rules are ordered by specificity then source
// order, and normal inline declarations win. Only explicit declarations are
// materialized, so the SVG renderer still performs ordinary SVG inheritance
// (including through <g>/<use>) and opacity compositing, not a copied value per
// child. Unsupported CSS rejects the visual; it is never silently discarded.
const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const XML = 'http://www.w3.org/XML/1998/namespace';
const LIMITS = Object.freeze({ bytes: 262144, rules: 1024, selectors: 4096, declarations: 8192,
  selector_parts: 16, operations: 1000000, records: 40000, value_length: 1024, output_bytes: 4 * 1024 * 1024 });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const unsupported = () => fail('VISUAL_FEATURE_UNSUPPORTED');
const limit = () => fail('VISUAL_PROCESSING_LIMIT');
const SPACE = /[ \t\r\n]+/u;
const IDENT = '[A-Za-z_-][A-Za-z0-9_-]{0,127}';
const BASIC_COLORS = new Set(['black', 'silver', 'gray', 'white', 'maroon', 'red', 'purple', 'fuchsia',
  'green', 'lime', 'olive', 'yellow', 'navy', 'blue', 'teal', 'aqua', 'transparent', 'currentcolor']);
const ENUMS = Object.freeze({ 'fill-rule': ['nonzero', 'evenodd'], 'clip-rule': ['nonzero', 'evenodd'],
  'stroke-linecap': ['butt', 'round', 'square'], 'stroke-linejoin': ['miter', 'round', 'bevel'],
  display: ['inline', 'none'], visibility: ['visible', 'hidden', 'collapse'] });
const NUMBER = /^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/u;
function scalar(value, minimum, maximum, suffixes = []) {
  let number = value;
  for (const suffix of suffixes) if (value.endsWith(suffix)) { number = value.slice(0, -suffix.length); break; }
  if (!NUMBER.test(number)) return false;
  const n = Number(number);
  return Number.isFinite(n) && n >= minimum && n <= maximum;
}
function color(value) {
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu.test(value) || BASIC_COLORS.has(value.toLowerCase())) return true;
  const match = /^(rgb|rgba)\(([ \t\r\n0-9.,%+-]+)\)$/iu.exec(value);
  if (!match) return false;
  const components = match[2].split(',').map(component => component.trim());
  if (components.length !== (match[1].toLowerCase() === 'rgba' ? 4 : 3)) return false;
  // The supported legacy comma grammar has either three number channels or
  // three percentage channels; mixed modern color syntax is a separate model.
  const percentages = components.slice(0, 3).map(component => component.endsWith('%'));
  if (!percentages.every(item => item === percentages[0])) return false;
  return components.slice(0, 3).every(component => scalar(component, 0, percentages[0] ? 100 : 255, percentages[0] ? ['%'] : [])) &&
    (components.length === 3 || scalar(components[3], 0, 1));
}
function validValue(property, value) {
  if (value.length > LIMITS.value_length) limit();
  // The fixed renderer supports ordinary inherited paint, but not explicit
  // opacity inheritance (it loses the child opacity before group compositing).
  // initial/unset/revert likewise cannot safely enter this closed subset.
  const keyword = value.toLowerCase();
  const supported = ['fill', 'stroke', 'color', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-width',
    'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', ...Object.keys(ENUMS)];
  if (!supported.includes(property)) return false;
  if (keyword === 'inherit') return property !== 'opacity';
  if (['fill', 'stroke'].includes(property)) return keyword === 'none' || color(value);
  if (property === 'color') return color(value);
  if (['opacity', 'fill-opacity', 'stroke-opacity'].includes(property)) return scalar(value, 0, 1);
  if (property === 'stroke-width') return scalar(value, 0, 1000000, ['px', '%']);
  if (property === 'stroke-miterlimit') return scalar(value, 1, 1000000);
  if (property === 'stroke-dashoffset') return scalar(value, -1000000, 1000000, ['px', '%']);
  if (property === 'stroke-dasharray') {
    if (keyword === 'none') return true;
    if (/^,|,$|,[ \t\r\n]*,/u.test(value)) return false;
    const numbers = value.split(/[ ,\t\r\n]+/u);
    return numbers.length <= 128 && numbers.every(number => scalar(number, 0, 1000000));
  }
  return ENUMS[property]?.includes(keyword) || false;
}
function cssText(value) {
  // No imports, escapes, custom properties, executable functions or references
  // can enter the renderer. Comments are replaced by whitespace, never joined.
  if (/[\\@!]|url[ \t\r\n]*\(/iu.test(value)) unsupported();
  const result = value.replace(/\/\*[\s\S]*?\*\//gu, ' ');
  if (/\/\*|\*\//u.test(result)) unsupported();
  return result;
}
function declarations(source, budget) {
  const result = new Map();
  for (const entry of source.split(';')) {
    if (!entry.trim()) continue;
    if (++budget.declarations > LIMITS.declarations) limit();
    const match = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/su.exec(entry);
    if (!match || !validValue(match[1].toLowerCase(), match[2].toLowerCase())) unsupported();
    const value = match[2].toLowerCase();
    // The fixed SVG backend uses SVG's canonical currentColor spelling.
    result.set(match[1].toLowerCase(), value === 'currentcolor' ? 'currentColor' : value); // repeated property: last wins
  }
  return result;
}
function selector(source) {
  const match = new RegExp(`^(\\*|${IDENT})?((?:[.#]${IDENT})*)$`, 'u').exec(source);
  if (!match || !match[0]) unsupported();
  const parts = [...match[2].matchAll(new RegExp(`([.#])(${IDENT})`, 'gu'))];
  if (parts.length > LIMITS.selector_parts) limit();
  return { type: match[1] && match[1] !== '*' ? match[1] : null,
    ids: parts.filter(part => part[1] === '#').map(part => part[2]),
    classes: parts.filter(part => part[1] === '.').map(part => part[2]),
    specificity: [parts.filter(part => part[1] === '#').length, parts.filter(part => part[1] === '.').length,
      match[1] && match[1] !== '*' ? 1 : 0] };
}
function stylesheet(source, rules, budget) {
  const text = cssText(source);
  let cursor = 0;
  while (cursor < text.length) {
    while (/[ \t\r\n]/u.test(text[cursor] || '') && cursor < text.length) cursor++;
    if (cursor === text.length) break;
    if (++budget.rules > LIMITS.rules) limit();
    const open = text.indexOf('{', cursor), close = text.indexOf('}', open + 1);
    if (open < 0 || close < 0 || /[{}]/u.test(text.slice(open + 1, close))) unsupported();
    const selectors = text.slice(cursor, open).split(',').map(value => selector(value.trim()));
    budget.selectors += selectors.length; if (budget.selectors > LIMITS.selectors) limit();
    rules.push({ selectors, values: declarations(text.slice(open + 1, close), budget) });
    cursor = close + 1;
  }
}
const greaterOrEqual = (a, b) => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));

function flattenStaticSvgStyles(source, { readXml, decode, error }) {
  const records = [], styles = [], rules = [], budget = { rules: 0, selectors: 0, declarations: 0, operations: 0 };
  let cssBytes = 0;
  const record = entry => { if (records.length >= LIMITS.records) limit(); records.push(entry); };
  readXml(source, { decode, error, start(node) {
    if (node.namespaceURI !== SVG || node.parent?.localName === 'style') unsupported();
    if (node.localName === 'style') {
      for (const [key, value] of node.attributes) {
        if (!((key === '{}type' && value.toLowerCase() === 'text/css') || (key === '{}media' && value === 'all'))) unsupported();
      }
      node.staticCss = ''; styles.push(node);
    }
    record({ kind: 'start', node });
  }, text(value, node) {
    if (node.localName === 'style') {
      cssBytes += Buffer.byteLength(value); if (cssBytes > LIMITS.bytes) limit();
      node.staticCss += value;
    } else if (value) record({ kind: 'text', value });
  }, end(node) { record({ kind: 'end', node }); } });
  for (const node of styles) stylesheet(node.staticCss, rules, budget);

  const parts = [], encode = value => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
  let outputLength = 0;
  const add = part => { outputLength += Buffer.byteLength(part); if (outputLength > LIMITS.output_bytes) limit(); parts.push(part); };
  for (const record of records) {
    const { node } = record;
    if (node?.localName === 'style') continue;
    if (record.kind === 'text') { add(encode(record.value)); continue; }
    if (record.kind === 'end') { add(`</${node.localName}>`); continue; }
    const winners = new Map(), classes = new Set((node.attributes.get('{}class') || '').trim().split(SPACE));
    const id = node.attributes.get('{}id');
    for (const rule of rules) for (const selected of rule.selectors) {
      if (++budget.operations > LIMITS.operations) limit();
      if ((selected.type && selected.type !== node.localName) || !selected.ids.every(value => value === id) ||
          !selected.classes.every(value => classes.has(value))) continue;
      for (const [property, value] of rule.values) {
        if (++budget.operations > LIMITS.operations) limit();
        const previous = winners.get(property);
        if (!previous || greaterOrEqual(selected.specificity, previous.specificity)) winners.set(property, { value, specificity: selected.specificity });
      }
    }
    const inline = node.attributes.get('{}style');
    if (inline !== undefined) {
      cssBytes += Buffer.byteLength(inline); if (cssBytes > LIMITS.bytes) limit();
      for (const [property, value] of declarations(cssText(inline), budget)) winners.set(property, { value });
    }
    const attributes = [];
    for (const [key, value] of node.attributes) {
      if (key === '{}style') continue;
      const ns = key.slice(1, key.indexOf('}')), local = key.slice(key.indexOf('}') + 1);
      if (ns && ![XLINK, XML].includes(ns)) unsupported();
      attributes.push(`${ns === XLINK ? 'xlink:' : ns === XML ? 'xml:' : ''}${local}="${encode(value)}"`);
    }
    if (!node.parent) attributes.push(`xmlns="${SVG}"`, `xmlns:xlink="${XLINK}"`);
    if (winners.size) attributes.push(`style="${encode([...winners].map(([property, item]) => `${property}:${item.value}`).join(';'))}"`);
    add(`<${node.localName}${attributes.length ? ' ' + attributes.join(' ') : ''}>`);
  }
  return parts.join('');
}

// Check the two known backend inheritance gaps after the author cascade has
// been materialized. Never replace group opacity with copied child values.
// These checks also cover equivalent presentation/inline syntax without an
// embedded sheet; the strict XML/reference preflight has already completed.
function assertStaticSvgPaintSemantics(source, { readXml, decode, error }) {
  // XML character references may spell a CSS property name inside style="".
  // Only skip this bounded pass when neither literal names nor entities occur.
  if (!/opacity|visibility|&/iu.test(source)) return;
  const nodes = [], ids = new Map();
  const relevant = (property, value) => {
    const keyword = value.trim().toLowerCase();
    if (['initial', 'unset', 'revert', 'revert-layer'].includes(keyword)) unsupported();
    if (keyword === 'inherit') return keyword;
    if (property === 'visibility') return ['visible', 'hidden', 'collapse'].includes(keyword) ? keyword : undefined;
    return NUMBER.test(keyword) && Number.isFinite(Number(keyword)) ? keyword : undefined;
  };
  const declared = (node, property) => {
    let value = relevant(property, node.attributes.get(`{}${property}`) || '');
    // Only top-level declaration separators count. A quoted font name or a
    // function argument must not invent a visibility/opacity declaration.
    const inline = node.attributes.get('{}style') || '';
    let quote = null, depth = 0, start = 0;
    const entry = text => {
      const match = /^\s*(opacity|visibility)\s*:\s*(.*?)\s*$/isu.exec(text);
      if (match && match[1].toLowerCase() === property) {
        const selected = relevant(property, match[2]);
        if (selected !== undefined) value = selected; // invalid declarations do not win
      }
    };
    for (let i = 0; i < inline.length; i++) {
      const ch = inline[i];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { if (!depth) unsupported(); depth--; }
      else if (ch === ';' && !depth) { entry(inline.slice(start, i)); start = i + 1; }
    }
    if (quote || depth) unsupported();
    entry(inline.slice(start));
    return value;
  };
  readXml(source, { decode, error, start(node) {
    if (nodes.length >= LIMITS.records) limit();
    node.paintChildren = [];
    node.paintVisibility = declared(node, 'visibility');
    if (declared(node, 'opacity') === 'inherit') unsupported();
    if (node.parent) node.parent.paintChildren.push(node);
    nodes.push(node);
    const id = node.attributes.get('{}id'); if (id) ids.set(id, node);
  } });
  const pending = [{ node: nodes[0], hidden: false, depth: 0 }];
  let operations = 0;
  while (pending.length) {
    if (++operations > LIMITS.records) limit();
    const { node, hidden, depth } = pending.pop();
    if (depth >= 128) limit();
    // This renderer prunes hidden containers before a visible child can
    // override inheritance. Refuse that exact model, including use shadows.
    if (hidden && node.paintVisibility === 'visible') unsupported();
    const nextHidden = hidden || ['hidden', 'collapse'].includes(node.paintVisibility);
    for (const child of node.paintChildren) pending.push({ node: child, hidden: nextHidden, depth: depth + 1 });
    if (node.localName === 'use') {
      const href = node.attributes.get('{}href') ?? node.attributes.get(`{${XLINK}}href`);
      const target = href && ids.get(href.slice(1));
      if (target) pending.push({ node: target, hidden: nextHidden, depth: depth + 1 });
    }
  }
}

module.exports = Object.freeze({ flattenStaticSvgStyles, assertStaticSvgPaintSemantics, staticSvgStyleLimits: LIMITS });
