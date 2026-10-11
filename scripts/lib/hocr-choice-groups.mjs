// Engineering-only parser for Tesseract's lstm_choice_mode=2 diagnostics.
// Scan each tag once; nested quantifiers over untrusted/malformed hOCR can
// otherwise backtrack exponentially. This is not a general HTML renderer.
export function hocrChoiceGroups(hocr) {
  if (typeof hocr !== 'string' || hocr.length > 16 * 1024 * 1024) throw Error('HOCR_DIAGNOSTIC_LIMIT');
  const groups = [], stack = [];
  const attributes = tag => Object.fromEntries(Array.from(tag.matchAll(/\b(class|id|title)=(['"])([^'"]*)\2/gu), match => [match[1], match[3]]));
  const decode = value => value.replace(/&(?:amp|lt|gt|quot|apos|#x[a-f0-9]+|#[0-9]+);/giu, match => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (Object.hasOwn(named, match)) return named[match];
    if (!match.startsWith('&#')) return match;
    const hex = match[2].toLowerCase() === 'x';
    const code = Number.parseInt(match.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  });
  let cursor = 0;
  while (cursor < hocr.length) {
    const start = hocr.indexOf('<', cursor);
    if (start < 0) break;
    const end = hocr.indexOf('>', start + 1);
    if (end < 0) break;
    if (end - start > 4096) throw Error('HOCR_DIAGNOSTIC_LIMIT');
    const tag = hocr.slice(start, end + 1);
    if (tag === '</span>') {
      const entry = stack.pop();
      if (entry?.kind === 'choice' && entry.parent?.kind === 'group') {
        const text = hocr.slice(entry.start, start);
        if (!text.includes('<')) entry.parent.values.push(decode(text));
      } else if (entry?.kind === 'group' && entry.values.length) {
        if (groups.length >= 100000) throw Error('HOCR_DIAGNOSTIC_LIMIT');
        groups.push(entry.values);
      }
    } else if (tag.startsWith('<span ') || tag === '<span>') {
      if (stack.length >= 128) throw Error('HOCR_DIAGNOSTIC_LIMIT');
      const { class: classes, id = '', title = '' } = attributes(tag), parent = stack.at(-1);
      const kind = classes === 'ocrx_cinfo' && id.startsWith('lstm_choices_') ? 'group'
        : parent?.kind === 'group' && classes === 'ocrx_cinfo' && id.startsWith('choice_') && title.startsWith('x_confs ') ? 'choice' : 'other';
      stack.push({ kind, parent, start: end + 1, ...(kind === 'group' ? { values: [] } : {}) });
    }
    cursor = end + 1;
  }
  return groups;
}
